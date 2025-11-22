// main.ts
import './monitoring/metrics'; // инициализация и /metrics сервер
import CONFIG from './config';
import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:3101', // frontend origin (тот же, что у central)
  methods: ['GET', 'POST']
}));

// CONTROL port — для Faculty A мы выставляем 3001, т.к. в frontend FACULTYA_BASE = http://localhost:3001
const CONTROL_PORT = process.env.CONTROL_PORT ? parseInt(process.env.CONTROL_PORT) : 3001;
const PROM_URL = 'http://172.20.0.5:9090'; // prometheus

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', pid: process.pid });
});

// Status
const state = { lastPrefetch: 0, prefetchActive: false };
app.get('/status', (_req, res) => res.json(state));

// Endpoint для фронтенда: /facultyA-metrics (формат совпадает с /central-metrics)
app.get('/facultyA-metrics', async (_req, res) => {
  try {
    // E_total (custom)
    const eQuery = 'sum(facultyA_energy_kwh) or vector(0)';
    const eRes = await axios.get(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(eQuery)}`);
    const eTotal = parseFloat(eRes.data.data.result[0]?.value[1] ?? '0');

    // U (books util)
    const uQuery = 'facultyA_books_util';
    const uRes = await axios.get(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(uQuery)}`);
    const uRaw = uRes.data.data.result.length > 0 ? parseFloat(uRes.data.data.result[0].value[1]) : 0;
    const u = Number(uRaw.toFixed(6));

    // R (nginx requests) — предполагаем job="nginx-facultyA" в Prometheus scrape_config
    const rQuery = 'sum(nginx_http_requests_total{job="nginx-facultyA"})';
    const rRes = await axios.get(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(rQuery)}`);
    const r = parseFloat(rRes.data.data.result[0]?.value[1] ?? '0');

    const rpsQuery = 'rate(nginx_http_requests_total{job="nginx-facultyA"}[1m])';
    const rpsRes = await axios.get(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(rpsQuery)}`);
    const rps = parseFloat(rpsRes.data.data.result[0]?.value[1] ?? '0');

    const lambdaQuery = 'facultyA_load_lambda';
    const lambdaRes = await axios.get(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(lambdaQuery)}`);
    const lambda = parseFloat(lambdaRes.data.data.result[0]?.value[1] ?? '0');

    const cpuQuery = 'facultyA_cpu_load';
    const cpuRes = await axios.get(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(cpuQuery)}`);
    const cpuLoad = parseFloat(cpuRes.data.data.result[0]?.value[1] ?? '0');

    const memQuery = 'facultyA_mem_load';
    const memRes = await axios.get(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(memQuery)}`);
    const memLoad = parseFloat(memRes.data.data.result[0]?.value[1] ?? '0');

    const transQuery = 'facultyA_transitions_total';
    const transRes = await axios.get(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(transQuery)}`);
    const transitions = parseFloat(transRes.data.data.result[0]?.value[1] ?? '0');

    const t = CONFIG.simulation.duration / 3600;

    res.json({
      eTotal: Number(eTotal.toFixed(12)),
      u: u.toFixed(6),
      r,
      rps: rps.toFixed(2),
      t,
      lambda: lambda.toFixed(2),
      cpuLoad: cpuLoad.toFixed(2),
      memLoad: memLoad.toFixed(2),
      transitions
    });
  } catch (e: any) {
    console.error('facultyA-metrics error:', e.message || e);
    res.status(500).json({ error: 'Failed to fetch facultyA metrics' });
  }
});

// Прокси для произвольных Prometheus-запросов (как у central)
app.get('/prom-query', async (req, res) => {
  try {
    const query = String(req.query.query || '');
    if (!query) return res.status(400).json({ error: 'No query' });
    const promRes = await axios.get(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
    res.json(promRes.data);
  } catch (e) {
    console.error('Prom proxy error (facultyA):', e);
    res.status(500).json({ error: 'Prom query failed' });
  }
});

app.post('/trigger-prefetch', async (req, res) => {
  console.log('Prefetch triggered (facultyA) opts=', req.body || {});
  // stub
  res.json({ result: 'ok', msg: 'prefetch triggered (stub)' });
});

const server = app.listen(CONTROL_PORT, () => {
  console.log(`Faculty A control API listening on ${CONTROL_PORT}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
