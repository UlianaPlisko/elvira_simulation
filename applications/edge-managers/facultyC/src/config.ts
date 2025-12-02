// config.ts
const CONFIG = {
  energy: { Pidle: 63, Ppeak: 92, alpha: 37000 },
  load: { threshold: 0.75, deltaSeconds: 30 },
  simulation: { zipfAlpha: 0.8, duration: 300, peakCapacity: 200 },
  subnets: {
    facultyA: '192.168.1.0/24',
    facultyB: '192.168.2.0/24',
    facultyC: '192.168.3.0/24',
    facultyD: '192.168.4.0/24',
    facultyE: '192.168.5.0/24',
    centralServer: '172.20.0.2/32',
    dnsServer: '172.20.0.3/32',
    prometheusServer: '172.20.0.5/32'
  },
  prometheus: {
    url: 'http://172.20.0.5:9090' // optional - defaults to the value already used
  },
  metrics: {
  containerName: "facultyC-edge" 
  },
  cache: {maxSizeBytes: 500 * 1024 * 1024}
} as const;

export default CONFIG;
export type ConfigType = typeof CONFIG;