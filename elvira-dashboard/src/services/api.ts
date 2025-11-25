// src/services/api.ts
import axios from 'axios';

const API_BASE = 'http://localhost:3100'; // central-nginx
const FACULTYA_BASE = 'http://localhost:3001'; // facultyA-edge metrics (assume exposed on 3001)

export const getCentralMetrics = () => axios.get(`${API_BASE}/central-metrics`);
export const getFacultyAMetrics = () => axios.get(`${FACULTYA_BASE}/facultyA-metrics`);  // Assume similar endpoint on edge

export const getHealth = () => axios.get(`${API_BASE}/health`);
export const getStatus = () => axios.get(`${API_BASE}/status`);

// Proxy Prometheus query through backend to avoid CORS
export const queryPrometheus = (query: string) => 
  axios.get(`${API_BASE}/prom-query?query=${encodeURIComponent(query)}`);

export const resetCentralMetrics = (body: any = {}) =>
  axios.post(`${API_BASE}/reset-metrics`, body, { timeout: 8000 });

export const resetFacultyAMetrics = (body: any = {}) =>
  axios.post(`${FACULTYA_BASE}/reset-metrics`, body, { timeout: 8000 });


export const resetAllMetrics = async (runningSim: number | null) => {
  const body = { runningSim }; // frontend отправляет текущее состояние (id или null)
  const [central, faculty] = await Promise.allSettled([
    resetCentralMetrics(body),
    resetFacultyAMetrics(body),
  ]);
  return { central, faculty };
};