// applications/central-manager/src/main.ts
import './monitoring/metrics';
console.log('metrics imported successfully');  // ADD
import CONFIG from './config';
import express from 'express';
import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

const app = express();
app.use(express.json());

const CONTROL_PORT = process.env.CONTROL_PORT ? parseInt(process.env.CONTROL_PORT) : 3100;

// Простое состояние (можно расширить)
const state = {
  lastDecisionTs: 0,
  lastPredictedLambda: 0,
  prefetchActive: false,
};

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', pid: process.pid });
});

// Статус/диагностика
app.get('/status', (_req, res) => {
  res.json(state);
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

app.get('/eco-index', async (req, res) => {
  try {
    const promUrl = 'http://172.20.0.5:9090/api/v1/query';
    const simDurationHours = CONFIG.simulation.duration / 3600;

    // === E_total ===
    const eQuery = 'sum(central_energy_kwh) or vector(0) + sum(edge_energy_kwh_facultyA) or vector(0)';
    const eRes = await axios.get(`${promUrl}?query=${encodeURIComponent(eQuery)}`);
    const eTotal = parseFloat(eRes.data.data.result[0]?.value[1] || '0');

    // === U: ЧИСЛО, НЕ СТРОКА ===
    const uQuery = `
      100 * (
        sum(container_fs_usage_bytes{container=~"central-nginx|facultyA-edge"}) 
        / 
        sum(container_fs_capacity_bytes{container=~"central-nginx|facultyA-edge"})
      )
    `;
    const uRes = await axios.get(`${promUrl}?query=${encodeURIComponent(uQuery)}`);
    const uRaw = uRes.data.data.result.length > 0 
      ? parseFloat(uRes.data.data.result[0].value[1])
      : 0;
    const u = Number(uRaw.toFixed(2));  // ← ЧИСЛО!

    // === R ===
    const rQuery = 'sum(nginx_http_requests_total)';
    const rRes = await axios.get(`${promUrl}?query=${encodeURIComponent(rQuery)}`);
    const r = parseFloat(rRes.data.data.result[0]?.value[1] || '0');

    // === T ===
    const t = simDurationHours;

    // === EI: u — число → всё ок ===
    const ei = (eTotal * (1 - u / 100)) / (r * t || 1);

    // === CO2 ===
    const carbonFactor = 0.5;
    const co2e = ei * carbonFactor;

    // === ОТВЕТ: u — число, ei — число ===
    res.json({
      ei: ei.toFixed(6),
      eTotal: Number(eTotal.toFixed(12)),  // убираем научную нотацию
      u: u.toFixed(2),                     // строка только для JSON
      r,
      t,
      co2e: co2e.toFixed(6)
    });
  } catch (e: any) {
    console.error('EI calc error:', e.message || e);
    res.status(500).json({ error: 'Failed to compute EI' });
  }
});

const server = app.listen(CONTROL_PORT, () => {
  console.log(`Central control API listening on ${CONTROL_PORT}`);
});

// --- Decision loop ---
async function predictLoad(): Promise<number> {
  // Заглушка: здесь подключите TensorFlow.js / модели
  // Нынче: простой прогноз (случай) или возьмём текущую метрику через /metrics или логи
  // Например: запросим собственный endpoint /metrics и дернём last value или используем history
  try {
    // Пример: можно парсить ваш own metrics (при желании)
    return Math.random(); // заглушка: random 0..1
  } catch (e) {
    console.warn('predictLoad fallback', e);
    return 0;
  }
}

async function performPrefetch(opts?: Record<string, unknown>) {
  console.log('Performing prefetch with opts=', opts || {});
  // Заглушка: тут может быть rsync / scp / API вызов до edge.
  // Пример вызова rsync через docker host (если у вас настроен ssh/volume):
  // await execAsync(`rsync -avz /path/popular_files/ facultyA:/var/www/cache/`);
  // В локальном симе чаще: просто пометить состояние и логировать.
  state.prefetchActive = true;
  // Симулируем время префетча
  await new Promise((r) => setTimeout(r, 2000));
  state.prefetchActive = false;
  console.log('Prefetch done');
}

// Функция обновления CoreDNS (если вы меняете Corefile): write file & reload CoreDNS
async function updateCoreDNSRules(rules: Record<string, string>) {
  console.log('updateCoreDNSRules called', rules);
  // В контейнерной среде проще: центральный менеджер может запустить sed/echo на монтируемом Corefile
  // или вызвать внешний endpoint, который перезаписывает Corefile и отправляет SIGHUP в CoreDNS.
  // Здесь мы логируем — реализуйте реальное обновление в прод/симе.
  // Пример (псевдо):
  // await execAsync(`bash -c "echo '...new corefile...' > /path/to/Corefile && docker kill -s HUP secondary-dns"`);
}

// Основной цикл принятия решений
async function decisionLoop() {
  try {
    console.log('Decision loop tick at', new Date().toISOString());
    const predicted = await predictLoad();
    state.lastPredictedLambda = predicted;
    state.lastDecisionTs = Date.now();

    console.log(`Predicted lambda=${predicted.toFixed(3)}`);

    // Простая логика: если предсказание выше порога, запускаем prefetch
    if (predicted > CONFIG.load.threshold) {
      console.log('Predicted high load > threshold -> trigger prefetch and consider routing update');
      await performPrefetch({ predicted });
      // Можно обновить CoreDNS/zone чтобы направлять заранее трафик на разогретые edge:
      await updateCoreDNSRules({ action: 'route-to-edges' });
    } else {
      console.log('Predicted load normal (no action)');
    }
  } catch (e) {
    console.error('decisionLoop error:', e);
  }
}

// Запускаем цикл каждые deltaSeconds
setInterval(decisionLoop, CONFIG.load.deltaSeconds * 1000);

// Обработка graceful shutdown
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

// Чтобы контейнер не завершался: main.ts постоянно живёт (интервалы + express server)
console.log('Central manager main started. Decision loop deltaSeconds=', CONFIG.load.deltaSeconds);
