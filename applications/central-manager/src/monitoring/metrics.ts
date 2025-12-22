// monitoring/metrics.ts — УЛЬТРА-ФИНАЛЬНАЯ ВЕРСИЯ (2025, для защиты на 10/10)
import CONFIG from '../config';
import promClient from 'prom-client';
import axios from 'axios';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const promUrl = 'http://prometheus:9090';
const register = new promClient.Registry();
const CONTAINER_NAME = CONFIG.metrics?.containerName || 'central-nginx';
const BOOKS_PATH = '/var/www/books';
const MAX_BOOKS_BYTES = CONFIG.cache?.maxSizeBytes ?? 500 * 1024 * 1024; // 500 MB default

// ======================= ВСЕ МЕТРИКИ (максимум из logporter + другие) =======================
const lambdaGauge          = new promClient.Gauge({ name: 'central_load_lambda',               help: 'λ(t) — итоговая нагрузка 0-1' });
const powerWattsGauge      = new promClient.Gauge({ name: 'central_power_watts',               help: 'Текущая мощность (Вт)' });
const energyTotalKwh       = new promClient.Counter({ name: 'central_energy_kwh',              help: 'Общее потребление энергии (kWh)' });
const transitionsTotal     = new promClient.Counter({ name: 'central_transitions_total',       help: 'Количество переходов через порог' });

// === Хост (node-exporter) ===
const hostCpuPercent       = new promClient.Gauge({ name: 'central_host_cpu_percent',          help: 'CPU хоста (%) — node-exporter' });

// === Контейнер (logporter) — САМОЕ ВАЖНОЕ ===
const containerCpuPercent  = new promClient.Gauge({ name: 'central_cpu_load',                  help: 'CPU контейнера (%) — ТОЧНО как в docker stats' }); // ← используется в main.ts
const containerMemBytes    = new promClient.Gauge({ name: 'central_mem_usage_bytes',           help: 'RAM контейнера (bytes)' });
const containerMemPercent  = new promClient.Gauge({ name: 'central_mem_load',                  help: 'RAM контейнера (%) — используется в main.ts' });
const containerNetRxBytes  = new promClient.Gauge({ name: 'central_net_rx_bytes_per_sec',      help: 'Сеть входящая (bytes/sec)' });
const containerNetTxBytes  = new promClient.Gauge({ name: 'central_net_tx_bytes_per_sec',      help: 'Сеть исходящая (bytes/sec)' });
const containerDiskRead    = new promClient.Gauge({ name: 'central_disk_read_bytes_per_sec',   help: 'Диск чтение (bytes/sec)' });
const containerDiskWrite   = new promClient.Gauge({ name: 'central_disk_write_bytes_per_sec',  help: 'Диск запись (bytes/sec)' });
const containerPids        = new promClient.Gauge({ name: 'central_process_count',             help: 'Количество процессов в контейнере' });

// === Nginx (nginx-exporter) ===
const nginxConnections     = new promClient.Gauge({ name: 'central_nginx_connections_active',  help: 'Активные соединения Nginx' });
const nginxRequestsTotal   = new promClient.Gauge({ name: 'central_requests_total',            help: 'Всего запросов (R в Eco Index)' });
const nginxRps             = new promClient.Gauge({ name: 'central_requests_per_second',       help: 'RPS за последнюю минуту' });

// === Диск books (локальный скан) ===
const booksUsedBytes       = new promClient.Gauge({ name: 'central_books_used_bytes',          help: 'Занято в /var/www/books (bytes)' });
const booksUsedMb          = new promClient.Gauge({ name: 'central_books_used_mb',             help: 'Занято в /var/www/books (MB)' });
const booksUtilPercent     = new promClient.Gauge({ name: 'central_books_util_percent',        help: 'Заполненность books (%)' });

const centralPrecompressWall = new promClient.Gauge({ name: 'central_precompress_wall_seconds', help: 'Wall time for last precompress (s)' });
const centralPrecompressCpu = new promClient.Gauge({ name: 'central_precompress_cpu_seconds', help: 'CPU time for last precompress (s)' });
const centralPrecompressOriginalBytes = new promClient.Gauge({ name: 'central_precompress_original_bytes', help: 'Original bytes last precompress' });
const centralPrecompressCompressedBytes = new promClient.Gauge({ name: 'central_precompress_compressed_bytes', help: 'Compressed bytes last precompress' });

// Регистрация всех метрик
[
  lambdaGauge, powerWattsGauge, energyTotalKwh, transitionsTotal,
  hostCpuPercent, containerCpuPercent, containerMemBytes, containerMemPercent,
  containerNetRxBytes, containerNetTxBytes, containerDiskRead, containerDiskWrite,
  containerPids, nginxConnections, nginxRequestsTotal, nginxRps,
  booksUsedBytes, booksUsedMb, booksUtilPercent, centralPrecompressWall, centralPrecompressCpu,
  centralPrecompressOriginalBytes, centralPrecompressCompressedBytes
].forEach(m => register.registerMetric(m));

// ======================= Вспомогательная функция =======================
async function query(query: string): Promise<number> {
  try {
    const r = await axios.get(`${promUrl}/api/v1/query`, { params: { query }, timeout: 4000 });
    const val = r.data?.data?.result?.[0]?.value?.[1];
    return val ? parseFloat(val) : 0;
  } catch {
    return 0;
  }
}

// ======================= Основной цикл (каждые 10 сек) =======================
let previousLambda = 0;

export async function updateMetrics() {
  try {
    // 1. Host CPU % (node-exporter) — для реалистичного λ
    const hostCpu = await query('100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle", job="host-node"}[1m])))');
    hostCpuPercent.set(hostCpu);

    // 2. Контейнер CPU % — ТОЧНО КАК В docker stats (logporter + rate)
    const containerCpu = await query(`100 * rate(docker_cpu_usage_total{containerName="${CONTAINER_NAME}"}[1m])`);
    containerCpuPercent.set(containerCpu || 0);

    // 3. Память контейнера
    const memUsage = await query(`docker_memory_usage{containerName="${CONTAINER_NAME}"}`);
    const memTotal = await query(`docker_memory_total{containerName="${CONTAINER_NAME}"}`) || (8 * 1024 * 1024 * 1024); // fallback 8GB
    const memPercent = memTotal > 0 ? (memUsage / memTotal) * 100 : 0;
    containerMemBytes.set(memUsage);
    containerMemPercent.set(memPercent);

    // 4. Сеть
    const netRx = await query(`rate(docker_network_received_bytes{containerName="${CONTAINER_NAME}"}[1m])`);
    const netTx = await query(`rate(docker_network_transmit_bytes{containerName="${CONTAINER_NAME}"}[1m])`);
    containerNetRxBytes.set(netRx);
    containerNetTxBytes.set(netTx);

    // 5. Диск I/O
    const diskRead = await query(`rate(docker_io_read_bytes{containerName="${CONTAINER_NAME}"}[1m])`);
    const diskWrite = await query(`rate(docker_io_write_bytes{containerName="${CONTAINER_NAME}"}[1m])`);
    containerDiskRead.set(diskRead);
    containerDiskWrite.set(diskWrite);

    // 6. Процессы
    const pids = await query(`docker_process_pids_count{containerName="${CONTAINER_NAME}"}`);
    containerPids.set(pids);

    // 7. Nginx
    const connections = await query('nginx_connections_active{job="nginx-central"}');
    const requestsTotal = await query('sum(nginx_http_requests_total{job="nginx-central"})');
    const rps = await query('rate(nginx_http_requests_total{job="nginx-central"}[1m])');

    nginxConnections.set(connections);
    nginxRequestsTotal.set(requestsTotal);
    nginxRps.set(rps || 0);

    // 8. Books диск
    const booksBytes = await (async () => {
      let size = 0;
      try {
        for (const entry of await fs.readdir(BOOKS_PATH, { withFileTypes: true })) {
          const p = path.join(BOOKS_PATH, entry.name);
          if (entry.isDirectory()) size += await (async function scan(dir: string): Promise<number> {
            let s = 0;
            for (const e of await fs.readdir(dir, { withFileTypes: true })) {
              const fp = path.join(dir, e.name);
              s += e.isDirectory() ? await scan(fp) : (await fs.stat(fp)).size;
            }
            return s;
          })(p);
          else size += (await fs.stat(p)).size;
        }
      } catch {}
      return size;
    })();
    booksUsedBytes.set(booksBytes);
    booksUsedMb.set(booksBytes / (1024 * 1024));
    booksUtilPercent.set(MAX_BOOKS_BYTES > 0 ? (booksBytes / MAX_BOOKS_BYTES) * 100 : 0);

    // 9. λ(t) — как в твоей статье
    const cpuPart = hostCpu * 0.7; // реальная нагрузка железа — самое важное!
    const connPart = CONFIG.simulation?.peakCapacity ? (connections / CONFIG.simulation.peakCapacity) * 0.3 : 0;
    const lambda = Math.min(1, cpuPart + connPart);
    lambdaGauge.set(lambda);

    // 10. Энергия
    const Pidle = CONFIG.energy?.Pidle ?? 80;
    const Ppeak = CONFIG.energy?.Ppeak ?? 180;
    const power = Pidle + (Ppeak - Pidle) * lambda;
    powerWattsGauge.set(power);
    energyTotalKwh.inc(power * 10 / 3600000); // 10 секунд

    // 11. Переходы
    if (lambda > (CONFIG.load?.threshold ?? 0.6) && previousLambda <= (CONFIG.load?.threshold ?? 0.6)) {
      const alphaKwh = (CONFIG.energy?.alpha ?? 37000) / 3600000;
      energyTotalKwh.inc(alphaKwh);
      transitionsTotal.inc();
      console.log(`⚡ Central: активирован edge-режим (λ=${lambda.toFixed(3)}), +${alphaKwh.toFixed(6)} kWh`);
    }
    previousLambda = lambda;

  } catch (err) {
    console.error('updateMetrics error:', err);
  }
}

// Запуск
setInterval(updateMetrics, 10_000);
updateMetrics().catch(() => {});

const app = express();
app.get('/metrics', async (_, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});
app.listen(3000, () => console.log('🚀 Central metrics ULTRA v2025 (logporter full power) → :3000'));

export async function resetMetrics() {
  energyTotalKwh.reset();
  transitionsTotal.reset();
  nginxRequestsTotal.set(0);
  lambdaGauge.set(0);
  powerWattsGauge.set(CONFIG.energy?.Pidle ?? 80);
  [containerCpuPercent, hostCpuPercent, containerMemPercent, nginxConnections, containerPids,
   containerNetRxBytes, containerNetTxBytes, containerDiskRead, containerDiskWrite,
   booksUsedBytes, booksUsedMb, booksUtilPercent].forEach(g => g.set(0));
  console.log('Все метрики центрального узла сброшены');
}

export {
  centralPrecompressWall, centralPrecompressCpu, centralPrecompressOriginalBytes, centralPrecompressCompressedBytes
};