// metrics.ts
import CONFIG from '../config';
import promClient from 'prom-client';
import axios from 'axios';
import express from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

const promUrl = 'http://172.20.0.5:9090';

// Инициализация реестра Prometheus для custom метрик
const register = new promClient.Registry();
const loadGauge = new promClient.Gauge({
  name: 'central_load_lambda',
  help: 'Combined load (Nginx + CPU + Memory) for central server'
});
const energyCounter = new promClient.Counter({
  name: 'central_energy_kwh',
  help: 'Total energy consumption for central server (kWh)'
});
const cpuLoadGauge = new promClient.Gauge({
  name: 'central_cpu_load',
  help: 'CPU load for central server'
});
const memLoadGauge = new promClient.Gauge({
  name: 'central_mem_load',
  help: 'Memory load for central server'
});
const nginxLoadGauge = new promClient.Gauge({
  name: 'central_nginx_load',
  help: 'Nginx load (active connections / peak capacity) for central server'
});
const transitionCounter = new promClient.Counter({
  name: 'central_transitions_total',
  help: 'Total server state transitions for central'
});
const booksUtilGauge = new promClient.Gauge({
  name: 'central_books_util', // percent 0-100
  help: 'Disk utilization % for /var/www/books (central)'
});
const booksUsedMbGauge = new promClient.Gauge({
  name: 'central_books_used_mb', // MB
  help: 'Real used space for /var/www/books (megabytes) on central'
});
const booksUsedGauge = new promClient.Gauge({  // NEW: Real used bytes for books
  name: 'central_books_used_bytes',
  help: 'Real disk used by /var/www/books dir (bytes)'
});

// Регистрация метрик в реестре
register.registerMetric(loadGauge);
register.registerMetric(energyCounter);
register.registerMetric(cpuLoadGauge);
register.registerMetric(memLoadGauge);
register.registerMetric(nginxLoadGauge);
register.registerMetric(transitionCounter);
register.registerMetric(booksUtilGauge);
register.registerMetric(booksUsedGauge);
register.registerMetric(booksUsedMbGauge);

let previousLambda = 0;

// Функция для получения CPU load из os
function getCpuLoad(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  cpus.forEach((cpu) => {
    const timesKeys = Object.keys(cpu.times) as (keyof typeof cpu.times)[];
    timesKeys.forEach((type) => {
      total += cpu.times[type];
      if (type === 'idle') {
        idle += cpu.times[type];
      }
    });
  });
  if (total === 0) return 0;
  return 1 - idle / total;
}


async function getDirectorySizeBytes(rootDir: string): Promise<number> {
  let total = 0;
  const stack = [rootDir];

  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      // permission or missing dir -> treat as 0 for metrics
      return total;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        try {
          const st = await fs.stat(full);
          total += st.size;
        } catch (e) {
          // if file disappears or unreadable, skip
        }
      } else if (entry.isDirectory()) {
        stack.push(full);
      } else {
        // ignore symlinks / others or optionally handle
      }
    }
  }
  return total;
}

async function getPromValue(query: string): Promise<number> {
  try {
    const res = await axios.get(`${promUrl}/api/v1/query?query=${encodeURIComponent(query)}`);
    const value = res.data.data.result[0]?.value[1] || '0';
    return parseFloat(value);
  } catch (e) {
    console.error(`Prom query error: ${query}`, e);
    return 0;
  }
}

export async function updateMetrics() {
  try {
    // Nginx load from prometheus
    const activeQuery = 'nginx_connections_active{job="nginx-central"}';
    const active = await getPromValue(activeQuery);
    const nginxLambda = active / CONFIG.simulation.peakCapacity;
    nginxLoadGauge.set(nginxLambda);

    // CPU load: Fallback to os (since cAdvisor per-container empty on WSL)
    let cpuLoad = getCpuLoad();
    cpuLoadGauge.set(cpuLoad);

    // Memory load: Fallback to os
    let memLoad = 1 - os.freemem() / os.totalmem();
    memLoadGauge.set(memLoad);

    const cachePath = '/var/www/elvira/books'; 
    try {
      const cacheBytes = await getDirectorySizeBytes(cachePath);
      // If you want percent util, define a capacity for cache (e.g. 500MB from proxy_cache max_size)
      const maxCacheBytes = 500 * 1024 * 1024; // example: 500MB as set in nginx proxy_cache_path max_size
      const cacheUtil = maxCacheBytes > 0 ? (cacheBytes / maxCacheBytes) * 100 : 0;

      booksUsedGauge.set(cacheBytes);           // bytes
      const mbUsed = cacheBytes / (1024 * 1024);
      booksUsedMbGauge.set(mbUsed);
      booksUtilGauge.set(cacheUtil);           // percent
    } catch (e) {
      booksUsedGauge.set(0);
      booksUtilGauge.set(0);
    }

    // Combined lambda (Nginx + CPU + Mem / 3)
    const combinedLambda = (nginxLambda + cpuLoad + memLoad) / 3;
    loadGauge.set(combinedLambda);

    // Power model
    const power = CONFIG.energy.Pidle + (CONFIG.energy.Ppeak - CONFIG.energy.Pidle) * combinedLambda;

    // Energy delta
    const energyDelta = power * CONFIG.load.deltaSeconds / 3600000;
    energyCounter.inc(energyDelta);

    // Detect transitions
    if (combinedLambda > CONFIG.load.threshold && previousLambda <= CONFIG.load.threshold) {
      const alphaKwh = CONFIG.energy.alpha / 3600000;
      energyCounter.inc(alphaKwh);
      transitionCounter.inc(1);
      console.log(`Transition detected (lambda ${previousLambda.toFixed(2)} -> ${combinedLambda.toFixed(2)} > ${CONFIG.load.threshold}) - added alpha ${alphaKwh.toFixed(4)} kWh`);
    }
    previousLambda = combinedLambda;

    //console.log(`Central: Nginx Lambda=${nginxLambda.toFixed(2)}, CPU Load=${cpuLoad.toFixed(2)}, Mem Load=${memLoad.toFixed(2)}, Books Util=${booksUtil.toFixed(2)}%, Books Used=${booksUsed / 1e6}MB, Combined Lambda=${combinedLambda.toFixed(2)}, Power=${power.toFixed(2)}W, Energy Delta=${energyDelta.toFixed(6)}kWh`);
  } catch (e) {
    console.error('Metrics update error in central:', e);
  }
}

// Запуск обновления метрик каждые deltaSeconds
setInterval(updateMetrics, CONFIG.load.deltaSeconds * 1000);

// HTTP-сервер для экспорта custom метрик в Prometheus (порт 3000)
const app = express();
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
app.listen(3000, () => console.log('Central custom metrics server running on port 3000'));