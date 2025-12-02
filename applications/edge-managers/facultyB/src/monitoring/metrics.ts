// monitoring/metrics.ts
import CONFIG from '../config';
import promClient from 'prom-client';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const promUrl = CONFIG.prometheus?.url || 'http://prometheus:9090';
const register = new promClient.Registry();

const CONTAINER_NAME = CONFIG.metrics?.containerName || 'facultyB-edge';
const BOOKS_PATH = '/var/cache/nginx/elvira_cache';
const MAX_BOOKS_BYTES = CONFIG.cache?.maxSizeBytes ?? 500 * 1024 * 1024; // default 500MB for an edge

// ======================= METRICS (prefixed facultyB_) =======================
const lambdaGauge          = new promClient.Gauge({ name: 'facultyB_load_lambda',               help: 'λ(t) — итоговая нагрузка 0-1 (facultyB)' });
const powerWattsGauge      = new promClient.Gauge({ name: 'facultyB_power_watts',               help: 'Текущая мощность (Вт) (facultyB)' });
const energyTotalKwh       = new promClient.Counter({ name: 'facultyB_energy_kwh',              help: 'Общее потребление энергии (kWh) (facultyB)' });
const transitionsTotal     = new promClient.Counter({ name: 'facultyB_transitions_total',       help: 'Количество переходов через порог (facultyB)' });

// Host (node-exporter)
const hostCpuPercent       = new promClient.Gauge({ name: 'facultyB_host_cpu_percent',          help: 'CPU хоста (%) — node-exporter (facultyB)' });

// Container (logporter / docker metrics)
const containerCpuPercent  = new promClient.Gauge({ name: 'facultyB_cpu_load',                  help: 'CPU контейнера (%) — как в docker stats (facultyB)' });
const containerMemBytes    = new promClient.Gauge({ name: 'facultyB_mem_usage_bytes',           help: 'RAM контейнера (bytes) (facultyB)' });
const containerMemPercent  = new promClient.Gauge({ name: 'facultyB_mem_load',                  help: 'RAM контейнера (%) (facultyB)' });
const containerNetRxBytes  = new promClient.Gauge({ name: 'facultyB_net_rx_bytes_per_sec',      help: 'Сеть входящая (bytes/sec) (facultyB)' });
const containerNetTxBytes  = new promClient.Gauge({ name: 'facultyB_net_tx_bytes_per_sec',      help: 'Сеть исходящая (bytes/sec) (facultyB)' });
const containerDiskRead    = new promClient.Gauge({ name: 'facultyB_disk_read_bytes_per_sec',   help: 'Диск чтение (bytes/sec) (facultyB)' });
const containerDiskWrite   = new promClient.Gauge({ name: 'facultyB_disk_write_bytes_per_sec',  help: 'Диск запись (bytes/sec) (facultyB)' });
const containerPids        = new promClient.Gauge({ name: 'facultyB_process_count',             help: 'Количество процессов в контейнере (facultyB)' });

// Nginx (nginx-exporter)
const nginxConnections     = new promClient.Gauge({ name: 'facultyB_nginx_connections_active',  help: 'Активные соединения Nginx (facultyB)' });
const nginxRequestsTotal   = new promClient.Gauge({ name: 'facultyB_requests_total',            help: 'Всего запросов (R) (facultyB)' });
const nginxRps             = new promClient.Gauge({ name: 'facultyB_requests_per_second',       help: 'RPS за последнюю минуту (facultyB)' });

// Books disk / cache (local scan)
const booksUsedBytes       = new promClient.Gauge({ name: 'facultyB_books_used_bytes',          help: 'Занято в cache/books (bytes) (facultyB)' });
const booksUsedMb          = new promClient.Gauge({ name: 'facultyB_books_used_mb',             help: 'Занято в cache/books (MB) (facultyB)' });
const booksUtilPercent     = new promClient.Gauge({ name: 'facultyB_books_util_percent',        help: 'Заполненность cache/books (%) (facultyB)' });

// Register all metrics
[
  lambdaGauge, powerWattsGauge, energyTotalKwh, transitionsTotal,
  hostCpuPercent, containerCpuPercent, containerMemBytes, containerMemPercent,
  containerNetRxBytes, containerNetTxBytes, containerDiskRead, containerDiskWrite,
  containerPids, nginxConnections, nginxRequestsTotal, nginxRps,
  booksUsedBytes, booksUsedMb, booksUtilPercent
].forEach(m => register.registerMetric(m));

// ======================= helper: prom query =======================
async function query(query: string): Promise<number> {
  try {
    const r = await axios.get(`${promUrl}/api/v1/query`, { params: { query }, timeout: 4000 });
    const val = r.data?.data?.result?.[0]?.value?.[1];
    return val ? parseFloat(val) : 0;
  } catch {
    return 0;
  }
}

// ======================= filesystem scanner for BOOKS_PATH =======================
async function scanDirectorySize(root: string): Promise<number> {
  let size = 0;
  try {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      const p = path.join(root, entry.name);
      if (entry.isDirectory()) {
        size += await scanDirectorySize(p);
      } else if (entry.isFile()) {
        try { size += (await fs.stat(p)).size; } catch {}
      }
    }
  } catch {
    // missing dir / permissions -> return 0
  }
  return size;
}

// ======================= Main metrics updater =======================
let previousLambda = 0;

export async function updateMetrics() {
  try {
    // 1. Host CPU % (node-exporter) — used for realistic λ
    const hostCpu = await query(`100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle", job="host-node"}[1m])))`);
    hostCpuPercent.set(hostCpu);

    // 2. Container CPU % — like docker stats (logporter)
    const containerCpu = await query(`100 * rate(docker_cpu_usage_total{containerName="${CONTAINER_NAME}"}[1m])`);
    containerCpuPercent.set(containerCpu || 0);

    // 3. Memory container
    const memUsage = await query(`docker_memory_usage{containerName="${CONTAINER_NAME}"}`);
    const memTotal = await query(`docker_memory_total{containerName="${CONTAINER_NAME}"}`) || (2 * 1024 * 1024 * 1024); // fallback 2GB for small edge
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

    // 7. Nginx
    const connections = await query('nginx_connections_active{job="nginx-facultyB"}');
    const requestsTotal = await query('sum(nginx_http_requests_total{job="nginx-facultyB"})');
    const rps = await query('rate(nginx_http_requests_total{job="nginx-facultyB"}[1m])');

    nginxConnections.set(connections);
    nginxRequestsTotal.set(requestsTotal);
    nginxRps.set(rps || 0);

    // 8. Books / cache disk — local scan
    const booksBytes = await (async () => {
      try {
        return await scanDirectorySize(BOOKS_PATH);
      } catch {
        return 0;
      }
    })();
    booksUsedBytes.set(booksBytes);
    booksUsedMb.set(booksBytes / (1024 * 1024));
    booksUtilPercent.set(MAX_BOOKS_BYTES > 0 ? (booksBytes / MAX_BOOKS_BYTES) * 100 : 0);

    // 9. λ(t)
    const cpuPart = hostCpu * 0.7;
    const connPart = CONFIG.simulation?.peakCapacity ? (connections / CONFIG.simulation.peakCapacity) * 0.3 : 0;
    const lambda = Math.min(1, cpuPart + connPart);
    lambdaGauge.set(lambda);

    // 10. Power & energy
    const Pidle = CONFIG.energy?.Pidle ?? 30;
    const Ppeak = CONFIG.energy?.Ppeak ?? 80;
    const power = Pidle + (Ppeak - Pidle) * lambda;
    powerWattsGauge.set(power);
    energyTotalKwh.inc(power * 10 / 3600000); // 10 seconds tick

    // 11. Transitions detection
    if (lambda > (CONFIG.load?.threshold ?? 0.6) && previousLambda <= (CONFIG.load?.threshold ?? 0.6)) {
      const alphaKwh = (CONFIG.energy?.alpha ?? 37000) / 3600000;
      energyTotalKwh.inc(alphaKwh);
      transitionsTotal.inc();
      console.log(`⚡ FacultyB: edge-activated (λ=${lambda.toFixed(3)}), +${alphaKwh.toFixed(6)} kWh`);
    }
    previousLambda = lambda;

  } catch (err) {
    console.error('facultyB updateMetrics error:', err);
  }
}

// Start periodic updates
setInterval(updateMetrics, 10_000);
updateMetrics().catch(() => {});

// Reset function exported to main
export async function resetMetrics() {
  try {
    energyTotalKwh.reset();
    transitionsTotal.reset();
    nginxRequestsTotal.set(0);
    lambdaGauge.set(0);
    powerWattsGauge.set(CONFIG.energy?.Pidle ?? 30);

    [
      containerCpuPercent, hostCpuPercent, containerMemPercent, nginxConnections, containerPids,
      containerNetRxBytes, containerNetTxBytes, containerDiskRead, containerDiskWrite,
      booksUsedBytes, booksUsedMb, booksUtilPercent
    ].forEach(g => g.set(0));

    previousLambda = 0;
    console.log('Все метрики FacultyB сброшены');
  } catch (err) {
    console.error('FacultyB: error while resetting metrics', err);
    throw err;
  }
}
export { register };
