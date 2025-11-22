#include "cache-server.h"
#include "ns3/log.h"
#include "ns3/packet.h"
#include "ns3/inet-socket-address.h"
#include "ns3/ipv4.h"
#include "ns3/ipv4-address.h"
#include "ns3/simulator.h"
#include <iostream>

namespace ns3 {

NS_OBJECT_ENSURE_REGISTERED(CacheServerApp);

TypeId
CacheServerApp::GetTypeId(void)
{
  static TypeId tid = TypeId("ns3::CacheServerApp")
    .SetParent<Application>()
    .AddConstructor<CacheServerApp>();
  return tid;
}

CacheServerApp::CacheServerApp()
  : m_socket(nullptr),
    m_port(0),
    m_cacheCapacity(0),
    m_cacheUsed(0),
    m_origin(Ipv4Address("0.0.0.0")),
    m_isOrigin(false),
    m_hits(0),
    m_misses(0)
{}

CacheServerApp::~CacheServerApp()
{
  m_socket = nullptr;
}

void
CacheServerApp::Setup(uint16_t port, uint32_t cacheCapacityBytes, Ipv4Address origin, bool isOrigin)
{
  m_port = port;
  m_cacheCapacity = cacheCapacityBytes;
  m_origin = origin;
  m_isOrigin = isOrigin;
}

void
CacheServerApp::StartApplication()
{
  if (!m_socket) {
    m_socket = Socket::CreateSocket(GetNode(), UdpSocketFactory::GetTypeId());
    InetSocketAddress local = InetSocketAddress(Ipv4Address::GetAny(), m_port);
    if (m_socket->Bind(local) != 0) {
      std::cerr << "CacheServerApp: bind failed on port " << m_port << std::endl;
    }
    m_socket->SetRecvCallback(MakeCallback(&CacheServerApp::HandleRead, this));
  }
  std::cout << "CacheServerApp started on node " << GetNode()->GetId() << " port " << m_port
            << " origin=" << m_origin << " isOrigin=" << m_isOrigin << std::endl;
}

void
CacheServerApp::StopApplication()
{
  if (m_socket) {
    m_socket->Close();
    m_socket = nullptr;
  }
  std::cout << "CacheServerApp stopping. hits=" << m_hits << " misses=" << m_misses
            << " cacheUsed=" << m_cacheUsed << "/" << m_cacheCapacity << std::endl;
}

// Helper: add DATA packet and send to dst
void
CacheServerApp::SendDataTo(const InetSocketAddress &dst, uint32_t contentId, uint32_t size)
{
  // create header
  uint64_t ts = Simulator::Now().GetNanoSeconds();
  SimpleHeader hdr(SimpleHeader::DATA, contentId, size, ts);
  Ptr<Packet> p = Create<Packet>(0);
  p->AddHeader(hdr);
  // send
  if (m_socket) {
    m_socket->SendTo(p, 0, dst);
  } else {
    Ptr<Socket> s = Socket::CreateSocket(GetNode(), UdpSocketFactory::GetTypeId());
    s->SendTo(p, 0, dst);
    s->Close();
  }
}

// When miss -> forward REQ to origin (remember original requester)
void
CacheServerApp::ForwardReqToOrigin(uint32_t contentId, const InetSocketAddress &originalRequester)
{
  // store requester
  m_pending[contentId].push_back(originalRequester);

  if (m_isOrigin) {
    // if this node is the origin, immediately generate DATA (simulate retrieval from disk)
    uint32_t objectSize = 1000 + (contentId % 1000); // simple deterministic size
    // simulate small service delay using Simulator::Schedule (optional)
    Simulator::Schedule(Seconds(0.001), &CacheServerApp::SendDataTo, this, originalRequester, contentId, objectSize);
    // origin might also not cache (or treat as permanent store)
    return;
  }

  // build REQ header and send to origin m_origin:m_port
  SimpleHeader req(SimpleHeader::REQ, contentId, 0, Simulator::Now().GetNanoSeconds());
  Ptr<Packet> p = Create<Packet>(0);
  p->AddHeader(req);
  InetSocketAddress originAddr(m_origin, m_port);

  // send via a temporary socket to origin (we use the same m_socket if available)
  if (m_socket) {
    m_socket->SendTo(p, 0, originAddr);
  } else {
    Ptr<Socket> s = Socket::CreateSocket(GetNode(), UdpSocketFactory::GetTypeId());
    s->SendTo(p, 0, originAddr);
    s->Close();
  }
}

void
CacheServerApp::InsertToCache(uint32_t contentId, uint32_t size)
{
  // if already cached, touch
  auto it = m_map.find(contentId);
  if (it != m_map.end()) {
    Touch(contentId);
    return;
  }
  // evict until space
  EvictIfNeeded(size);
  // insert front (most recent)
  m_lru.push_front(CacheItem{contentId, size});
  m_map[contentId] = m_lru.begin();
  m_cacheUsed += size;
}

void
CacheServerApp::EvictIfNeeded(uint32_t sizeNeeded)
{
  while (m_cacheUsed + sizeNeeded > m_cacheCapacity && !m_lru.empty()) {
    CacheItem back = m_lru.back();
    m_cacheUsed -= back.size;
    m_map.erase(back.contentId);
    m_lru.pop_back();
    // debug
    std::cout << "Evicted content " << back.contentId << " size=" << back.size << std::endl;
  }
}

void
CacheServerApp::Touch(uint32_t contentId)
{
  auto it = m_map.find(contentId);
  if (it == m_map.end()) return;
  auto lit = it->second;
  // move to front
  m_lru.splice(m_lru.begin(), m_lru, lit);
  m_map[contentId] = m_lru.begin();
}

void
CacheServerApp::HandleRead(Ptr<Socket> socket)
{
  Address from;
  Ptr<Packet> packet = socket->RecvFrom(from);
  InetSocketAddress sender = InetSocketAddress::ConvertFrom(from);

  // parse header
  SimpleHeader hdr;
  bool ok = false;
  // try RemoveHeader - if header present it will be removed and fill hdr
  packet->RemoveHeader(hdr);
  // now inspect
  if (hdr.GetType() == SimpleHeader::REQ) {
    uint32_t cid = hdr.GetContentId();
    // check cache
    auto it = m_map.find(cid);
    if (it != m_map.end()) {
      // hit
      ++m_hits;
      uint32_t size = it->second->size;
      // update LRU
      Touch(cid);
      // reply to requester
      SendDataTo(sender, cid, size);
      // debug
      std::cout << "Cache hit for " << cid << " reply to " << sender.GetIpv4() << std::endl;
    } else {
      // miss
      ++m_misses;
      // forward to origin and remember requester
      ForwardReqToOrigin(cid, sender);
      // debug
      std::cout << "Cache miss for " << cid << " forwarded to origin" << std::endl;
    }
    ok = true;
  } else if (hdr.GetType() == SimpleHeader::DATA) {
    // DATA arrived (from origin or other)
    uint32_t cid = hdr.GetContentId();
    uint32_t size = hdr.GetObjectSize();

    // if not origin (i.e., this could be a DATA returning to edge), we should cache and forward to pending requesters
    if (!m_isOrigin) {
      // cache the object
      InsertToCache(cid, size);
    }

    // find pending requesters and forward DATA
    auto pit = m_pending.find(cid);
    if (pit != m_pending.end()) {
      for (const InetSocketAddress &reqAddr : pit->second) {
        SendDataTo(reqAddr, cid, size);
      }
      m_pending.erase(pit);
    } else {
      // if no pending requester, we might ignore or log
    }
    ok = true;
  } else {
    // unknown type - ignore
    ok = false;
  }

  if (!ok) {
    // nothing
  }
}

} // namespace ns3
