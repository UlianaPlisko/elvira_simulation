// monitoring/metrics.ts
import CONFIG from '../config';
import promClient from 'prom-client';
import axios from 'axios';
import express from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

const promUrl = CONFIG.prometheus?.url || 'http://172.20.0.5:9090'; // uses CONFIG override if present

// Prometheus registry & metrics (same as before)
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
  help: 'Disk utilization % for /var/www/books (central) - best-effort'
});
const booksUsedMbGauge = new promClient.Gauge({
  name: 'central_books_used_mb', // MB
  help: 'Real used space for /var/www/books (megabytes) on central - best-effort'
});
const booksUsedGauge = new promClient.Gauge({
  name: 'central_books_used_bytes',
  help: 'Real disk used by /var/www/books dir (bytes) - best-effort'
});

// register metrics
register.registerMetric(loadGauge);
register.registerMetric(energyCounter);
register.registerMetric(cpuLoadGauge);
register.registerMetric(memLoadGauge);
register.registerMetric(nginxLoadGauge);
register.registerMetric(transitionCounter);
register.registerMetric(booksUtilGauge);
register.registerMetric(booksUsedGauge);
register.registerMetric(booksUsedMbGauge);

// internal state for transition detection
let previousLambda = 0;

// ---------- Helpers to query Prometheus ----------

// returns the first scalar value (or 0) from a Prometheus instant query
async function getPromValue(query: string): Promise<number> {
  try {
    const res = await axios.get(`${promUrl}/api/v1/query`, {
      params: { query }
    });
    const result = res.data?.data?.result;
    if (!result || result.length === 0) return 0;
    // if result[0].value exists, return it; otherwise 0
    const val = result[0].value?.[1];
    return val ? parseFloat(val) : 0;
  } catch (e) {
    console.error(`Prom query error (scalar): ${query}`, e);
    return 0;
  }
}

// returns the SUM of all numeric values returned by a Prometheus instant query
async function getPromSum(query: string): Promise<number> {
  try {
    const res = await axios.get(`${promUrl}/api/v1/query`, {
      params: { query }
    });
    const result = res.data?.data?.result || [];
    let sum = 0;
    for (const row of result) {
      const v = row.value?.[1];
      if (v !== undefined) sum += parseFloat(v);
    }
    return sum;
  } catch (e) {
    console.error(`Prom query error (sum): ${query}`, e);
    return 0;
  }
}

// probe candidate selectors and return the first that yields data
async function discoverSelector(): Promise<string | null> {
  // allow explicit override in CONFIG
  if (CONFIG.metrics?.selector) {
    return CONFIG.metrics.selector;
  }

  // candidate label matchers (ordered). The container name from your docker stats is included.
  const candidates = [
    // common docker-compose label
    'container_label_com_docker_compose_service="central-nginx"',
    'container_label_com_docker_compose_service="central"',
    // direct container name (from docker stats you pasted)
    'container_name=~"elvira_simulation-central-nginx-1"',
    // alternative label names some setups expose
    'name=~"elvira_simulation-central-nginx-1"',
    // fallback to matching images or service-like names (less strict)
    'container_name=~"central.*"',
    'container_label_com_docker_compose_project="elvira_simulation"'
  ];

  for (const sel of candidates) {
    try {
      // quick existence check: does container_cpu_usage_seconds_total have any samples with this selector?
      const q = `count(container_cpu_usage_seconds_total{${sel}})`;
      const cnt = await getPromValue(q);
      if (cnt > 0) {
        console.log(`Prom selector discovered: ${sel}`);
        return sel;
      }
    } catch (e) {
      // ignore and try next
    }
  }

  console.warn('No Prom selector discovered for central container (cAdvisor metrics). You may set CONFIG.metrics.selector to a working label matcher.');
  return null;
}

// ---------- cAdvisor-backed metrics helpers ----------

async function getContainerCpuFraction(selector: string | null): Promise<number> {
  if (!selector) return 0;
  // sum of rates across CPUs for container -> yields CPU cores used (e.g. 0.05 = 0.05 CPU)
  // use 1m rate to be responsive but you can increase window to 5m if noisy
  const query = `sum(rate(container_cpu_usage_seconds_total{${selector}}[1m]))`;
  const cpuCoresUsed = await getPromValue(query);
  const hostCores = Math.max(1, os.cpus().length);
  // fraction 0..1 of total host CPU capacity
  const fraction = Math.min(1, cpuCoresUsed / hostCores);
  return fraction;
}

async function getContainerMemFraction(selector: string | null): Promise<{ fraction: number, usageBytes: number, limitBytes: number }> {
  if (!selector) return { fraction: 0, usageBytes: 0, limitBytes: 0 };

  // total usage and total limit for the container
  const usageQ = `sum(container_memory_usage_bytes{${selector}})`;
  const limitQ = `sum(container_spec_memory_limit_bytes{${selector}})`;
  const usage = await getPromValue(usageQ);
  const limit = await getPromValue(limitQ);

  if (limit > 0) {
    return { fraction: Math.min(1, usage / limit), usageBytes: usage, limitBytes: limit };
  }
  // fallback to host-based fraction if limit missing
  const hostFrac = limit === 0 ? (usage / os.totalmem()) : Math.min(1, usage / limit);
  return { fraction: Math.min(1, hostFrac), usageBytes: usage, limitBytes: limit };
}

async function getContainerFsUsageBytes(selector: string | null): Promise<number> {
  if (!selector) return 0;
  // cAdvisor exposes container_fs_usage_bytes per container/mount; sum it up
  const q = `sum(container_fs_usage_bytes{${selector}})`;
  const bytes = await getPromValue(q);
  return bytes;
}

// fallback local directory size scan (left in case you want an exact directory fetch)
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
        // ignore symlinks / others
      }
    }
  }
  return total;
}

// ---------- Reset function (keeps original behaviour) ----------
export async function resetMetrics() {
  try {
    if (typeof register.resetMetrics === 'function') {
      // @ts-ignore
      register.resetMetrics();
    }

    loadGauge.set(0);
    cpuLoadGauge.set(0);
    memLoadGauge.set(0);
    nginxLoadGauge.set(0);
    booksUtilGauge.set(0);
    booksUsedGauge.set(0);
    booksUsedMbGauge.set(0);

    previousLambda = 0;
    console.log('Central: custom metrics reset to zero');
  } catch (err) {
    console.error('Central: error while resetting metrics', err);
    throw err;
  }
}

// ---------- Main update flow ----------
let discoveredSelector: string | null = null;
let discoveryAttempted = false;

export async function updateMetrics() {
  try {
    // discover the selector on first run (or use CONFIG override)
    if (!discoveryAttempted) {
      discoveryAttempted = true;
      discoveredSelector = await discoverSelector();
    }

    // --- Nginx load via Prometheus (unchanged) ---
    const activeQuery = 'nginx_connections_active{job="nginx-central"}';
    const active = await getPromValue(activeQuery);
    const nginxLambda = CONFIG.simulation?.peakCapacity ? (active / CONFIG.simulation.peakCapacity) : 0;
    nginxLoadGauge.set(nginxLambda);

    // --- CPU from cAdvisor via Prometheus (if discovered) ---
    let cpuLoad = 0;
    try {
      if (discoveredSelector) {
        cpuLoad = await getContainerCpuFraction(discoveredSelector);
      } else {
        // fallback to host os if we can't find cAdvisor selector
        const cpuCores = os.cpus();
        // previous method: fraction of total CPU time used (instant) - kept as fallback
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        cpus.forEach((cpu) => {
          const timesKeys = Object.keys(cpu.times) as (keyof typeof cpu.times)[];
          timesKeys.forEach((type) => {
            total += cpu.times[type];
            if (type === 'idle') idle += cpu.times[type];
          });
        });
        cpuLoad = total === 0 ? 0 : (1 - idle / total);
        cpuLoad = Math.min(1, cpuLoad);
      }
    } catch (e) {
      console.warn('Failed to get CPU from cAdvisor, falling back to os sample:', e);
    }
    cpuLoadGauge.set(cpuLoad);

    // --- Memory from cAdvisor via Prometheus ---
    let memLoad = 0;
    try {
      if (discoveredSelector) {
        const mem = await getContainerMemFraction(discoveredSelector);
        memLoad = mem.fraction;
      } else {
        memLoad = 1 - os.freemem() / os.totalmem();
      }
    } catch (e) {
      console.warn('Failed to get memory from cAdvisor, falling back to os sample:', e);
      memLoad = 1 - os.freemem() / os.totalmem();
    }
    memLoadGauge.set(memLoad);

    // --- Books (disk) usage: try cAdvisor fs usage, else fallback to directory scan ---
    const cachePath = '/var/www/elvira/books';
    try {
      let cacheBytes = 0;
      if (discoveredSelector) {
        // try to use container_fs_usage_bytes (best-effort: it's total fs used by container)
        const fsBytes = await getContainerFsUsageBytes(discoveredSelector);
        if (fsBytes > 0) {
          // We can't get a per-directory value from cAdvisor; use total fs bytes as a proxy
          cacheBytes = fsBytes;
        } else {
          // fallback to local directory calculation
          cacheBytes = await getDirectorySizeBytes(cachePath);
        }
      } else {
        cacheBytes = await getDirectorySizeBytes(cachePath);
      }

      // if you have a known cache capacity, use it; else fall back to 500MB as before
      const maxCacheBytes = CONFIG.cache?.maxSizeBytes ?? (500 * 1024 * 1024);
      const cacheUtil = maxCacheBytes > 0 ? (cacheBytes / maxCacheBytes) * 100 : 0;
      booksUsedGauge.set(cacheBytes);
      booksUsedMbGauge.set(cacheBytes / (1024 * 1024));
      booksUtilGauge.set(cacheUtil);
    } catch (e) {
      booksUsedGauge.set(0);
      booksUsedMbGauge.set(0);
      booksUtilGauge.set(0);
    }

    // --- Combined lambda (Nginx + CPU + Mem / 3) ---
    const combinedLambda = (nginxLambda + cpuLoad + memLoad) / 3;
    loadGauge.set(combinedLambda);

    // --- Power model & energy accounting (same as before) ---
    const power = CONFIG.energy.Pidle + (CONFIG.energy.Ppeak - CONFIG.energy.Pidle) * combinedLambda;
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
  } catch (e) {
    console.error('Metrics update error in central:', e);
  }
}

// start periodic updates
setInterval(updateMetrics, (CONFIG.load?.deltaSeconds ?? 10) * 1000);

// HTTP export endpoint
const app = express();
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (e) {
    res.status(500).send('failed to collect metrics');
  }
});
app.listen(3000, () => console.log('Central custom metrics server running on port 3000'));
