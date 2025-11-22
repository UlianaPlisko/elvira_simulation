#ifndef CACHE_SERVER_H
#define CACHE_SERVER_H

#include "ns3/application.h"
#include "ns3/socket.h"
#include "ns3/ipv4-address.h"
#include "simple-header.h"

#include <unordered_map>
#include <list>
#include <vector>

namespace ns3 {

struct CacheItem {
  uint32_t contentId;
  uint32_t size;
};

class CacheServerApp : public Application {
public:
  static TypeId GetTypeId(void);
  CacheServerApp();
  virtual ~CacheServerApp();

  // Setup: port to listen, cacheCapacity in bytes, origin address, and isOrigin flag
  void Setup(uint16_t port, uint32_t cacheCapacityBytes, Ipv4Address origin, bool isOrigin = false);

protected:
  virtual void StartApplication() override;
  virtual void StopApplication() override;

private:
  void HandleRead(Ptr<Socket> socket);
  void SendDataTo(const InetSocketAddress &dst, uint32_t contentId, uint32_t size);
  void ForwardReqToOrigin(uint32_t contentId, const InetSocketAddress &originalRequester);
  void InsertToCache(uint32_t contentId, uint32_t size);
  void Touch(uint32_t contentId);
  void EvictIfNeeded(uint32_t sizeNeeded);

  Ptr<Socket> m_socket;
  uint16_t m_port;
  uint32_t m_cacheCapacity;
  uint32_t m_cacheUsed;
  Ipv4Address m_origin;
  bool m_isOrigin;

  // LRU structures
  std::list<CacheItem> m_lru; // front = most-recent
  std::unordered_map<uint32_t, std::list<CacheItem>::iterator> m_map;

  // pending requesters: contentId -> list of original requesters (InetSocketAddress)
  std::unordered_map<uint32_t, std::vector<InetSocketAddress>> m_pending;

  // stats
  uint64_t m_hits;
  uint64_t m_misses;
};

} // namespace ns3

#endif // CACHE_SERVER_H
