/* topology-csv.cc
   Usage: ./waf --run "scratch/topology-csv --nodes=nodes.csv --links=links.csv --anim=animation.xml --scale=0.06 --testTraffic=1 --simTime=60"
   Robust version: strips UTF-8 BOM, prints parsing/info/warn to std::cout / std::cerr,
   safe FlowMonitor handling.
*/

#include "ns3/core-module.h"
#include "ns3/network-module.h"
#include "ns3/internet-module.h"
#include "ns3/point-to-point-module.h"
#include "ns3/applications-module.h"
#include "ns3/flow-monitor-module.h"
#include "ns3/netanim-module.h"
#include "simple-header.inc"
#include "cache-server.inc"
#include "client-request.inc"

#include <fstream>
#include <sstream>
#include <map>
#include <vector>
#include <iomanip>
#include <cmath>
#include <cctype>
#include <iostream> 
#include <cstdlib> 
#include <filesystem>

using std::filesystem::path;

using namespace ns3;

struct NodeInfo {
  std::string csvid;
  std::string name;
  std::string role;
  std::string address;
  double lat;
  double lon;
  std::string notes;
};

struct LinkInfo {
  std::string csvid;
  std::string src;
  std::string dst;
  std::string capacity; 
  double delay_ms;
  int hops;
  std::string notes;
};

static Ipv4Address GetFirstNonLoopbackIpv4(Ptr<Node> node)
{
  Ptr<Ipv4> ipv4 = node->GetObject<Ipv4>();
  if (!ipv4) return Ipv4Address("0.0.0.0");
  for (uint32_t ifIndex = 1; ifIndex < ipv4->GetNInterfaces(); ++ifIndex) {
    for (uint32_t a = 0; a < ipv4->GetNAddresses(ifIndex); ++a) {
      Ipv4InterfaceAddress ifAddr = ipv4->GetAddress(ifIndex, a);
      Ipv4Address addr = ifAddr.GetLocal();
      if (addr != Ipv4Address::GetLoopback() && addr != Ipv4Address("0.0.0.0")) {
        return addr;
      }
    }
  }
  return Ipv4Address("0.0.0.0");
}

static void StripUtf8Bom(std::string &s) {
  if (s.size() >= 3) {
    unsigned char b0 = static_cast<unsigned char>(s[0]);
    unsigned char b1 = static_cast<unsigned char>(s[1]);
    unsigned char b2 = static_cast<unsigned char>(s[2]);
    if (b0 == 0xEF && b1 == 0xBB && b2 == 0xBF) {
      s = s.substr(3);
    }
  }
}

static char DetectDelimiter(const std::string &line) {
  size_t commas = 0, semis = 0;
  bool inQuotes = false;
  for (size_t i = 0; i < line.size(); ++i) {
    char c = line[i];
    if (c == '"') { inQuotes = !inQuotes; continue; }
    if (!inQuotes) {
      if (c == ',') ++commas;
      else if (c == ';') ++semis;
    }
  }
  return (semis > commas) ? ';' : ',';
}

static std::vector<std::string> SplitCsvLine(const std::string &line, char delim = ',') {
  std::vector<std::string> out;
  std::string cur;
  bool inQuotes = false;
  for (size_t i = 0; i < line.size(); ++i) {
    char c = line[i];
    if (c == '"') {
      if (inQuotes && i + 1 < line.size() && line[i + 1] == '"') {
        cur.push_back('"');
        ++i; 
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (c == delim && !inQuotes) {
      out.push_back(cur);
      cur.clear();
    } else {
      cur.push_back(c);
    }
  }
  out.push_back(cur);
  for (auto &s : out) {
    size_t a = 0; while (a < s.size() && std::isspace((unsigned char)s[a])) ++a;
    size_t b = s.size(); while (b > a && std::isspace((unsigned char)s[b - 1])) --b;
    s = s.substr(a, b - a);
  }
  return out;
}

static bool ReadNodesCsv(const std::string &filename, std::vector<NodeInfo> &nodes) {
  std::ifstream f(filename.c_str(), std::ios::in);
  if (!f.is_open()) {
    std::cerr << "ERROR: Cannot open nodes file: " << filename << std::endl;
    return false;
  }
  std::string line;
  if (!std::getline(f, line)) {
    std::cerr << "ERROR: Empty nodes CSV: " << filename << std::endl;
    return false;
  }
  StripUtf8Bom(line); 
  char delim = DetectDelimiter(line);
  std::cout << "INFO: Detected CSV delimiter '" << delim << "' for " << filename << std::endl;

  uint32_t lineno = 1;
  while (std::getline(f, line)) {
    lineno++;
    if (line.empty()) continue;
    auto cols = SplitCsvLine(line, delim);
    if (cols.size() < 3) { std::cout << "WARN: Skipping short nodes row " << lineno << ": " << line << std::endl; continue; }
    NodeInfo n;
    n.csvid = cols.size() > 0 ? cols[0] : "";
    n.name  = cols.size() > 1 ? cols[1] : "";
    n.role  = cols.size() > 2 ? cols[2] : "";
    n.address = cols.size() > 3 ? cols[3] : "";
    try {
      n.lat = (cols.size() > 4 && !cols[4].empty()) ? std::stod(cols[4]) : std::numeric_limits<double>::quiet_NaN();
      n.lon = (cols.size() > 5 && !cols[5].empty()) ? std::stod(cols[5]) : std::numeric_limits<double>::quiet_NaN();
    } catch (...) {
      std::cout << "WARN: Bad lat/lon on line " << lineno << " -> left as NaN" << std::endl;
      n.lat = n.lon = std::numeric_limits<double>::quiet_NaN();
    }
    n.notes = cols.size() > 6 ? cols[6] : "";
    if (n.name.empty()) { std::cout << "WARN: Node with empty name skipped at line " << lineno << std::endl; continue; }
    nodes.push_back(n);
  }
  std::cout << "INFO: Parsed " << nodes.size() << " nodes from " << filename << std::endl;
  return true;
}

static bool ReadLinksCsv(const std::string &filename, std::vector<LinkInfo> &links) {
  std::ifstream f(filename.c_str(), std::ios::in);
  if (!f.is_open()) {
    std::cerr << "ERROR: Cannot open links file: " << filename << std::endl;
    return false;
  }
  std::string line;
  if (!std::getline(f, line)) {
    std::cerr << "ERROR: Empty links CSV: " << filename << std::endl;
    return false;
  }
  StripUtf8Bom(line);

  char delim = DetectDelimiter(line);
  std::cout << "INFO: Detected CSV delimiter '" << delim << "' for " << filename << std::endl;

  uint32_t lineno = 1;
  while (std::getline(f, line)) {
    lineno++;
    if (line.empty()) continue;
    auto cols = SplitCsvLine(line, delim);
    if (cols.size() < 3) { std::cout << "WARN: Skipping short links row " << lineno << ": " << line << std::endl; continue; }
    LinkInfo l;
    l.csvid = cols.size() > 0 ? cols[0] : "";
    l.src   = cols.size() > 1 ? cols[1] : "";
    l.dst   = cols.size() > 2 ? cols[2] : "";
    l.capacity = (cols.size() > 3 && !cols[3].empty()) ? cols[3] : "1Gbps";
    try {
      l.delay_ms = (cols.size() > 4 && !cols[4].empty()) ? std::stod(cols[4]) : 1.0;
    } catch (...) {
      l.delay_ms = 1.0;
      std::cout << "WARN: Bad delay_ms at line " << lineno << ", using 1.0ms" << std::endl;
    }
    l.hops = (cols.size() > 5 && !cols[5].empty()) ? std::stoi(cols[5]) : 1;
    l.notes = cols.size() > 6 ? cols[6] : "";
    if (l.src.empty() || l.dst.empty()) { std::cout << "WARN: Link with empty endpoints skipped at line " << lineno << std::endl; continue; }
    links.push_back(l);
  }
  std::cout << "INFO: Parsed " << links.size() << " links from " << filename << std::endl;
  return true;
}

static void LatLonToMeters(double lat0, double lon0, double lat, double lon, double &mx, double &my) {
  const double DEG_TO_RAD = 3.14159265358979323846 / 180.0;
  double lat0Rad = lat0 * DEG_TO_RAD;
  double metersPerDegLat = 111132.92 - 559.82 * std::cos(2.0 * lat0Rad) + 1.175 * std::cos(4.0 * lat0Rad);
  double metersPerDegLon = 111412.84 * std::cos(lat0Rad) - 93.5 * std::cos(3.0 * lat0Rad);
  my = (lat - lat0) * metersPerDegLat;
  mx = (lon - lon0) * metersPerDegLon;
}

int main (int argc, char *argv[]) {
  std::string nodesFile = "scratch/nodes.csv";
  std::string linksFile = "scratch/links.csv";
  std::string animFile  = "animation.xml";
  double scale =0.06; 
  bool enableTestTraffic = false;
  double simTime = 60.0;

  CommandLine cmd;
  cmd.AddValue("nodes", "CSV file with nodes", nodesFile);
  cmd.AddValue("links", "CSV file with links", linksFile);
  cmd.AddValue("anim", "NetAnim XML output filename", animFile);
  cmd.AddValue("scale", "Scale factor (meters -> anim units)", scale);
  cmd.AddValue("testTraffic", "1 to enable a tiny test OnOff traffic (optional)", enableTestTraffic);
  cmd.AddValue("simTime", "Simulation time in seconds", simTime);
  cmd.Parse (argc, argv);

  std::vector<NodeInfo> nodesCsv;
  std::vector<LinkInfo> linksCsv;

  if (!ReadNodesCsv(nodesFile, nodesCsv)) {
    std::cerr << "FATAL: Failed to read nodes CSV: " << nodesFile << std::endl;
    return 1;
  }
  if (!ReadLinksCsv(linksFile, linksCsv)) {
    std::cerr << "FATAL: Failed to read links CSV: " << linksFile << std::endl;
    return 1;
  }

   std::map<std::string, Ptr<Node>> nameToNode;
  NodeContainer allNodes;


  for (const auto &n : nodesCsv) {
    bool isCentral = (n.role.find("central") != std::string::npos) || (n.name == "CVT_STU");
    if (isCentral) continue;
    Ptr<Node> node = CreateObject<Node>();
    nameToNode[n.name] = node;
    allNodes.Add(node);
  }

  for (const auto &n : nodesCsv) {
    bool isCentral = (n.role.find("central") != std::string::npos) || (n.name == "CVT_STU");
    if (!isCentral) continue;
    Ptr<Node> node = CreateObject<Node>();
    nameToNode[n.name] = node;
    allNodes.Add(node);
  }

  std::cout << "INFO: Created " << allNodes.GetN() << " nodes (central created last to be on top)" << std::endl;

  InternetStackHelper internet;
  internet.Install(allNodes);

  std::vector<NetDeviceContainer> deviceContainers;
  std::vector<Ipv4InterfaceContainer> ifContainers;
  uint32_t linkIndex = 1;

  for (const auto &l : linksCsv) {
    auto itSrc = nameToNode.find(l.src);
    auto itDst = nameToNode.find(l.dst);
    if (itSrc == nameToNode.end()) {
      std::cout << "WARN: Link src not found: " << l.src << " (skipping)" << std::endl;
      continue;
    }
    if (itDst == nameToNode.end()) {
      std::cout << "WARN: Link dst not found: " << l.dst << " (skipping)" << std::endl;
      continue;
    }
    Ptr<Node> n1 = itSrc->second;
    Ptr<Node> n2 = itDst->second;

    PointToPointHelper p2p;
    std::string cap = l.capacity;
    if (cap.find("Gbps") == std::string::npos && cap.find("Mbps") == std::string::npos) {
      cap = "1Gbps";
      std::cout << "WARN: Capacity format odd for link " << l.csvid << ", using fallback 1Gbps" << std::endl;
    }
    p2p.SetDeviceAttribute("DataRate", StringValue(cap));
    std::ostringstream dms; dms << l.delay_ms << "ms";
    p2p.SetChannelAttribute("Delay", StringValue(dms.str()));

    NetDeviceContainer devs = p2p.Install(NodeContainer(n1, n2));
    deviceContainers.push_back(devs);

    std::ostringstream base; base << "10.1." << linkIndex << ".0";
    Ipv4AddressHelper ipv4;
    ipv4.SetBase(Ipv4Address(base.str().c_str()), "255.255.255.0");
    Ipv4InterfaceContainer ifc = ipv4.Assign(devs);
    ifContainers.push_back(ifc);

    ++linkIndex;
  }

    Ipv4GlobalRoutingHelper::PopulateRoutingTables();
    std::cout << "INFO: Routing tables populated" << std::endl;

    uint16_t cachePort = 9000;                
    uint32_t originCacheCapacity = 50 * 1024 * 1024; 
    uint32_t edgeCacheCapacity   = 2 * 1024 * 1024; 
    double appStart = 0.01; 

    Ptr<Node> centralNode = nullptr;
    for (const auto &ninfo : nodesCsv) {
    if (ninfo.role.find("central") != std::string::npos || ninfo.name == "CVT_STU") {
        auto it = nameToNode.find(ninfo.name);
        if (it != nameToNode.end()) { centralNode = it->second; break; }
    }
    }

    Ipv4Address centralIp = Ipv4Address::GetLoopback();
    if (centralNode) {
    centralIp = GetFirstNonLoopbackIpv4(centralNode);
    if (centralIp == Ipv4Address("0.0.0.0") || centralIp == Ipv4Address::GetLoopback()) {
        std::cout << "WARN: central found but no non-loopback IPv4 assigned yet (will attempt later)" << std::endl;
    } else {
        std::cout << "INFO: central IP = " << centralIp << std::endl;
    }
    } else {
    std::cout << "WARN: no central node found in CSV (no origin will be installed)" << std::endl;
    }


    if (centralNode) {
    Ptr<ns3::CacheServerApp> originApp = CreateObject<ns3::CacheServerApp>();
    originApp->Setup(cachePort, originCacheCapacity, Ipv4Address("0.0.0.0"), true);
    centralNode->AddApplication(originApp);
    originApp->SetStartTime(Seconds(appStart));
    originApp->SetStopTime(Seconds(simTime));
    std::cout << "INFO: Origin CacheServerApp installed on central node (nodeId=" << centralNode->GetId() << ")" << std::endl;
    }

    for (const auto &ninfo : nodesCsv) {
        if (ninfo.role.find("edge") != std::string::npos) {
            auto it = nameToNode.find(ninfo.name);
            if (it == nameToNode.end()) { std::cout << "WARN: edge node " << ninfo.name << " not found in nameToNode map\n"; continue; }
            Ptr<Node> edgeNode = it->second;
            Ptr<ns3::CacheServerApp> edgeApp = CreateObject<ns3::CacheServerApp>();
            edgeApp->Setup(cachePort, edgeCacheCapacity, centralIp, false);
            edgeNode->AddApplication(edgeApp);
            edgeApp->SetStartTime(Seconds(appStart + 0.01)); 
            edgeApp->SetStopTime(Seconds(simTime));
            std::cout << "INFO: CacheServerApp installed on edge " << ninfo.name << " (nodeId=" << edgeNode->GetId() << ")\n";
        }
    }

    uint32_t clientRepeat = 20;   
    double   clientInterval = 0.5; 
    double   clientStart = appStart + 0.2;
    double   clientStop  = simTime - 0.5;

    uint32_t clientsDeployed = 0;
    uint32_t maxClients = 0; 

    for (const auto &ninfo : nodesCsv) {
        if (ninfo.role.find("edge") == std::string::npos) continue;
        auto it = nameToNode.find(ninfo.name);
        if (it == nameToNode.end()) continue;
        Ptr<Node> edgeNode = it->second;

        Ipv4Address edgeIp = GetFirstNonLoopbackIpv4(edgeNode);
        if (edgeIp == Ipv4Address("0.0.0.0") || edgeIp == Ipv4Address::GetLoopback()) {
            std::cout << "WARN: Edge " << ninfo.name << " has no IPv4 yet - skipping client install\n";
            continue;
        }

        Ptr<ClientRequestApp> client = CreateObject<ClientRequestApp>();

        uint32_t contentId = 100 + (clientsDeployed % 5); 
        client->Setup(edgeIp, cachePort, contentId, clientRepeat, clientInterval);

        edgeNode->AddApplication(client);

        client->SetStartTime(Seconds(clientStart + clientsDeployed * 0.05));
        client->SetStopTime(Seconds(clientStop));
        std::cout << "INFO: Installed ClientRequestApp on edge " << ninfo.name
                << " (nodeId=" << edgeNode->GetId() << ") -> server=" << edgeIp
                << " contentId=" << contentId << std::endl;

        clientsDeployed++;

        if (maxClients > 0 && clientsDeployed >= maxClients) {
            std::cout << "INFO: Reached maxClients=" << maxClients << ", stopping client deployment\n";
            break;
        }
    }

    std::cout << "INFO: Deployed " << clientsDeployed << " clients on edge nodes\n";

    AnimationInterface anim(animFile);
    anim.EnablePacketMetadata();
    std::cout << "INFO: NetAnim animation will be written to: " << animFile << std::endl;

    path cwd = std::filesystem::current_path();
    path centralPath = cwd / "scratch" / "central.png";
    path edgePath    = cwd / "scratch" / "edge.png";

    uint32_t centralImage = anim.AddResource(centralPath.string());
    uint32_t edgeImage    = anim.AddResource(edgePath.string());

    double sumLat = 0.0, sumLon = 0.0;
    uint32_t count = 0;
    for (const auto &n : nodesCsv) {
        if (!std::isnan(n.lat) && !std::isnan(n.lon)) {
            sumLat += n.lat;
            sumLon += n.lon;
            ++count;
        }
    }
    double refLat = (count > 0) ? sumLat / count : std::numeric_limits<double>::quiet_NaN();
    double refLon = (count > 0) ? sumLon / count : std::numeric_limits<double>::quiet_NaN();

    if (std::isnan(refLat) || std::isnan(refLon)) {
        std::cerr << "ERROR: No valid lat/lon in nodes!" << std::endl;
        return 1;
    }

    std::vector<double> allX, allY;
    for (const auto& n : nodesCsv) {
        double mx, my;
        LatLonToMeters(refLat, refLon, n.lat, n.lon, mx, my);
        allX.push_back(mx);
        allY.push_back(my);
    }

    if (allX.empty()) return 1;

    double minX = *std::min_element(allX.begin(), allX.end());
    double maxX = *std::max_element(allX.begin(), allX.end());
    double minY = *std::min_element(allY.begin(), allY.end());
    double maxY = *std::max_element(allY.begin(), allY.end());

    double worldWidth  = maxX - minX;
    double worldHeight = maxY - minY;
    double worldSize = std::max(worldWidth, worldHeight);
    if (worldSize <= 0) worldSize = 1.0;

    double targetSize = 1000.0;
    double autoScale = targetSize / worldSize;

    double centerX = 500.0;
    double centerY = 700.0; 
    std::cout << "INFO: Using lat/lon to place nodes (reference lat=" << refLat << " lon=" << refLon << ")" << std::endl;

for (uint32_t i = 0; i < nodesCsv.size(); ++i) { 
    Ptr<Node> node = nameToNode[nodesCsv[i].name]; 
    double px = 0.0, py = 0.0; 
    if (!std::isnan(nodesCsv[i].lat) && !std::isnan(nodesCsv[i].lon)) {
        double mx, my; 
        LatLonToMeters(refLat, refLon, nodesCsv[i].lat, nodesCsv[i].lon, mx, my); 
        px = centerX + (mx - (minX + maxX)/2.0) * autoScale; 
        py = centerY - (my - (minY + maxY)/2.0) * autoScale; 
        } 
        anim.SetConstantPosition(node, px, py); 
        anim.UpdateNodeDescription(node->GetId(), nodesCsv[i].name);
         bool isImageNode = false; 
         if (nodesCsv[i].role.find("central") != std::string::npos) { 
            anim.UpdateNodeImage(node->GetId(), centralImage); 
            isImageNode = true; 
        } else if (nodesCsv[i].role.find("edge") != std::string::npos) { 
            anim.UpdateNodeImage(node->GetId(), edgeImage); 
            isImageNode = true; 
        } 
        if (isImageNode) { 
            anim.UpdateNodeSize(node->GetId(), 10, 10); 
        } else { 
            anim.UpdateNodeSize(node->GetId(), 3, 3);
        } 
        anim.UpdateNodeColor(node->GetId(), 128, 200, 255); 
    }
    
  // Flow monitor
  FlowMonitorHelper flowHelper;
  Ptr<FlowMonitor> flowMon = flowHelper.Install(allNodes);
  if (flowMon == nullptr) {
    std::cout << "WARN: FlowMonitor pointer is null after Install(allNodes)" << std::endl;
  } else {
    std::cout << "INFO: FlowMonitor installed" << std::endl;
  }

  Simulator::Stop(Seconds(simTime));
  Simulator::Run();

  if (flowMon != nullptr) {
    flowMon->CheckForLostPackets();
    flowMon->SerializeToXmlFile("flowmon-results.xml", true, true);
    std::cout << "INFO: FlowMonitor saved to flowmon-results.xml" << std::endl;
  } else {
    std::cout << "WARN: FlowMonitor pointer is null; skipping serialization" << std::endl;
  }

  Simulator::Destroy();
  std::cout << "INFO: Simulation finished, animation XML should be: " << animFile << std::endl;
  return 0;
}
 