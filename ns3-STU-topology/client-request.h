#ifndef CLIENT_REQUEST_H
#define CLIENT_REQUEST_H

#include "ns3/application.h"
#include "ns3/socket.h"
#include "ns3/address.h"
#include "ns3/ptr.h"
#include "ns3/event-id.h"
#include "ns3/ipv4-address.h"
#include <map>

namespace ns3 {

class ClientRequestApp : public Application
{
public:
  static TypeId GetTypeId (void);
  ClientRequestApp ();
  virtual ~ClientRequestApp ();

  // target = IP of cache server (edge node), port = cache port,
  // contentId = which object to request,
  // repeat = how many requests, interval = seconds between requests
  void Setup(Ipv4Address target, uint16_t port, uint32_t contentId,
             uint32_t repeat = 1, double interval = 1.0);

protected:
  virtual void StartApplication (void) override;
  virtual void StopApplication (void) override;

private:
  void SendRequest (void);
  void HandleRead (Ptr<Socket> socket);

  Ptr<Socket>      m_socket;
  Ipv4Address      m_target;
  uint16_t         m_port;
  uint32_t         m_contentId;
  uint32_t         m_repeat;
  double           m_interval;
  EventId          m_sendEvent;
  std::map<uint32_t, Time> m_sendTime; // map contentId -> send time (simple test)
  uint32_t         m_sentCount;
};

} // namespace ns3

#endif // CLIENT_REQUEST_H
