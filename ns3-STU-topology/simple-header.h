#ifndef SIMPLE_HEADER_H
#define SIMPLE_HEADER_H

#include "ns3/header.h"
#include <cstdint>

namespace ns3 {

class SimpleHeader : public Header
{
public:
    enum MsgType : uint8_t {
        REQ = 0,   
        DATA = 1  
    };

    SimpleHeader();
    SimpleHeader(MsgType t, uint32_t contentId, uint32_t size, uint64_t ts);

    static TypeId GetTypeId();
    virtual TypeId GetInstanceTypeId() const;

    virtual void Serialize(Buffer::Iterator start) const;
    virtual uint32_t Deserialize(Buffer::Iterator start);
    virtual uint32_t GetSerializedSize() const;
    virtual void Print(std::ostream &os) const;

    MsgType GetType() const { return m_type; }
    uint32_t GetContentId() const { return m_contentId; }
    uint32_t GetObjectSize() const { return m_objectSize; }
    uint64_t GetTimestamp() const { return m_timestamp; }

private:
    MsgType   m_type;
    uint32_t  m_contentId;
    uint32_t  m_objectSize;
    uint64_t  m_timestamp;
};

} 

#endif
