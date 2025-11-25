// main.ts
import './monitoring/metrics'; // инициализация и /metrics сервер
import { resetMetrics } from './monitoring/metrics';
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
let baselineRequestsFacultyA = 0;
// Пока Date.now() < zeroRpsUntil — будем отдавать rps = 0
let zeroRpsUntil = 0;

app.get('/status', (_req, res) => res.json(state));

/**
 * POST /reset-metrics
 * Тело: { runningSim?: number | null } — backend дополнительно проверяет, что симуляция не запущена.
 */
app.post('/reset-metrics', async (req, res) => {
  try {
    const runningSim = (req.body && typeof req.body.runningSim !== 'undefined') ? req.body.runningSim : null;
    if (runningSim !== null && runningSim !== undefined) {
      // Если frontend прислал идентификатор запущенной симуляции — запрещаем reset
      if (runningSim !== null) {
        return res.status(400).json({ error: 'Cannot reset while a simulation is running' });
      }
    }

    // Reset локальных prom-client метрик
    await resetMetrics();

    // Установить baseline для счетчика nginx, чтобы UI показывал "since reset"
    try {
      const rQuery = 'sum(nginx_http_requests_total{job="nginx-facultyA"})';
      const queryUrl = `${PROM_URL}/api/v1/query?query=${encodeURIComponent(rQuery)}`;
      const rRes = await axios.get(queryUrl, { timeout: 5000 });
      const raw = rRes.data?.data?.result?.[0]?.value?.[1];
      const current = parseFloat(raw || '0');
      baselineRequestsFacultyA = Number.isFinite(current) ? current : 0;
      console.log('FacultyA: baselineRequestsFacultyA set to', baselineRequestsFacultyA);
    } catch (err: any) {
      console.warn('FacultyA: failed to set baselineRequestsFacultyA (Prometheus query):', err?.message || err);
      // baseline не меняем в случае ошибки
    }

    // Короткое обнуление rps — 5 секунд после reset возвращаем rps=0 (можно изменить)
    zeroRpsUntil = Date.now() + 5000;

    res.json({ result: 'ok', msg: 'facultyA metrics reset' });
  } catch (e: any) {
    console.error('facultyA reset-metrics error:', e?.message || e);
    res.status(500).json({ error: 'Failed to reset facultyA metrics' });
  }
});

// Endpoint для фронтенда: /facultyA-metrics (формат совпадает с /central-metrics)
app.get('/facultyA-metrics', async (_req, res) => {
  try {
    const promQuery = async (q: string): Promise<number> => {
      try {
        const r = await axios.get(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(q)}`, { timeout: 5000 });
        const result = r.data?.data?.result;
        if (Array.isArray(result) && result.length > 0 && result[0].value && result[0].value.length >= 2) {
          const v = parseFloat(result[0].value[1]);
          return Number.isFinite(v) ? v : 0;
        }
        return 0;
      } catch (err: any) {
        console.warn(`Prom query "${q}" failed:`, err?.message || err);
        return 0;
      }
    };

    // Запросы в параллель
    const [
      eTotalVal,
      uPercentVal,
      uMbVal,
      rVal,
      rpsVal,
      lambdaVal,
      cpuLoadVal,
      memLoadVal,
      transitionsVal
    ] = await Promise.all([
      promQuery('sum(facultyA_energy_kwh) or vector(0)'),
      promQuery('facultyA_books_util'),
      promQuery('facultyA_books_used_mb'),
      promQuery('sum(nginx_http_requests_total{job="nginx-facultyA"})'),
      promQuery('rate(nginx_http_requests_total{job="nginx-facultyA"}[1m])'),
      promQuery('facultyA_load_lambda'),
      promQuery('facultyA_cpu_load'),
      promQuery('facultyA_mem_load'),
      promQuery('facultyA_transitions_total'),
    ]);

    const t = CONFIG.simulation.duration / 3600;

    // Корректировка total requests по baseline (requests since reset)
    const rAdjusted = Math.max(0, (rVal || 0) - (baselineRequestsFacultyA || 0));

    // rps: если недавно был reset — отдаём 0, иначе используем rate() результат (rpsVal)
    let rps: number;
    if (Date.now() < zeroRpsUntil) {
      rps = 0;
    } else {
      // использовать rpsVal, который мы уже запросили в параллеле
      rps = Number.isFinite(rpsVal) ? rpsVal : 0;
    }

    return res.json({
      eTotal: Number(eTotalVal.toFixed(12)),
      u: uPercentVal.toFixed(6),
      u_mb: Number(uMbVal.toFixed(6)),
      r: Number(rAdjusted),
      rps: Number(rps.toFixed(2)),
      t,
      lambda: Number(lambdaVal).toFixed(2),
      cpuLoad: Number(cpuLoadVal).toFixed(2),
      memLoad: Number(memLoadVal).toFixed(2),
      transitions: Number(transitionsVal)
    });
  } catch (e: any) {
    console.error('facultyA-metrics error (top):', e?.message || e);
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
