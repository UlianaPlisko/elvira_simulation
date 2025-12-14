// src/main.ts
import './monitoring/metrics';
import { register } from './monitoring/metrics';
import { resetMetrics } from './monitoring/metrics';
import CONFIG from './config';
import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:3101',
  methods: ['GET', 'POST']
}));

// Dynamic control port: prefer env var, fallback based on faculty
const DEFAULT_PORTS: Record<string, number> = {
  facultyA: 3001,
  facultyB: 3002,
  facultyC: 3003,
  facultyD: 3004,
  facultyE: 3005
};

const CONTROL_PORT = process.env.CONTROL_PORT
  ? parseInt(process.env.CONTROL_PORT)
  : DEFAULT_PORTS[CONFIG.faculty] || 3001;

const PROMETHEUS_URL = CONFIG.prometheus.url;

// Runtime variables for baseline RPS protection
let baselineRequests = 0;
let zeroRpsUntil = 0;

// Health & status endpoints
app.get('/health', (_req, res) => res.json({ status: 'ok', pid: process.pid }));
app.get('/status', (_req, res) => res.json({
  uptime: process.uptime(),
  timestamp: new Date().toISOString()
}));

// Reset metrics endpoint
app.post('/reset-metrics', async (req, res) => {
  try {
    const runningSim = req.body?.runningSim ?? null;
    if (runningSim !== null) {
      return res.status(400).json({ error: 'Cannot reset while simulation is running' });
    }

    await resetMetrics();

    // Update baseline from nginx-exporter
    try {
      const total = await promScalar(`sum(nginx_http_requests_total{job="${CONFIG.metrics.nginxJob}"})`);
      baselineRequests = total;
      zeroRpsUntil = Date.now() + 5000;
      console.log(`${CONFIG.shortName}: baselineRequests =`, baselineRequests);
    } catch (err) {
      console.warn(`${CONFIG.shortName}: failed to set baselineRequests:`, err);
    }

    res.json({ result: 'ok', msg: `${CONFIG.faculty} metrics reset` });
  } catch (e: any) {
    console.error(`${CONFIG.shortName} reset-metrics error:`, e);
    res.status(500).json({ error: e.message || 'reset failed' });
  }
});

// Helper: scalar query from Prometheus
async function promScalar(query: string): Promise<number> {
  try {
    const r = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
      params: { query },
      timeout: 4000
    });
    const val = r.data?.data?.result?.[0]?.value?.[1];
    return val ? parseFloat(val) : 0;
  } catch (err) {
    console.warn(`Prometheus query failed: ${query}`);
    return 0;
  }
}

// Expose raw Prometheus metrics
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// Main consolidated metrics endpoint: /facultyA-metrics, /facultyB-metrics, etc.
app.get(`/${CONFIG.faculty}-metrics`, async (_req, res) => {
  try {
    const [
      eTotal,
      powerWatts,
      lambda,
      hostCpu,
      containerCpu,
      memBytes,
      memPercent,
      netRxBps,
      netTxBps,
      diskReadBps,
      diskWriteBps,
      pids,
      connections,
      requestsTotalRaw,
      rpsRaw,
      booksBytes,
      booksMb,
      booksUtil,
      transitions
    ] = await Promise.all([
      promScalar(`${CONFIG.prefix}energy_kwh`),
      promScalar(`${CONFIG.prefix}power_watts`),
      promScalar(`${CONFIG.prefix}load_lambda`),
      promScalar(`${CONFIG.prefix}host_cpu_percent`),
      promScalar(`${CONFIG.prefix}cpu_load`),
      promScalar(`${CONFIG.prefix}mem_usage_bytes`),
      promScalar(`${CONFIG.prefix}mem_load`),
      promScalar(`rate(docker_network_received_bytes{containerName="${CONFIG.metrics.containerName}"}[1m])`),
      promScalar(`rate(docker_network_transmit_bytes{containerName="${CONFIG.metrics.containerName}"}[1m])`),
      promScalar(`rate(docker_io_read_bytes{containerName="${CONFIG.metrics.containerName}"}[1m])`),
      promScalar(`rate(docker_io_write_bytes{containerName="${CONFIG.metrics.containerName}"}[1m])`),
      promScalar(`docker_process_pids_count{containerName="${CONFIG.metrics.containerName}"}`),
      promScalar(`${CONFIG.prefix}nginx_connections_active`),
      promScalar(`${CONFIG.prefix}requests_total`),
      promScalar(`${CONFIG.prefix}requests_per_second`),
      promScalar(`${CONFIG.prefix}books_used_bytes`),
      promScalar(`${CONFIG.prefix}books_used_mb`),
      promScalar(`${CONFIG.prefix}books_util_percent`),
      promScalar(`${CONFIG.prefix}transitions_total`)
    ]);

    // Avoid RPS spike right after reset
    const rps = Date.now() < zeroRpsUntil ? 0 : Number(rpsRaw.toFixed(2));
    const requestsSinceReset = Math.max(0, requestsTotalRaw - baselineRequests);

    res.json({
      // Energy
      eTotal: Number(eTotal.toFixed(12)),
      powerWatts: Number(powerWatts.toFixed(2)),
      lambda: Number(lambda.toFixed(3)),

      // CPU
      hostCpuPercent: Number(hostCpu.toFixed(2)),
      containerCpuPercent: Number(containerCpu.toFixed(2)),

      // Memory
      memUsageBytes: Math.round(memBytes),
      memUsageMb: Number((memBytes / 1024 / 1024).toFixed(2)),
      memPercent: Number(memPercent.toFixed(2)),

      // Network (KiB/s)
      netRxKiBps: Number((netRxBps / 1024).toFixed(2)),
      netTxKiBps: Number((netTxBps / 1024).toFixed(2)),

      // Disk I/O (KiB/s)
      diskReadKiBps: Number((diskReadBps / 1024).toFixed(2)),
      diskWriteKiBps: Number((diskWriteBps / 1024).toFixed(2)),

      // Processes & nginx
      pids: Math.round(pids),
      nginxConnectionsActive: Math.round(connections),
      requestsTotal: Math.round(requestsTotalRaw),
      requestsSinceReset: Math.round(requestsSinceReset),
      rps,

      // Cache
      booksUsedBytes: Math.round(booksBytes),
      booksUsedMb: Number(booksMb.toFixed(2)),
      booksUtilPercent: Number(booksUtil.toFixed(2)),

      // Simulation
      transitions: Math.round(transitions),
      simulationHours: CONFIG.simulation.duration / 3600,

      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error(`/${CONFIG.faculty}-metrics error:`, e?.message || e);
    res.status(500).json({ error: `failed to fetch ${CONFIG.faculty} metrics` });
  }
});

// Prometheus query proxy
app.get('/prom-query', async (req, res) => {
  try {
    const query = String(req.query.query || '');
    if (!query) return res.status(400).json({ error: 'No query' });
    const promRes = await axios.get(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
    res.json(promRes.data);
  } catch (e) {
    console.error(`Prom proxy error (${CONFIG.shortName}):`, e);
    res.status(500).json({ error: 'Prom query failed' });
  }
});

// Prefetch trigger stub
app.post('/trigger-prefetch', async (req, res) => {
  console.log(`Prefetch triggered (${CONFIG.shortName}) opts=`, req.body || {});
  res.json({ result: 'ok', msg: 'prefetch triggered (stub)' });
});

// Start server
const server = app.listen(CONTROL_PORT, () => {
  console.log(`${CONFIG.shortName} control API listening on port ${CONTROL_PORT}`);
  console.log(`   → http://localhost:${CONTROL_PORT}/${CONFIG.faculty}-metrics — all metrics JSON`);
  console.log(`   → http://localhost:${CONTROL_PORT}/metrics — Prometheus metrics`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));