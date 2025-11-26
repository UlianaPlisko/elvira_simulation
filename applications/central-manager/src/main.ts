// applications/central-manager/src/main.ts
import './monitoring/metrics';
console.log('metrics imported successfully');
import CONFIG from './config';
import express from 'express';
import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';
import cors from 'cors';
import { resetMetrics } from './monitoring/metrics';
import { startSimulator, stopSimulator, restartSimulator, getSimulatorStatus } from './control/simulatorControl';

const execAsync = util.promisify(exec);

const app = express();
app.use(express.json());

app.use(cors({
  origin: 'http://localhost:3101', // React app origin
  methods: ['GET', 'POST']
}));

const CONTROL_PORT = process.env.CONTROL_PORT ? parseInt(process.env.CONTROL_PORT) : 3100;

// Простое состояние (можно расширить)
const state = {
  lastDecisionTs: 0,
  lastPredictedLambda: 0,
  prefetchActive: false,
};

// baseline для "total requests since reset"
let baselineRequestsCentral = 0;

// флаг: пока он > now(), мы будем отдавать rps = 0
let zeroRpsUntil = 0;

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', pid: process.pid });
});

// Статус/диагностика
app.get('/status', (_req, res) => {
  res.json(state);
});

/**
 * POST /reset-metrics
 * Ожидает (опционально) тело { runningSim: number | null } — если runningSim != null -> reject.
 * Делает:
 *  - reset custom prom-client метрик
 *  - задаёт baselineRequestsCentral (значение sum(nginx_http_requests_total{job="nginx-central"}))
 *  - устанавливает короткий период zeroRpsUntil, чтобы rps временно был 0 (полезно для UI)
 */
app.post('/reset-metrics', async (req, res) => {
  try {
    // защита: запрет обнуления когда симуляция запущена (frontend должен передать текущее состояние)
    const runningSim = (req.body && typeof req.body.runningSim !== 'undefined') ? req.body.runningSim : null;
    if (runningSim !== null && runningSim !== undefined) {
      // если frontend отправил идентификатор запущенной симуляции — запретим reset
      if (runningSim !== null) {
        return res.status(400).json({ error: 'Cannot reset while a simulation is running' });
      }
    }

    // Reset local central custom metrics (prom-client registry)
    await resetMetrics();

    // Capture baseline for nginx total requests so UI will show "since reset"
    try {
      const promQueryUrl = 'http://172.20.0.5:9090/api/v1/query';
      const rQuery = 'sum(nginx_http_requests_total{job="nginx-central"})';
      const rRes = await axios.get(`${promQueryUrl}?query=${encodeURIComponent(rQuery)}`, { timeout: 5000 });
      const current = parseFloat(rRes.data?.data?.result?.[0]?.value?.[1] || '0');
      baselineRequestsCentral = Number.isFinite(current) ? current : 0;
      console.log('baselineRequestsCentral set to', baselineRequestsCentral);
    } catch (e: any) {
      console.warn('Could not set baselineRequestsCentral (Prometheus query failed):', e?.message || e);
      // baselineRequestsCentral не изменяем — остаётся предыдущее значение
    }

    // Установим кратковременную блокировку: rps будет возвращаться 0 в течение 5 секунд после reset
    zeroRpsUntil = Date.now() + 5000; // 5s, можно изменить

    res.json({ result: 'ok', msg: 'central metrics reset' });
  } catch (e: any) {
    console.error('central reset-metrics error:', e?.message || e);
    res.status(500).json({ error: 'Failed to reset central metrics' });
  }
});

// Принудительный триггер prefetch (ручная отладка)
app.post('/trigger-prefetch', async (req, res) => {
  try {
    const body = req.body || {};
    await performPrefetch(body);
    res.json({ result: 'ok', msg: 'prefetch triggered' });
  } catch (e) {
    console.error('Prefetch error:', e);
    res.status(500).json({ error: String(e) });
  }
});

// Новый эндпоинт для метрик central-only (для EI calc в frontend)
app.get('/central-metrics', async (req, res) => {
  try {
    const promUrl = 'http://172.20.0.5:9090/api/v1/query';

    // E_total для central (custom)
    const eQuery = 'sum(central_energy_kwh) or vector(0)';
    const eRes = await axios.get(`${promUrl}?query=${encodeURIComponent(eQuery)}`);
    const eTotal = parseFloat(eRes.data.data.result[0]?.value[1] || '0');

    const uQuery = 'central_books_util';
    const uRes = await axios.get(`${promUrl}?query=${encodeURIComponent(uQuery)}`);
    const uRaw = uRes.data.data.result.length > 0
      ? parseFloat(uRes.data.data.result[0].value[1])
      : 0;
    const u = Number(uRaw.toFixed(6));

    // MB for books (new metric)
    const uMbQuery = 'central_books_used_mb';
    const uMbRes = await axios.get(`${promUrl}?query=${encodeURIComponent(uMbQuery)}`);
    const uMbRaw = uMbRes.data.data.result.length > 0
      ? parseFloat(uMbRes.data.data.result[0].value[1])
      : 0;
    const u_mb = Number(uMbRaw.toFixed(6));

    // R для central (total requests из nginx-exporter) — baseline-adjusted
    const rQuery = 'sum(nginx_http_requests_total{job="nginx-central"})';
    const rRes = await axios.get(`${promUrl}?query=${encodeURIComponent(rQuery)}`);
    const rRaw = parseFloat(rRes.data.data.result[0]?.value[1] || '0');
    const r = Math.max(0, rRaw - (baselineRequestsCentral || 0));

    // RPS для central (requests per second, rate over 1m)
    // Если мы недавно сделали reset — покажем 0 в rps (по флагу zeroRpsUntil)
    let rps = 0;
    if (Date.now() < zeroRpsUntil) {
      rps = 0;
    } else {
      try {
        const rpsQuery = 'rate(nginx_http_requests_total{job="nginx-central"}[1m])';
        const rpsRes = await axios.get(`${promUrl}?query=${encodeURIComponent(rpsQuery)}`);
        rps = parseFloat(rpsRes.data.data.result[0]?.value[1] || '0');
      } catch (err) {
        console.warn('rps query failed, returning 0', err);
        rps = 0;
      }
    }

    // Lambda (combined load из custom)
    const lambdaQuery = 'central_load_lambda';
    const lambdaRes = await axios.get(`${promUrl}?query=${encodeURIComponent(lambdaQuery)}`);
    const lambda = parseFloat(lambdaRes.data.data.result[0]?.value[1] || '0');

    // CPU load (из custom)
    const cpuQuery = 'central_cpu_load';
    const cpuRes = await axios.get(`${promUrl}?query=${encodeURIComponent(cpuQuery)}`);
    const cpuLoad = parseFloat(cpuRes.data.data.result[0]?.value[1] || '0');

    // Mem load (из custom)
    const memQuery = 'central_mem_load';
    const memRes = await axios.get(`${promUrl}?query=${encodeURIComponent(memQuery)}`);
    const memLoad = parseFloat(memRes.data.data.result[0]?.value[1] || '0');

    // Transitions (из custom)
    const transQuery = 'central_transitions_total';
    const transRes = await axios.get(`${promUrl}?query=${encodeURIComponent(transQuery)}`);
    const transitions = parseFloat(transRes.data.data.result[0]?.value[1] || '0');

    // T (duration в часах, из CONFIG для симуляции)
    const t = CONFIG.simulation.duration / 3600;

    res.json({
      eTotal: Number(eTotal.toFixed(12)),
      u: u.toFixed(6),
      u_mb,
      r,
      rps: Number(rps.toFixed(2)),
      t,
      lambda: lambda.toFixed(2),
      cpuLoad: cpuLoad.toFixed(2),
      memLoad: memLoad.toFixed(2),
      transitions
    });
  } catch (e: any) {
    console.error('Central metrics error:', e.message || e);
    res.status(500).json({ error: 'Failed to fetch central metrics' });
  }
});

// Proxy для Prometheus (оставлен для других queries, если нужно)
app.get('/prom-query', async (req, res) => {
  try {
    const query = req.query.query as string;
    if (!query) return res.status(400).json({ error: 'No query' });
    const promRes = await axios.get(`http://172.20.0.5:9090/api/v1/query?query=${encodeURIComponent(query)}`);
    res.json(promRes.data);
  } catch (e) {
    console.error('Prom proxy error:', e);
    res.status(500).json({ error: 'Prom query failed' });
  }
});

const server = app.listen(CONTROL_PORT, () => {
  console.log(`Central control API listening on ${CONTROL_PORT}`);
});

app.post('/simulator/start', async (req, res) => {
  try {
    const message = await startSimulator();
    res.json({ message, service: 'student-facultyA' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/simulator/stop', async (req, res) => {
  try {
    const message = await stopSimulator();
    res.json({ message, service: 'student-facultyA' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/simulator/restart', async (req, res) => {
  try {
    const message = await restartSimulator();
    res.json({ message, service: 'student-facultyA' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/simulator/status', async (req, res) => {
  try {
    const status = await getSimulatorStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Decision loop ---
async function predictLoad(): Promise<number> {
  try {
    return Math.random(); // заглушка
  } catch (e) {
    console.warn('predictLoad fallback', e);
    return 0;
  }
}

async function performPrefetch(opts?: Record<string, unknown>) {
  console.log('Performing prefetch with opts=', opts || {});
  state.prefetchActive = true;
  await new Promise((r) => setTimeout(r, 2000));
  state.prefetchActive = false;
  console.log('Prefetch done');
}

async function updateCoreDNSRules(rules: Record<string, string>) {
  console.log('updateCoreDNSRules called', rules);
}

async function decisionLoop() {
  try {
    console.log('Decision loop tick at', new Date().toISOString());
    const predicted = await predictLoad();
    state.lastPredictedLambda = predicted;
    state.lastDecisionTs = Date.now();

    console.log(`Predicted lambda=${predicted.toFixed(3)}`);

    if (predicted > CONFIG.load.threshold) {
      console.log('Predicted high load > threshold -> trigger prefetch and consider routing update');
      await performPrefetch({ predicted });
      await updateCoreDNSRules({ action: 'route-to-edges' });
    } else {
      console.log('Predicted load normal (no action)');
    }
  } catch (e) {
    console.error('decisionLoop error:', e);
  }
}

setInterval(decisionLoop, CONFIG.load.deltaSeconds * 1000);

process.on('SIGINT', async () => {
  console.info('SIGINT received - shutting down');
  server.close(() => {
    process.exit(0);
  });
});
process.on('SIGTERM', async () => {
  console.info('SIGTERM received - shutting down');
  server.close(() => {
    process.exit(0);
  });
});

console.log('Central manager main started. Decision loop deltaSeconds=', CONFIG.load.deltaSeconds);
