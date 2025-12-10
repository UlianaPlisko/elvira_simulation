// applications/central-manager/src/main.ts 
import './monitoring/metrics';
import { startUsecase2Client, stopUsecase2Client } from './control/simulatorControl';
import { precompressFile, PrecompressResult } from './compression/precompress'
import {
  centralPrecompressWall,
  centralPrecompressCpu,
  centralPrecompressOriginalBytes,
  centralPrecompressCompressedBytes
} from './monitoring/metrics';
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

app.post('/usecase2/start', async (req, res) => {
  try {
    const strategy = Number(req.body.strategy ?? process.env.STRATEGY ?? 1);
    const algo = String(req.body.compression ?? process.env.COMPRESS_ALGO ?? 'gzip');
    const level = Number(req.body.level ?? process.env.COMPRESS_LEVEL ?? 6);
    const file = String(req.body.file ?? 'book1.pdf'); // default to book1.pdf
    console.log(`UC2 start: strategy=${strategy}, algo=${algo}, level=${level}, file=${file}`);
    const experiment_id = `uc2-${Date.now()}`;
    // 1) Precompress on central if needed
    let precomp: PrecompressResult | null = null;
    if (strategy !== 1) {
      console.log('[UC2] Precompressing on central...', file, algo, level);
      precomp = await precompressFile(file, algo, level);
      try {
        centralPrecompressWall.set(precomp.central_compress_wall_s);
        centralPrecompressCpu.set(precomp.central_compress_cpu_s);
        centralPrecompressOriginalBytes.set(precomp.originalBytes);
        centralPrecompressCompressedBytes.set(precomp.compressedBytes);
      } catch (e) {
        console.warn('[UC2] cannot set precompress gauges:', e);
      }
    }
    // 2) Update central nginx config so central serves correct files (template -> active)
    const tplPath = '/etc/nginx/central.conf.template';
    let tpl = await fs.readFile(tplPath, 'utf8');
    const booksAlias = strategy === 1 ? '/var/www/elvira/books' : '/var/www/books/compressed';
    const contentEncoding = strategy === 1 ? '' : algo;
    tpl = tpl.replace(/\${BOOKS_ALIAS}/g, booksAlias).replace(/\${CONTENT_ENCODING}/g, contentEncoding);
    tpl = tpl.replace(/\${STRATEGY}/g, String(strategy)).replace(/\${COMPRESS_ALGO}/g, String(algo));
    // await fs.writeFile('/etc/nginx/nginx.conf', tpl, 'utf8');
    // // reload nginx (if fails, try start)
    try {
      // сначала тест конфига — покажет ошибки
      await exec('/usr/sbin/nginx -t');
      // если тест успешен, посылаем reload
      await exec('/usr/sbin/nginx -s reload');
      console.log('[UC2] nginx reload ok');
    } catch (reloadErr) {
      console.warn('[UC2] nginx config test/reload failed — не пытаюсь стартовать новый nginx. Проверьте /etc/nginx/nginx.conf и логи контейнера.', reloadErr);
      // дополнительно попытаемся получить вывод проверки для диагностики
      try {
        const { stdout, stderr } = await exec('/usr/sbin/nginx -t || true');
        console.log('[UC2] nginx -t output:', stdout, stderr);
      } catch (_) { /* игнорируем */ }
    }
    // 3) Force edge to fetch file from central to populate cache (cache-warm)
    const edgeContainer = 'facultyA-edge'; // adapt if you later choose other faculty
    const curlCmd = `docker exec ${edgeContainer} sh -c "curl -s -o /dev/null -w '%{http_code} %{time_total}' http://localhost/books/${file}"`;
    try {
      const { stdout: curlOut } = await exec(curlCmd);
      console.log('[UC2] cache-warm curl result:', (curlOut || '').trim());
    } catch (e) {
      console.warn('[UC2] cache-warm curl failed:', e);
    }
    // short pause for cache write
    await new Promise(r => setTimeout(r, 800));
    // 4) Run selenium for all strategies to get consistent client-side metrics (decompression only applies to strategy 3)
    let client_decompress_wall_ms = 0;
    let client_cpu_s = 0;
    try {
      await startUsecase2Client();
    } catch (e) {
      console.warn('[UC2] startUsecase2Client failed:', e);
    }
    try {
      const seleniumCmd = `docker exec selenium-client python3 /scripts/run_selenium.py --url-base http://elvira.lib/books --file ${file} --strategy ${strategy} --report http://172.20.0.2:3100/usecase2/report`;      const { stdout: sOut } = await exec(seleniumCmd, { timeout: 120_000 });
      const stdoutTrim = (sOut || '').trim();
      let parsed: any = {};
      if (stdoutTrim) {
        try {
          parsed = JSON.parse(stdoutTrim);
        } catch (parseErr) {
          console.warn('[UC2] failed to parse selenium stdout as JSON:', parseErr);
          parsed = {};
        }
      }
      // Only take decompression metrics for strategy 3; for others, set to 0 (but still run selenium for potential other metrics or baseline)
      if (strategy === 3) {
        client_decompress_wall_ms = Number(parsed?.metrics?.client_duration_ms ?? 0);
        client_cpu_s = Number(parsed?.metrics?.client_cpu_s ?? 0);
      }
    } catch (e) {
      console.warn('[UC2] selenium run failed:', e);
    }
    // Stop the client after run to save resources when simulation ends
    // try {
    //   await stopUsecase2Client();
    // } catch (e) {
    //   console.warn('[UC2] stopUsecase2Client failed:', e);
    // }
    // Measure edge decompression only for strategy 2
    let edge_decompress_cpu_s = 0;
    let edge_decompress_wall_s = 0;
    const promQ = async (q: string) => {
      try {
        const r = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, { params: { query: q }, timeout: 5000 });
        return parseFloat(r.data?.data?.result?.[0]?.value?.[1] ?? '0');
      } catch (e) {
        return 0;
      }
    };
    if (strategy === 2) {
      // measured wall time from curl output
      try {
        const curlCmd2 = `docker exec ${edgeContainer} sh -c "curl -s -o /dev/null -w '%{http_code} %{time_total}' http://localhost/books/${file}"`;
        const { stdout: curlOut2 } = await exec(curlCmd2);
        const outTrim = (curlOut2 || '').trim();
        const parts = outTrim.split(/\s+/); // ['200', '0.123']
        // safe parse: parts[1] может быть undefined -> используем '0' fallback
        edge_decompress_wall_s = Number(parts[1] ?? '0') || 0.5;
      } catch (e) {
        edge_decompress_wall_s = 0.5; // fallback
      }
      // Prometheus increase(...) for CPU seconds in a short window (adjust metric name if necessary)
      try {
        const qInc = `increase(docker_cpu_usage_total{containerName="facultyA-edge"}[30s])`;
        const incVal = await promQ(qInc);
        edge_decompress_cpu_s = Math.max(0, incVal);
      } catch (e) {
        console.warn('[UC2] prom query for edge cpu increase failed:', e);
      }
    }
    // 5) Compute transfer energy (static approx, fixed to match strategy transfers)
    const originalSize = precomp ? precomp.originalBytes : (await fs.stat(`/var/www/books/${file}`)).size;
    const compressedSize = precomp ? precomp.compressedBytes : 0;
    const STATIC_TRANSFER_MJ_PER_BYTE = Number(process.env.STATIC_TRANSFER_MJ_PER_BYTE) || 0.00005;
    const central_to_edge_bytes = strategy === 1 ? originalSize : compressedSize;
    const edge_to_client_bytes = strategy === 1 ? originalSize : (strategy === 2 ? originalSize : compressedSize);
    const transfer_energy_mJ = (central_to_edge_bytes + edge_to_client_bytes) * STATIC_TRANSFER_MJ_PER_BYTE;
    // 6) Central compression energy (approx from cpu seconds)
    const CPU_WATTS = Number(process.env.CPU_WATTS) || 15;
    const central_compress_energy_mJ = precomp ? precomp.central_compress_cpu_s * CPU_WATTS * 1000 : 0;
    // Assemble result
    const result = {
      timestamp: new Date().toISOString(),
      experiment_id,
      scenario: `UC2-S${strategy}`,
      strategy,
      compression: algo,
      compression_level: level,
      file,
      metrics: {
        original_bytes: originalSize,
        compressed_bytes: compressedSize,
        central_compress_cpu_s: precomp ? precomp.central_compress_cpu_s : 0,
        central_compress_wall_s: precomp ? precomp.central_compress_wall_s : 0,
        edge_decompress_cpu_s: Number(edge_decompress_cpu_s),
        edge_decompress_wall_s: Number(edge_decompress_wall_s),
        client_decompress_wall_ms: Number(client_decompress_wall_ms),
        client_cpu_s: Number(client_cpu_s),
        transfer_energy_mJ: Number(transfer_energy_mJ.toFixed(6)),
        central_compress_energy_mJ: Number(central_compress_energy_mJ.toFixed(6))
      }
    };
    // persist run
    await fs.appendFile('/var/log/central/uc2_runs.jsonl', JSON.stringify(result) + '\n');
    return res.json(result);
  } catch (err: any) {
    console.error('/usecase2/start error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});


// Decision loop (можно потом заменить на ML)
async function performPrefetch(_opts?: any) {
  console.log('Prefetch triggered manually');
}

const server = app.listen(CONTROL_PORT, () => {
  console.log(`Central Manager API запущен на :${CONTROL_PORT}`);
  console.log(`   → http://localhost:${CONTROL_PORT}/central-metrics — все метрики в одном JSON`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));