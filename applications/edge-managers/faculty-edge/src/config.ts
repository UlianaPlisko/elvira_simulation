// applications/edge-manager/faculty-edge/src/config.ts
const FACULTY = process.env.FACULTY || 'facultyA';

const SHORT_NAME = FACULTY.replace('faculty', '').toUpperCase();

const METRIC_PREFIX = `${FACULTY}_`;

const CONTAINER_NAME = `${FACULTY}-edge`;

const NGINX_JOB = `nginx-${FACULTY}`;

const CONFIG = {
  // Identification
  faculty: FACULTY,              // "facultyA", "facultyB", etc.
  shortName: SHORT_NAME,         // "A", "B", "C"...
  prefix: METRIC_PREFIX,         // "facultyA_"

  energy: {
    Pidle: 63,                   // Idle power in Watts
    Ppeak: 92,                   // Peak power in Watts
    alpha: 37000                 // Extra energy penalty on activation (in joules → converted later)
  },

  load: {
    threshold: 0.75,
    deltaSeconds: 30
  },

  simulation: {
    zipfAlpha: 0.8,
    duration: 300,               
    peakCapacity: 200            
  },

  prometheus: {
    url: process.env.PROMETHEUS_URL || 'http://prometheus:9090'
  },

  metrics: {
    containerName: CONTAINER_NAME, 
    nginxJob: NGINX_JOB             
  },

  cache: {
    maxSizeBytes: 50 * 1024 * 1024  // 500 MB
  }
} as const;

export default CONFIG;
export type ConfigType = typeof CONFIG;