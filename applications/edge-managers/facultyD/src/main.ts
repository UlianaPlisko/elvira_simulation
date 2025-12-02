// applications/facultyD-manager/src/main.ts
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

const CONTROL_PORT = process.env.CONTROL_PORT ? parseInt(process.env.CONTROL_PORT) : 3004;
const PROMETHEUS_URL = CONFIG.prometheus?.url || 'http://prometheus:9090';

let baselineRequestsfacultyD = 0;
let zeroRpsUntil = 0;

// Health & status
app.get('/health', (_req, res) => res.json({ status: 'ok', pid: process.pid }));
app.get('/status', (_req, res) => res.json({
  uptime: process.uptime(),
  timestamp: new Date().toISOString()
}));

// Reset metrics
app.post('/reset-metrics', async (req, res) => {
  try {
    const runningSim = req.body?.runningSim ?? null;
    if (runningSim !== null) {
      return res.status(400).json({ error: 'Cannot reset while simulation is running' });
    }

    await resetMetrics();

    // Update baseline nginx requests
    try {
      const total = await promScalar('sum(nginx_http_requests_total{job="nginx-facultyD"})');
      baselineRequestsfacultyD = total;
      zeroRpsUntil = Date.now() + 5000;
      console.log('facultyD: baselineRequestsfacultyD =', baselineRequestsfacultyD);
    } catch (err) {
      console.warn('facultyD: failed to set baselineRequestsfacultyD:', err);
    }

    res.json({ result: 'ok', msg: 'facultyD metrics reset' });
  } catch (e: any) {
    console.error('facultyD reset-metrics error:', e);
    res.status(500).json({ error: e.message || 'reset failed' });
  }
});

// Helper for Prometheus scalar queries
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

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// Main endpoint returning consolidated metrics (same format as central)
app.get('/facultyD-metrics', async (_req, res) => {
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
      promScalar('facultyD_energy_kwh'),
      promScalar('facultyD_power_watts'),
      promScalar('facultyD_load_lambda'),
      promScalar('facultyD_host_cpu_percent'),
      promScalar('facultyD_cpu_load'), // container CPU %
      promScalar('facultyD_mem_usage_bytes'),
      promScalar('facultyD_mem_load'),
      promScalar(`rate(docker_network_received_bytes{containerName="${CONFIG.metrics?.containerName || 'facultyD-nginx'}"}[1m])`),
      promScalar(`rate(docker_network_transmit_bytes{containerName="${CONFIG.metrics?.containerName || 'facultyD-nginx'}"}[1m])`),
      promScalar(`rate(docker_io_read_bytes{containerName="${CONFIG.metrics?.containerName || 'facultyD-nginx'}"}[1m])`),
      promScalar(`rate(docker_io_write_bytes{containerName="${CONFIG.metrics?.containerName || 'facultyD-nginx'}"}[1m])`),
      promScalar(`docker_process_pids_count{containerName="${CONFIG.metrics?.containerName || 'facultyD-nginx'}"}`),
      promScalar('facultyD_nginx_connections_active'),
      promScalar('facultyD_requests_total'), // Gauge from metrics server
      promScalar('facultyD_requests_per_second'),
      promScalar('facultyD_books_used_bytes'),
      promScalar('facultyD_books_used_mb'),
      promScalar('facultyD_books_util_percent'),
      promScalar('facultyD_transitions_total')
    ]);

    // Protect against immediate noise after reset
    const rps = Date.now() < zeroRpsUntil ? 0 : Number(rpsRaw.toFixed(2));
    const requestsSinceReset = Math.max(0, requestsTotalRaw - baselineRequestsfacultyD);

    res.json({
      // Energy & Eco Index
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
      rps: rps,

      // Books / cache
      booksUsedBytes: Math.round(booksBytes),
      booksUsedMb: Number(booksMb.toFixed(2)),
      booksUtilPercent: Number(booksUtil.toFixed(2)),

      // Transitions & sim
      transitions: Math.round(transitions),
      simulationHours: CONFIG.simulation.duration / 3600,

      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error('/facultyD-metrics error:', e?.message || e);
    res.status(500).json({ error: 'failed to fetch facultyD metrics' });
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
    console.error('Prom proxy error (facultyD):', e);
    res.status(500).json({ error: 'Prom query failed' });
  }
});

// Prefetch stub
app.post('/trigger-prefetch', async (req, res) => {
  console.log('Prefetch triggered (facultyD) opts=', req.body || {});
  res.json({ result: 'ok', msg: 'prefetch triggered (stub)' });
});

const server = app.listen(CONTROL_PORT, () => {
  console.log(`Faculty C control API listening on ${CONTROL_PORT}`);
  console.log(`   → http://localhost:${CONTROL_PORT}/facultyD-metrics — all metrics JSON`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
