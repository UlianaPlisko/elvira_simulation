const CONFIG = {
  energy: { Pidle: 63, Ppeak: 92, alpha: 37000 }, 
  load: { threshold: 0.75, deltaSeconds: 30 }, 
  simulation: { peakCapacity: 200, zipfAlpha: 0.8, duration: 300},
  subnets: {
    facultyA: '10.50.1.0/24',
    facultyB: '10.50.2.0/24',
    facultyC: '10.50.3.0/24',
    facultyD: '10.50.4.0/24',
    facultyE: '10.50.5.0/24',
    centralServer: '10.50.0.2/32',
    dnsServer: '10.50.0.3/32',    
    prometheusServer: '10.50.0.5/32' 
  }
} as const;

export default CONFIG;
export type ConfigType = typeof CONFIG;