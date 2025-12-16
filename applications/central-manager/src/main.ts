// applications/central-manager/src/main.ts 
import './monitoring/metrics';
import { setDnsMode, getCurrentDnsMode} from './control/dnsControl';
import { startUsecase2Client, stopUsecase2Client } from './control/simulatorControl';
import { precompressFile, PrecompressResult } from './compression/precompress'
import {
  centralPrecompressWall,
  centralPrecompressCpu,
  centralPrecompressOriginalBytes,
  centralPrecompressCompressedBytes
} from './monitoring/metrics';
import { applyCentralNginxConfig, applyEdgeNginxConfig, clearEdgeCaches } from './control/nginxConfigControl';
console.log('🚀 Central metrics ULTRA загружены');
import CONFIG from './config';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs/promises';
import child_process from 'child_process';
import util from 'util';
import { resetMetrics } from './monitoring/metrics';
import { startSimulator, stopSimulator, getSimulatorStatus} from './control/simulatorControl';

const app = express();
const exec = util.promisify(child_process.exec);
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

export type Strategy = 1 | 2 | 3;
export type Algo = 'gzip' | 'brotli';

app.post('/usecase2/start', async (req, res) => {
  try {
    const strategy = Number(req.body.strategy ?? process.env.STRATEGY ?? 1) as Strategy;
    const algo = String(req.body.compression ?? process.env.COMPRESS_ALGO ?? 'gzip') as Algo;
    const level = Number(req.body.level ?? process.env.COMPRESS_LEVEL ?? 6);
    const file = String(req.body.file ?? 'book1.pdf');

    console.log(`uc2 start: strategy=${strategy}, algo=${algo}, level=${level}, file=${file}`);

    // === Precompression (only for strategies 2 and 3) ===
    let precomp: PrecompressResult | null = null;
    if (strategy !== 1) {
      console.log('[uc2] precompressing on central...', file, algo, level);
      precomp = await precompressFile(file, algo, level);
      try {
        centralPrecompressWall.set(precomp.central_compress_wall_s);
        centralPrecompressCpu.set(precomp.central_compress_cpu_s);
        centralPrecompressOriginalBytes.set(precomp.originalBytes);
        centralPrecompressCompressedBytes.set(precomp.compressedBytes);
      } catch (e) {
        console.warn('[uc2] cannot set precompress gauges:', e);
      }
    }

    // === Apply NGINX configs ===
    await applyCentralNginxConfig(strategy, algo);
    await applyEdgeNginxConfig(strategy === 2);

    console.log('clearing caches');
    await clearEdgeCaches();

    // === Cache warm-up ===
    const edgeContainer = 'facultyA-edge';
    const warmCmd = `docker exec ${edgeContainer} sh -c "curl -s -o /dev/null -w '%{http_code} %{time_total}' http://localhost/books/${file}"`;
    try {
      const { stdout } = await exec(warmCmd);
      console.log('[uc2] cache-warm result:', stdout.trim());
    } catch (e) {
      console.warn('[uc2] cache-warm failed:', e);
    }
    await new Promise(r => setTimeout(r, 800));

    // === Energy constants ===
    const originalSize = precomp ? precomp.originalBytes : (await fs.stat(`/var/www/books/${file}`)).size;
    const compressedSize = precomp ? precomp.compressedBytes : originalSize;

    const STATIC_TRANSFER_MJ_PER_BYTE = Number(process.env.STATIC_TRANSFER_MJ_PER_BYTE) || 0.00005;
    const CPU_WATTS = Number(process.env.CPU_WATTS) || 15;

    const central_to_edge_bytes = strategy === 1 ? originalSize : compressedSize;
    const edge_to_client_bytes = strategy === 1 ? originalSize : (strategy === 2 ? originalSize : compressedSize);
    const transfer_energy_mJ = (central_to_edge_bytes + edge_to_client_bytes) * STATIC_TRANSFER_MJ_PER_BYTE;

    const central_compress_energy_mJ = precomp ? precomp.central_compress_cpu_s * CPU_WATTS * 1000 : 0;

    // === Prometheus query helper ===
    const promQuery = async (query: string): Promise<number> => {
      try {
        const r = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
          params: { query },
          timeout: 5000
        });
        return parseFloat(r.data?.data?.result?.[0]?.value?.[1] ?? '0');
      } catch (e) {
        console.warn('[PROM] query failed:', query, e);
        return 0;
      }
    };

    // === SINGLE RUN (no iterations) ===
    let pdf_processing_duration_ms = 0;
    let client_decompress_ms: number | null = null;
    let network_transfer_ms: number | null = null;
    let transfer_size_bytes = 0;
    let decoded_size_bytes = 0;
    let client_was_compressed = false;
    let client_compression_ratio = 1.0;

    let client_cpu_s = 0;
    let client_net_rx_bytes = 0;
    let client_cpu_energy_mJ = 0;
    let client_network_energy_mJ = 0;

    let edge_cpu_s = 0;
    let edge_net_tx_bytes = 0;
    let edge_network_energy_mJ = 0;

    let parsed: any = null;

    try {
      await startUsecase2Client();

      // === BEFORE: Snapshot Prometheus counters ===
      const cpu_before = await promQuery('docker_cpu_usage_total{containerName="selenium-client"}');
      const rx_before = await promQuery('docker_network_received_bytes{containerName="selenium-client"}');

      let edge_cpu_before = 0;
      let edge_tx_before = 0;
      if (strategy === 2) {
        edge_cpu_before = await promQuery('docker_cpu_usage_total{containerName="facultyA-edge"}');
        edge_tx_before = await promQuery('docker_network_transmit_bytes{containerName="facultyA-edge"}');
      }

      console.log('[PROM] BEFORE — client CPU:', cpu_before, 'RX:', rx_before);
      if (strategy === 2) console.log('[PROM] BEFORE — edge CPU:', edge_cpu_before, 'TX:', edge_tx_before);

      // === Run Selenium ===
      const seleniumCmd = `docker exec selenium-client python3 /scripts/run_selenium.py ` +
        `--url-base http://elvira.lib/books --file ${file} --strategy ${strategy}`;

      const { stdout } = await exec(seleniumCmd, { timeout: 120_000 });
      parsed = JSON.parse(stdout.trim());

      // === AFTER: Snapshot again ===
      const cpu_after = await promQuery('docker_cpu_usage_total{containerName="selenium-client"}');
      const rx_after = await promQuery('docker_network_received_bytes{containerName="selenium-client"}');

      let edge_cpu_after = 0;
      let edge_tx_after = 0;
      if (strategy === 2) {
        edge_cpu_after = await promQuery('docker_cpu_usage_total{containerName="facultyA-edge"}');
        edge_tx_after = await promQuery('docker_network_transmit_bytes{containerName="facultyA-edge"}');
      }

      console.log('[PROM] AFTER — client CPU:', cpu_after, 'RX:', rx_after);
      if (strategy === 2) console.log('[PROM] AFTER — edge CPU:', edge_cpu_after, 'TX:', edge_tx_after);

      // === Calculate deltas ===
      client_cpu_s = Math.max(0, cpu_after - cpu_before);
      client_net_rx_bytes = Math.max(0, rx_after - rx_before);

      if (strategy === 2) {
        edge_cpu_s = Math.max(0, edge_cpu_after - edge_cpu_before);
        edge_net_tx_bytes = Math.max(0, edge_tx_after - edge_tx_before);
        edge_network_energy_mJ = edge_net_tx_bytes * STATIC_TRANSFER_MJ_PER_BYTE;
      }

      client_cpu_energy_mJ = client_cpu_s * CPU_WATTS * 1000;
      client_network_energy_mJ = client_net_rx_bytes * STATIC_TRANSFER_MJ_PER_BYTE;

    } catch (e) {
      console.warn('[uc2] selenium failed:', e);
      parsed = null;
    } finally {
      // Do NOT stop the container — keep it running for accurate metrics
      stopUsecase2Client();
    }

    // === Extract metrics from Selenium ===
    if (parsed?.success && parsed.metrics) {
      const m = parsed.metrics;
      console.log('[SELENIUM] metrics:', m);

      pdf_processing_duration_ms = m.pdf_processing_duration_ms ?? 0;
      client_decompress_ms = m.client_decompress_ms ?? null;
      network_transfer_ms = m.network_transfer_ms ?? null;

      transfer_size_bytes = Number(m.transfer_size_bytes ?? 0);
      decoded_size_bytes = Number(m.decoded_body_size_bytes ?? 0);

      client_was_compressed = Boolean(m.was_compressed);
      client_compression_ratio = Number(m.compression_ratio ?? 1.0);
    }

    // === Final energies ===
    const client_decompress_energy_mJ = strategy === 3 ? client_cpu_energy_mJ : 0;
    const edge_decompress_energy_mJ = strategy === 2 ? edge_cpu_s * CPU_WATTS * 1000 : 0;

    const total_energy_mJ =
      transfer_energy_mJ +
      central_compress_energy_mJ +
      edge_decompress_energy_mJ +
      client_decompress_energy_mJ;

    // === Result object ===
    const result = {
      timestamp: new Date().toISOString(),
      experiment_id: `uc2-${Date.now()}`,
      scenario: `uc2-s${strategy}`,
      strategy,
      compression: algo,
      compression_level: level,
      file,
      metrics: {
        transfer_size_bytes,
        decoded_body_size_bytes: decoded_size_bytes,
        transfer_energy_mJ: Number(transfer_energy_mJ.toFixed(6)),
        central_compress_energy_mJ: Number(central_compress_energy_mJ.toFixed(6)),
        edge_decompress_energy_mJ: Number(edge_decompress_energy_mJ.toFixed(6)),
        client_decompress_energy_mJ: Number(client_decompress_energy_mJ.toFixed(6)),
        total_energy_mJ: Number(total_energy_mJ.toFixed(6)),

        client_cpu_s: Number(client_cpu_s.toFixed(6)),
        client_net_rx_bytes: Math.round(client_net_rx_bytes),
        client_cpu_energy_mJ: Number(client_cpu_energy_mJ.toFixed(6)),
        client_network_energy_mJ: Number(client_network_energy_mJ.toFixed(6)),

        edge_cpu_s: Number(edge_cpu_s.toFixed(6)),
        edge_net_tx_bytes: Math.round(edge_net_tx_bytes),
        edge_network_energy_mJ: Number(edge_network_energy_mJ.toFixed(6)),

        pdf_processing_duration_ms,
        client_was_compressed,
        client_compression_ratio: Number(client_compression_ratio.toFixed(3)),
        client_decompress_ms,
        network_transfer_ms
      }
    };

    // Log to file
    await fs.appendFile(
      '/var/log/central/uc2_runs.jsonl',
      JSON.stringify(result) + '\n'
    );

    // === Response ===
    res.json({
      summary: {
        strategy,
        algo,
        level,
        file,
        total_energy_mJ: result.metrics.total_energy_mJ,
        transfer_energy_mJ: result.metrics.transfer_energy_mJ,
        central_compress_energy_mJ: result.metrics.central_compress_energy_mJ,
        edge_decompress_energy_mJ: result.metrics.edge_decompress_energy_mJ,
        client_decompress_energy_mJ: result.metrics.client_decompress_energy_mJ,
        compression_ratio: result.metrics.client_compression_ratio,
        pdf_processing_duration_ms: result.metrics.pdf_processing_duration_ms
      },
      result // single run result (instead of array)
    });

  } catch (err: any) {
    console.error('/usecase2/start error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});


// Decision loop (можно потом заменить на ML)
async function performPrefetch(_opts?: any) {
  console.log('Prefetch triggered manually');
}

app.post('/switch-to-central', async (_req, res) => {
  try {
    const msg = await setDnsMode('central');
    res.json({ result: 'ok', msg });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/switch-to-edge', async (_req, res) => {
  try {
    const msg = await setDnsMode('edge');
    res.json({ result: 'ok', msg });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/dns-status', async (_req, res) => {
  try {
    const currentMode = await getCurrentDnsMode();
    res.json({
      currentMode,
      description: currentMode === 'central'
        ? 'All clients resolve elvira.lib to central server (baseline)'
        : 'Clients resolve elvira.lib to local faculty edge (proposed architecture)'
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to get DNS status' });
  }
});

const server = app.listen(CONTROL_PORT, () => {
  console.log(`Central Manager API запущен на :${CONTROL_PORT}`);
  console.log(`   → http://localhost:${CONTROL_PORT}/central-metrics — все метрики в одном JSON`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));