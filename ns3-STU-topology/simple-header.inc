#ifndef SIMPLE_HEADER_INC
#define SIMPLE_HEADER_INC

#include "simple-header.h"
#include "ns3/buffer.h"
#include "ns3/nstime.h"
#include "ns3/uinteger.h"
#include <arpa/inet.h> // for htonl/ntohl
#include <cstring>

namespace ns3 {

SimpleHeader::SimpleHeader()
  : m_type(REQ), m_contentId(0), m_objectSize(0), m_timestamp(0)
{}

SimpleHeader::SimpleHeader(MsgType t, uint32_t contentId, uint32_t size, uint64_t ts)
  : m_type(t), m_contentId(contentId), m_objectSize(size), m_timestamp(ts)
{}

TypeId
SimpleHeader::GetTypeId(void)
{
  static TypeId tid = TypeId("ns3::SimpleHeader")
    .SetParent<Header>()
    .AddConstructor<SimpleHeader>();
  return tid;
}

TypeId
SimpleHeader::GetInstanceTypeId(void) const
{
  return GetTypeId();
}

uint32_t
SimpleHeader::GetSerializedSize(void) const
{
  // 1 byte type + 4 bytes contentId + 4 bytes objectSize + 8 bytes timestamp = 17
  return 17;
}

void
SimpleHeader::Serialize(Buffer::Iterator start) const
{
  // write 1 byte type
  start.WriteU8(static_cast<uint8_t>(m_type));
  // write contentId (network byte order)
  uint32_t c = htonl(m_contentId);
  start.WriteU8((c >> 24) & 0xFF);
  start.WriteU8((c >> 16) & 0xFF);
  start.WriteU8((c >> 8) & 0xFF);
  start.WriteU8(c & 0xFF);
  // write objectSize
  uint32_t s = htonl(m_objectSize);
  start.WriteU8((s >> 24) & 0xFF);
  start.WriteU8((s >> 16) & 0xFF);
  start.WriteU8((s >> 8) & 0xFF);
  start.WriteU8(s & 0xFF);
  // write timestamp as two 32-bit network-order words (high, low)
  uint32_t hi = htonl(static_cast<uint32_t>(m_timestamp >> 32));
  uint32_t lo = htonl(static_cast<uint32_t>(m_timestamp & 0xFFFFFFFFULL));
  start.WriteU8((hi >> 24) & 0xFF);
  start.WriteU8((hi >> 16) & 0xFF);
  start.WriteU8((hi >> 8) & 0xFF);
  start.WriteU8(hi & 0xFF);
  start.WriteU8((lo >> 24) & 0xFF);
  start.WriteU8((lo >> 16) & 0xFF);
  start.WriteU8((lo >> 8) & 0xFF);
  start.WriteU8(lo & 0xFF);
}

uint32_t
SimpleHeader::Deserialize(Buffer::Iterator start)
{
  // read 1 byte type
  uint8_t t = start.ReadU8();
  m_type = static_cast<MsgType>(t);
  // read contentId
  uint32_t c = 0;
  c |= static_cast<uint32_t>(start.ReadU8()) << 24;
  c |= static_cast<uint32_t>(start.ReadU8()) << 16;
  c |= static_cast<uint32_t>(start.ReadU8()) << 8;
  c |= static_cast<uint32_t>(start.ReadU8());
  m_contentId = ntohl(c);
  // read objectSize
  uint32_t s = 0;
  s |= static_cast<uint32_t>(start.ReadU8()) << 24;
  s |= static_cast<uint32_t>(start.ReadU8()) << 16;
  s |= static_cast<uint32_t>(start.ReadU8()) << 8;
  s |= static_cast<uint32_t>(start.ReadU8());
  m_objectSize = ntohl(s);
  // read timestamp (hi, lo)
  uint32_t hi = 0, lo = 0;
  hi |= static_cast<uint32_t>(start.ReadU8()) << 24;
  hi |= static_cast<uint32_t>(start.ReadU8()) << 16;
  hi |= static_cast<uint32_t>(start.ReadU8()) << 8;
  hi |= static_cast<uint32_t>(start.ReadU8());
  lo |= static_cast<uint32_t>(start.ReadU8()) << 24;
  lo |= static_cast<uint32_t>(start.ReadU8()) << 16;
  lo |= static_cast<uint32_t>(start.ReadU8()) << 8;
  lo |= static_cast<uint32_t>(start.ReadU8());
  hi = ntohl(hi);
  lo = ntohl(lo);
  m_timestamp = (static_cast<uint64_t>(hi) << 32) | static_cast<uint64_t>(lo);
  return GetSerializedSize();
}

void
SimpleHeader::Print(std::ostream &os) const
{
  os << "SimpleHeader(Type=" << static_cast<int>(m_type)
     << " content=" << m_contentId
     << " size=" << m_objectSize
     << " ts=" << m_timestamp << ")";
}

} // namespace ns3
#endif // SIMPLE_HEADER_INC
