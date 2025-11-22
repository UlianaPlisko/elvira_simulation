// monitoring/metrics.ts
import promClient from 'prom-client';
import os from 'os';
import fs from 'fs/promises';
import CONFIG from '../config';

// Registry и метрики (префикс facultyA_)
const register = new promClient.Registry();

const loadGauge = new promClient.Gauge({
  name: 'facultyA_load_lambda',
  help: 'Combined load (Nginx + CPU + Memory) for faculty A edge'
});
const energyCounter = new promClient.Counter({
  name: 'facultyA_energy_kwh',
  help: 'Total energy consumption for faculty A (kWh)'
});
const cpuLoadGauge = new promClient.Gauge({
  name: 'facultyA_cpu_load',
  help: 'CPU load for faculty A'
});
const memLoadGauge = new promClient.Gauge({
  name: 'facultyA_mem_load',
  help: 'Memory load for faculty A'
});
const nginxLoadGauge = new promClient.Gauge({
  name: 'facultyA_nginx_load',
  help: 'Nginx load (active connections / peak capacity) for faculty A'
});
const transitionCounter = new promClient.Counter({
  name: 'facultyA_transitions_total',
  help: 'Total server state transitions for faculty A'
});
const booksUtilGauge = new promClient.Gauge({
  name: 'facultyA_books_util',
  help: 'Disk utilization % for /var/www/facultyA/books (static content)'
});
const booksUsedGauge = new promClient.Gauge({
  name: 'facultyA_books_used_bytes',
  help: 'Real disk used by /var/www/facultyA/books dir (bytes)'
});

register.registerMetric(loadGauge);
register.registerMetric(energyCounter);
register.registerMetric(cpuLoadGauge);
register.registerMetric(memLoadGauge);
register.registerMetric(nginxLoadGauge);
register.registerMetric(transitionCounter);
register.registerMetric(booksUtilGauge);
register.registerMetric(booksUsedGauge);

// Вспомогательные
function getCpuLoad(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  cpus.forEach((cpu) => {
    (Object.keys(cpu.times) as (keyof typeof cpu.times)[]).forEach((t) => {
      total += cpu.times[t];
      if (t === 'idle') idle += cpu.times[t];
    });
  });
  if (total === 0) return 0;
  return 1 - idle / total;
}

let previousLambda = 0;

export async function updateMetrics() {
  try {
    // nginx active connections — ожидается, что Prometheus собирает nginx exporter с лейблом job="nginx-facultyA"
    // Если exporter недоступен локально, можно менять источник.
    const peak = CONFIG.simulation.peakCapacity;

    // Попробуем получить active через /proc или через внешние источники в main; здесь — набросок:
    // fallback: 0 если нет данных (в metrics.ts мы обычно не дергаем Prometheus)
    const nginxLambda = 0; // если хотите, замените на реальную локальную проверку
    nginxLoadGauge.set(nginxLambda);

    // CPU / Mem
    const cpuLoad = getCpuLoad();
    cpuLoadGauge.set(cpuLoad);
    const memLoad = 1 - os.freemem() / os.totalmem();
    memLoadGauge.set(memLoad);

    // Books statfs
    try {
      const stats = await fs.statfs('/var/www/facultyA/books');
      const booksUsed = (stats.blocks - stats.bfree) * stats.bsize;
      const booksTotal = stats.blocks * stats.bsize;
      const booksUtil = booksTotal > 0 ? (booksUsed / booksTotal) * 100 : 0;
      booksUsedGauge.set(booksUsed);
      booksUtilGauge.set(booksUtil);
    } catch (e) {
      // В контейнере statfs может быть недоступен или путь не замончен — ставим 0
      booksUsedGauge.set(0);
      booksUtilGauge.set(0);
    }

    // Combined lambda (nginx taken as 0 here; основную нагрузку будет считать main через Prometheus)
    const combinedLambda = (nginxLambda + cpuLoad + memLoad) / 3;
    loadGauge.set(combinedLambda);

    // Power model
    const power = CONFIG.energy.Pidle + (CONFIG.energy.Ppeak - CONFIG.energy.Pidle) * combinedLambda;
    const energyDelta = power * CONFIG.load.deltaSeconds / 3600000;
    energyCounter.inc(energyDelta);

    // Detect transitions
    if (combinedLambda > CONFIG.load.threshold && previousLambda <= CONFIG.load.threshold) {
      const alphaKwh = CONFIG.energy.alpha / 3600000;
      energyCounter.inc(alphaKwh);
      transitionCounter.inc(1);
    }
    previousLambda = combinedLambda;
  } catch (e) {
    console.error('facultyA metrics update error:', e);
  }
}

// Запускаем обновление циклически
setInterval(updateMetrics, (CONFIG.load.deltaSeconds || 30) * 1000);
updateMetrics().catch(() => {});

// Экспорт /metrics для Prometheus (порт для facultyA metrics server; можно изменить)
import express from 'express';
const app = express();
const METRICS_PORT = 3002; // Prometheus должен скрапить этот порт (обновите prometheus.yml)

app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (e) {
    res.status(500).send('failed to collect metrics');
  }
});

app.listen(METRICS_PORT, () => {
  console.log(`FacultyA custom metrics server running on port ${METRICS_PORT}`);
});
