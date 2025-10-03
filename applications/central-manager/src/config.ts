const CONFIG = {
  energy: { Pidle: 63, Ppeak: 92, alpha: 37000 },  // Watts, Joules/transition (from paper)
  load: { threshold: 0.75, deltaSeconds: 300 },    // Λ=75% cap, δ=5min slots
  simulation: { peakCapacity: 200, zipfAlpha: 0.8 }, // reqs/sec/server peak, Zipf skew for file pops
  subnets: {  
    // Faculties (/24 for Eduroam student IPs - 256 IPs each, realistic for uni depts)
    facultyA: '192.168.1.0/24',    
    facultyB: '192.168.2.0/24',   
    facultyC: '192.168.3.0/24',   
    facultyD: '192.168.4.0/24',   
    facultyE: '192.168.5.0/24',   

    centralServer: '10.0.0.1/32',  // Main Elvira in rectorate (fixed Docker IP)
    dnsServer: '10.0.0.2/32',      // CoreDNS secondary (for IP routing)
    prometheusServer: '10.0.0.3/32' // Monitoring (Prometheus/Grafana)
  }
} as const;

module.exports = CONFIG;

export default CONFIG;

export type ConfigType = typeof CONFIG;