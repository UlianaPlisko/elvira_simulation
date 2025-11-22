#include "client-request.h"
#include "ns3/uinteger.h"
#include "ns3/log.h"
#include "ns3/packet.h"
#include "simple-header.inc" // или simple-header.h, если у тебя real header
#include "ns3/inet-socket-address.h"
#include "ns3/ipv4.h"
#include "ns3/ipv4-address.h"
#include "ns3/simulator.h"
#include <iostream>

namespace ns3 {

NS_OBJECT_ENSURE_REGISTERED (ClientRequestApp);

TypeId
ClientRequestApp::GetTypeId (void)
{
  static TypeId tid = TypeId ("ns3::ClientRequestApp")
    .SetParent<Application> ()
    .AddConstructor<ClientRequestApp> ();
  return tid;
}

ClientRequestApp::ClientRequestApp ()
  : m_socket (0),
    m_target (Ipv4Address("0.0.0.0")),
    m_port (0),
    m_contentId (0),
    m_repeat (1),
    m_interval (1.0),
    m_sentCount (0)
{}

ClientRequestApp::~ClientRequestApp ()
{
  m_socket = 0;
}

void
ClientRequestApp::Setup(Ipv4Address target, uint16_t port, uint32_t contentId,
                       uint32_t repeat, double interval)
{
  m_target = target;
  m_port = port;
  m_contentId = contentId;
  m_repeat = repeat;
  m_interval = interval;
}

void
ClientRequestApp::StartApplication (void)
{
  if (!m_socket) {
    m_socket = Socket::CreateSocket (GetNode (), UdpSocketFactory::GetTypeId ());
    // bind to ephemeral port so we can receive replies
    InetSocketAddress local = InetSocketAddress (Ipv4Address::GetAny (), 0);
    if (m_socket->Bind (local) != 0) {
      std::cerr << "ClientRequestApp: bind failed" << std::endl;
    }
    m_socket->SetRecvCallback (MakeCallback (&ClientRequestApp::HandleRead, this));
  }

  // schedule first send shortly after start
  Simulator::Schedule (Seconds (0.1), &ClientRequestApp::SendRequest, this);
  std::cout << "ClientRequestApp started on node " << GetNode()->GetId() 
            << " target=" << m_target << " port=" << m_port << std::endl;
}

void
ClientRequestApp::StopApplication (void)
{
  if (m_socket) {
    m_socket->Close ();
    m_socket = 0;
  }
  Simulator::Cancel (m_sendEvent);
  std::cout << "ClientRequestApp stopped on node " << GetNode()->GetId() << std::endl;
}

void
ClientRequestApp::SendRequest (void)
{
  if (m_sentCount >= m_repeat) return;

  // build REQ header (timestamp optional)
  uint64_t ts = Simulator::Now().GetNanoSeconds();
  SimpleHeader hdr(SimpleHeader::REQ, m_contentId, 0, ts);
  Ptr<Packet> p = Create<Packet> (0);
  p->AddHeader(hdr);

  InetSocketAddress dst (m_target, m_port);
  Ptr<Socket> s = m_socket ? m_socket : Socket::CreateSocket (GetNode (), UdpSocketFactory::GetTypeId ());
  int res = s->SendTo (p, 0, dst);
  if (res <= 0) {
    std::cout << "ClientRequestApp: SendTo returned " << res << std::endl;
  } else {
    m_sendTime[m_contentId] = Simulator::Now();
    m_sentCount++;
    std::cout << "ClientRequestApp: sent REQ content=" << m_contentId
              << " from node " << GetNode()->GetId()
              << " at " << Simulator::Now().GetSeconds() << "s" << std::endl;
  }

  if (m_sentCount < m_repeat && m_sendEvent.IsExpired()) {
    m_sendEvent = Simulator::Schedule (Seconds (m_interval), &ClientRequestApp::SendRequest, this);
  }
}

void
ClientRequestApp::HandleRead (Ptr<Socket> socket)
{
  Address from;
  Ptr<Packet> packet = socket->RecvFrom (from);
  InetSocketAddress sender = InetSocketAddress::ConvertFrom(from);

  SimpleHeader hdr;
  packet->RemoveHeader(hdr);

  if (hdr.GetType() == SimpleHeader::DATA) {
    uint32_t cid = hdr.GetContentId();
    auto it = m_sendTime.find(cid);
    if (it != m_sendTime.end()) {
      Time rtt = Simulator::Now() - it->second;
      std::cout << "ClientRequestApp: got DATA for content=" << cid
                << " size=" << hdr.GetObjectSize()
                << " from " << sender.GetIpv4()
                << " RTT=" << rtt.GetMilliSeconds() << " ms"
                << " at " << Simulator::Now().GetSeconds() << "s" << std::endl;
      // optionally erase so duplicates don't re-report
      m_sendTime.erase(it);
    } else {
      std::cout << "ClientRequestApp: got DATA for unknown content=" << cid << std::endl;
    }
  } else {
    std::cout << "ClientRequestApp: got non-DATA header type=" << static_cast<int>(hdr.GetType()) << std::endl;
  }
}

} // namespace ns3
