// monitoring/metrics.ts
import CONFIG from '../config';
import promClient from 'prom-client';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const promUrl = CONFIG.prometheus.url;
const register = new promClient.Registry();

const PREFIX = CONFIG.prefix;                    // e.g. "facultyA_"
const CONTAINER_NAME = CONFIG.metrics.containerName; // e.g. "facultyA-edge"
const NGINX_JOB = CONFIG.metrics.nginxJob;          // e.g. "nginx-facultyA"
const FACULTY_UPPER = CONFIG.faculty.toUpperCase(); // e.g. "FACULTYA"
const BOOKS_PATH = '/var/cache/nginx/elvira_cache';
const MAX_BOOKS_BYTES = CONFIG.cache.maxSizeBytes;

// ======================= DYNAMIC METRICS (with prefix) =======================
const lambdaGauge          = new promClient.Gauge({
  name: `${PREFIX}load_lambda`,
  help: `λ(t) — итоговая нагрузка 0-1 (${CONFIG.shortName})`
});

const powerWattsGauge      = new promClient.Gauge({
  name: `${PREFIX}power_watts`,
  help: `Текущая мощность (Вт) (${CONFIG.shortName})`
});

const energyTotalKwh       = new promClient.Counter({
  name: `${PREFIX}energy_kwh`,
  help: `Общее потребление энергии (kWh) (${CONFIG.shortName})`
});

const transitionsTotal     = new promClient.Counter({
  name: `${PREFIX}transitions_total`,
  help: `Количество переходов через порог (${CONFIG.shortName})`
});

// Host (node-exporter)
const hostCpuPercent       = new promClient.Gauge({
  name: `${PREFIX}host_cpu_percent`,
  help: `CPU хоста (%) — node-exporter (${CONFIG.shortName})`
});

// Container metrics (docker / logporter)
const containerCpuPercent  = new promClient.Gauge({
  name: `${PREFIX}cpu_load`,
  help: `CPU контейнера (%) — как в docker stats (${CONFIG.shortName})`
});

const containerMemBytes    = new promClient.Gauge({
  name: `${PREFIX}mem_usage_bytes`,
  help: `RAM контейнера (bytes) (${CONFIG.shortName})`
});

const containerMemPercent  = new promClient.Gauge({
  name: `${PREFIX}mem_load`,
  help: `RAM контейнера (%) (${CONFIG.shortName})`
});

const containerNetRxBytes  = new promClient.Gauge({
  name: `${PREFIX}net_rx_bytes_per_sec`,
  help: `Сеть входящая (bytes/sec) (${CONFIG.shortName})`
});

const containerNetTxBytes  = new promClient.Gauge({
  name: `${PREFIX}net_tx_bytes_per_sec`,
  help: `Сеть исходящая (bytes/sec) (${CONFIG.shortName})`
});

const containerDiskRead    = new promClient.Gauge({
  name: `${PREFIX}disk_read_bytes_per_sec`,
  help: `Диск чтение (bytes/sec) (${CONFIG.shortName})`
});

const containerDiskWrite   = new promClient.Gauge({
  name: `${PREFIX}disk_write_bytes_per_sec`,
  help: `Диск запись (bytes/sec) (${CONFIG.shortName})`
});

const containerPids        = new promClient.Gauge({
  name: `${PREFIX}process_count`,
  help: `Количество процессов в контейнере (${CONFIG.shortName})`
});

// Nginx (via nginx-exporter)
const nginxConnections     = new promClient.Gauge({
  name: `${PREFIX}nginx_connections_active`,
  help: `Активные соединения Nginx (${CONFIG.shortName})`
});

const nginxRequestsTotal   = new promClient.Gauge({
  name: `${PREFIX}requests_total`,
  help: `Всего запросов (R) (${CONFIG.shortName})`
});

const nginxRps             = new promClient.Gauge({
  name: `${PREFIX}requests_per_second`,
  help: `RPS за последнюю минуту (${CONFIG.shortName})`
});

// Books / cache (local filesystem scan)
const booksUsedBytes       = new promClient.Gauge({
  name: `${PREFIX}books_used_bytes`,
  help: `Занято в cache/books (bytes) (${CONFIG.shortName})`
});

const booksUsedMb          = new promClient.Gauge({
  name: `${PREFIX}books_used_mb`,
  help: `Занято в cache/books (MB) (${CONFIG.shortName})`
});

const booksUtilPercent     = new promClient.Gauge({
  name: `${PREFIX}books_util_percent`,
  help: `Заполненность cache/books (%) (${CONFIG.shortName})`
});

// Register all metrics
[
  lambdaGauge, powerWattsGauge, energyTotalKwh, transitionsTotal,
  hostCpuPercent, containerCpuPercent, containerMemBytes, containerMemPercent,
  containerNetRxBytes, containerNetTxBytes, containerDiskRead, containerDiskWrite,
  containerPids, nginxConnections, nginxRequestsTotal, nginxRps,
  booksUsedBytes, booksUsedMb, booksUtilPercent
].forEach(m => register.registerMetric(m));

// ======================= Prometheus query helper =======================
async function query(promql: string): Promise<number> {
  try {
    const r = await axios.get(`${promUrl}/api/v1/query`, {
      params: { query: promql },
      timeout: 4000
    });
    const val = r.data?.data?.result?.[0]?.value?.[1];
    return val ? parseFloat(val) : 0;
  } catch (err) {
    // Silent fail – common during startup
    return 0;
  }
}

// ======================= Filesystem scanner for cache =======================
async function scanDirectorySize(root: string): Promise<number> {
  let size = 0;
  try {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        size += await scanDirectorySize(fullPath);
      } else if (entry.isFile()) {
        try {
          size += (await fs.stat(fullPath)).size;
        } catch {}
      }
    }
  } catch {
    // Directory missing or permission issue → return 0
  }
  return size;
}

// ======================= Main metrics updater =======================
let previousLambda = 0;

export async function updateMetrics() {
  try {
    // 1. Host CPU % (from node-exporter)
    const hostCpu = await query(
      `100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle", job="host-node"}[1m])))`
    );
    hostCpuPercent.set(hostCpu);

    // 2. Container CPU %
    const containerCpu = await query(
      `100 * rate(docker_cpu_usage_total{containerName="${CONTAINER_NAME}"}[1m])`
    );
    containerCpuPercent.set(containerCpu || 0);

    // 3. Memory
    const memUsage = await query(`docker_memory_usage{containerName="${CONTAINER_NAME}"}`);
    const memTotal = await query(`docker_memory_total{containerName="${CONTAINER_NAME}"}`) || 2 * 1024 * 1024 * 1024;
    const memPercent = memTotal > 0 ? (memUsage / memTotal) * 100 : 0;
    containerMemBytes.set(memUsage);
    containerMemPercent.set(memPercent);

    // 4. Network
    const netRx = await query(`rate(docker_network_received_bytes{containerName="${CONTAINER_NAME}"}[1m])`);
    const netTx = await query(`rate(docker_network_transmit_bytes{containerName="${CONTAINER_NAME}"}[1m])`);
    containerNetRxBytes.set(netRx);
    containerNetTxBytes.set(netTx);

    // 5. Disk I/O
    const diskRead = await query(`rate(docker_io_read_bytes{containerName="${CONTAINER_NAME}"}[1m])`);
    const diskWrite = await query(`rate(docker_io_write_bytes{containerName="${CONTAINER_NAME}"}[1m])`);
    containerDiskRead.set(diskRead);
    containerDiskWrite.set(diskWrite);

    // 6. Processes
    const pids = await query(`docker_process_pids_count{containerName="${CONTAINER_NAME}"}`);
    containerPids.set(pids);

    // 7. Nginx metrics (using dynamic job name)
    const connections = await query(`nginx_connections_active{job="${NGINX_JOB}"}`);
    const requestsTotal = await query(`sum(nginx_http_requests_total{job="${NGINX_JOB}"})`);
    const rps = await query(`rate(nginx_http_requests_total{job="${NGINX_JOB}"}[1m])`);

    nginxConnections.set(connections);
    nginxRequestsTotal.set(requestsTotal);
    nginxRps.set(rps || 0);

    // 8. Books cache usage (local scan)
    const booksBytes = await scanDirectorySize(BOOKS_PATH);
    booksUsedBytes.set(booksBytes);
    booksUsedMb.set(booksBytes / (1024 * 1024));
    booksUtilPercent.set(MAX_BOOKS_BYTES > 0 ? (booksBytes / MAX_BOOKS_BYTES) * 100 : 0);

    // 9. Load factor λ(t)
    const cpuPart = hostCpu * 0.7;
    const connPart = CONFIG.simulation.peakCapacity
      ? (connections / CONFIG.simulation.peakCapacity) * 0.3
      : 0;
    const lambda = Math.min(1, cpuPart + connPart);
    lambdaGauge.set(lambda);

    // 10. Power consumption and energy
    const Pidle = CONFIG.energy.Pidle;
    const Ppeak = CONFIG.energy.Ppeak;
    const power = Pidle + (Ppeak - Pidle) * lambda;
    powerWattsGauge.set(power);
    energyTotalKwh.inc(power * 10 / 3600000); // 10-second interval

    // 11. Edge activation detection (transition)
    const threshold = CONFIG.load.threshold;
    if (lambda > threshold && previousLambda <= threshold) {
      const alphaKwh = CONFIG.energy.alpha / 3600000;
      energyTotalKwh.inc(alphaKwh);
      transitionsTotal.inc();
      console.log(`⚡ ${FACULTY_UPPER}: edge-activated (λ=${lambda.toFixed(3)}), +${alphaKwh.toFixed(6)} kWh`);
    }
    previousLambda = lambda;

  } catch (err) {
    console.error(`${FACULTY_UPPER} updateMetrics error:`, err);
  }
}

// Start periodic updates (every 10 seconds)
setInterval(updateMetrics, 10_000);
updateMetrics().catch(() => {});

// ======================= Reset metrics =======================
export async function resetMetrics() {
  try {
    energyTotalKwh.reset();
    transitionsTotal.reset();
    nginxRequestsTotal.set(0);
    lambdaGauge.set(0);
    powerWattsGauge.set(CONFIG.energy.Pidle);

    [
      containerCpuPercent, hostCpuPercent, containerMemPercent,
      nginxConnections, containerPids,
      containerNetRxBytes, containerNetTxBytes,
      containerDiskRead, containerDiskWrite,
      booksUsedBytes, booksUsedMb, booksUtilPercent
    ].forEach(g => g.set(0));

    previousLambda = 0;
    console.log(`Все метрики ${FACULTY_UPPER} сброшены`);
  } catch (err) {
    console.error(`${FACULTY_UPPER}: error while resetting metrics`, err);
    throw err;
  }
}

export { register };