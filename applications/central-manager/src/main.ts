// applications/central-manager/src/main.ts 
import './monitoring/metrics';
console.log('🚀 Central metrics ULTRA загружены');
import CONFIG from './config';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { resetMetrics } from './monitoring/metrics';
import { startSimulator, stopSimulator, getSimulatorStatus} from './control/simulatorControl';

const app = express();
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3101', methods: ['GET', 'POST'] }));

const CONTROL_PORT = process.env.CONTROL_PORT ? parseInt(process.env.CONTROL_PORT) : 3100;
const PROMETHEUS_URL = 'http://prometheus:9090'; // через Docker network, не IP!

let baselineRequestsCentral = 0;
let zeroRpsUntil = 0;

// Health & Status
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

    // Обновляем baseline запросов
    const total = await promScalar('sum(nginx_http_requests_total{job="nginx-central"})');
    baselineRequestsCentral = total;
    zeroRpsUntil = Date.now() + 5000;

    console.log('Метрики сброшены, baselineRequestsCentral =', baselineRequestsCentral);
    res.json({ result: 'ok', msg: 'central metrics reset' });
  } catch (e: any) {
    console.error('reset-metrics error:', e);
    res.status(500).json({ error: e.message || 'reset failed' });
  }
});

// === ГЛАВНЫЙ ЭНДПОИНТ — ВСЁ В ОДНОМ! ===
app.get('/central-metrics', async (req, res) => {
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
      promScalar('central_energy_kwh'),
      promScalar('central_power_watts'),
      promScalar('central_load_lambda'),
      promScalar('central_host_cpu_percent'),
      promScalar('central_cpu_load'), // это container CPU % (как в docker stats)
      promScalar('central_mem_usage_bytes'),
      promScalar('central_mem_load'),
      promScalar('rate(docker_network_received_bytes{containerName="central-nginx"}[1m])'),
      promScalar('rate(docker_network_transmit_bytes{containerName="central-nginx"}[1m])'),
      promScalar('rate(docker_io_read_bytes{containerName="central-nginx"}[1m])'),
      promScalar('rate(docker_io_write_bytes{containerName="central-nginx"}[1m])'),
      promScalar('docker_process_pids_count{containerName="central-nginx"}'),
      promScalar('central_nginx_connections_active'),
      promScalar('central_requests_total'), // наш Gauge, синхронизирован с nginx-exporter
      promScalar('central_requests_per_second'),
      promScalar('central_books_used_bytes'),
      promScalar('central_books_used_mb'),
      promScalar('central_books_util_percent'),
      promScalar('central_transitions_total')
    ]);

    // Защита от глюков после reset
    const rps = Date.now() < zeroRpsUntil ? 0 : Number(rpsRaw.toFixed(2));
    const requestsSinceReset = Math.max(0, requestsTotalRaw - baselineRequestsCentral);

    res.json({
      // Энергия и Eco Index
      eTotal: Number(eTotal.toFixed(12)),
      powerWatts: Number(powerWatts.toFixed(2)),
      lambda: Number(lambda.toFixed(3)),

      // CPU
      hostCpuPercent: Number(hostCpu.toFixed(2)),
      containerCpuPercent: Number(containerCpu.toFixed(2)),

      // Память
      memUsageBytes: Math.round(memBytes),
      memUsageMb: Number((memBytes / 1024 / 1024).toFixed(2)),
      memPercent: Number(memPercent.toFixed(2)),

      // Сеть (KiB/s)
      netRxKiBps: Number((netRxBps / 1024).toFixed(2)),
      netTxKiBps: Number((netTxBps / 1024).toFixed(2)),

      // Диск I/O (KiB/s)
      diskReadKiBps: Number((diskReadBps / 1024).toFixed(2)),
      diskWriteKiBps: Number((diskWriteBps / 1024).toFixed(2)),

      // Процессы и Nginx
      pids: Math.round(pids),
      nginxConnectionsActive: Math.round(connections),
      requestsTotal: Math.round(requestsTotalRaw),
      requestsSinceReset: Math.round(requestsSinceReset),
      rps: rps,

      // Диск books
      booksUsedBytes: Math.round(booksBytes),
      booksUsedMb: Number(booksMb.toFixed(2)),
      booksUtilPercent: Number(booksUtil.toFixed(2)),

      // Переходы и симуляция
      transitions: Math.round(transitions),
      simulationHours: CONFIG.simulation.duration / 3600,

      // Timestamp
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error('/central-metrics error:', e);
    res.status(500).json({ error: 'failed to fetch metrics' });
  }
});

// Вспомогательная функция для запросов к Prometheus
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

// Остальные эндпоинты (симулятор, prefetch и т.д.) — без изменений
app.post('/trigger-prefetch', async (req, res) => {
  await performPrefetch(req.body || {});
  res.json({ result: 'ok' });
});

app.post('/simulator/normal', async (req, res) => {
  try {
    const msg = await startSimulator('normal');
    res.json({ message: msg });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Новый эндпоинт: /simulator/exam
app.post('/simulator/exam', async (req, res) => {
  try {
    const msg = await startSimulator('exam');
    res.json({ message: msg });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/simulator/stop', async (req, res) => {
  try {
    const msg = await stopSimulator();
    res.json({ message: msg });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/simulator/status', async (req, res) => {
  try {
    const status = await getSimulatorStatus();
    res.json(status);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Decision loop (можно потом заменить на ML)
async function performPrefetch(_opts?: any) {
  console.log('Prefetch triggered manually');
}

const server = app.listen(CONTROL_PORT, () => {
  console.log(`Central Manager API запущен на :${CONTROL_PORT}`);
  console.log(`   → http://localhost:${CONTROL_PORT}/central-metrics — все метрики в одном JSON`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));