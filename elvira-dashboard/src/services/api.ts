import axios from 'axios';

const API_BASE = 'http://localhost:3100'; // central-nginx
const FACULTYA_BASE = 'http://localhost:3001'; // facultyA-edge metrics (assume exposed on 3001)
const FACULTYB_BASE = 'http://localhost:3002'; // facultyB-edge metrics (assume exposed on 3002)
const FACULTYC_BASE = 'http://localhost:3003';
const FACULTYD_BASE = 'http://localhost:3004';
const FACULTYE_BASE = 'http://localhost:3005';

export const getCentralMetrics = () => axios.get(`${API_BASE}/central-metrics`);
export const getFacultyAMetrics = () => axios.get(`${FACULTYA_BASE}/facultyA-metrics`);  // Assume similar endpoint on edge
export const getFacultyBMetrics = () => axios.get(`${FACULTYB_BASE}/facultyB-metrics`);  // NEW: FacultyB endpoint
export const getFacultyCMetrics = () => axios.get(`${FACULTYC_BASE}/facultyC-metrics`);
export const getFacultyDMetrics = () => axios.get(`${FACULTYD_BASE}/facultyD-metrics`);
export const getFacultyEMetrics = () => axios.get(`${FACULTYE_BASE}/facultyE-metrics`);

export const getHealth = () => axios.get(`${API_BASE}/health`);
export const getStatus = () => axios.get(`${API_BASE}/status`);

// Proxy Prometheus query through backend to avoid CORS
export const queryPrometheus = (query: string) => 
  axios.get(`${API_BASE}/prom-query?query=${encodeURIComponent(query)}`);

export const resetCentralMetrics = (body: any = {}) =>
  axios.post(`${API_BASE}/reset-metrics`, body, { timeout: 8000 });

export const resetFacultyAMetrics = (body: any = {}) =>
  axios.post(`${FACULTYA_BASE}/reset-metrics`, body, { timeout: 8000 });

export const resetFacultyBMetrics = (body: any = {}) =>
  axios.post(`${FACULTYB_BASE}/reset-metrics`, body, { timeout: 8000 }); 

export const resetFacultyCMetrics = (body: any = {}) =>
  axios.post(`${FACULTYC_BASE}/reset-metrics`, body, { timeout: 8000 }); 

export const resetFacultyDMetrics = (body: any = {}) =>
  axios.post(`${FACULTYD_BASE}/reset-metrics`, body, { timeout: 8000 }); 

export const resetFacultyEMetrics = (body: any = {}) =>
  axios.post(`${FACULTYE_BASE}/reset-metrics`, body, { timeout: 8000 }); 

export const resetAllMetrics = async (runningSim: number | null) => {
  const body = { runningSim };
  const [central, facultyA, facultyB, facultyC, facultyD, facultyE] = await Promise.allSettled([
    resetCentralMetrics(body),
    resetFacultyAMetrics(body),
    resetFacultyBMetrics(body),
    resetFacultyCMetrics(body),
    resetFacultyDMetrics(body),
    resetFacultyEMetrics(body),
  ]);
  return { central, facultyA, facultyB, facultyC, facultyD, facultyE };
};

export const startNormalSimulation = () => axios.post(`${API_BASE}/simulator/normal`);

export const startExamSimulation = () => axios.post(`${API_BASE}/simulator/exam`);

export const stopSimulation = () => axios.post(`${API_BASE}/simulator/stop`);


export const getSimulationStatus = () => axios.get(`${API_BASE}/simulator/status`);

export const switchToCentral = () => axios.post(`${API_BASE}/switch-to-central`);
export const switchToEdge = () => axios.post(`${API_BASE}/switch-to-edge`);
export const getDnsStatus = () => axios.get(`${API_BASE}/dns-status`);

export const startUseCase2 = (strategy: number, file: string, compression: string = 'gzip', level: number = 6) =>
  axios.post(`${API_BASE}/usecase2/start`, { strategy, file, compression, level });

export const downloadUseCase2Results = () =>
  axios.get(`${API_BASE}/usecase2/download`, { responseType: 'blob' });

export const checkUseCase2HasResults = () =>
  axios.get(`${API_BASE}/usecase2/has-results`);