import axios from 'axios';

const API_BASE = 'http://localhost:3100'; // central-nginx
const PROMETHEUS = 'http://localhost:9090';

export const getEcoIndex = () => axios.get(`${API_BASE}/eco-index`);
export const getHealth = () => axios.get(`${API_BASE}/health`);
export const getStatus = () => axios.get(`${API_BASE}/status`);

export const queryPrometheus = (query: string) => 
  axios.get(`${PROMETHEUS}/api/v1/query?query=${encodeURIComponent(query)}`);