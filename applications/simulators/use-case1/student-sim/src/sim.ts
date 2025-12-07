import axios from 'axios';
import dns from 'dns/promises';
import os from 'os';

function buildZipfSampler(n: number, alpha = 0.9) {
  const weights = new Array(n);
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    const w = 1 / Math.pow(i, alpha);
    weights[i - 1] = w;
    sum += w;
  }
  for (let i = 0; i < n; i++) weights[i] /= sum;
  const cdf = new Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += weights[i];
    cdf[i] = acc;
  }
  return function sample() {
    const r = Math.random();
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r <= cdf[mid]) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
}

// ==================== ENV ====================
const SIM_CONC       = parseInt(process.env.SIM_CONC || '25', 10);
const SIM_DURATION   = parseInt(process.env.SIM_DURATION || '600', 10);
const SIM_THINK      = parseInt(process.env.SIM_THINK || '1000', 10);
const SIM_URL_BASE   = process.env.SIM_URL_BASE || 'http://elvira.lib/books';
const SIM_ZIPF_ALPHA = parseFloat(process.env.SIM_ZIPF_ALPHA || '0.9');
const SIM_MODE       = process.env.SIM_MODE || 'normal';

const IS_EXAM = SIM_MODE === 'exam';

const books = ['book1.pdf', 'book2.pdf', 'book3.pdf', 'book4.pdf'];
const sampler = buildZipfSampler(books.length, SIM_ZIPF_ALPHA);
const bookUrl = (b: string) => `${SIM_URL_BASE.replace(/\/$/, '')}/${b}`;

let stop = false;

function detectLocalIPv4(): string | null {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    const addrs = ifaces[name] || [];
    for (const a of addrs) {
      if ((a as any).family === 'IPv4' && !(a as any).internal) {
        return (a as any).address;
      }
    }
  }
  return null;
}
const LOCAL_IP = detectLocalIPv4() || 'unknown';

let totalReqs = 0;
let failedReqs = 0;
let lastLatencyMs = 0;

async function studentLoop(id: number) {
  const end = Date.now() + SIM_DURATION * 1000;
  let cycle = 0;

  while (!stop && Date.now() < end) {
    cycle++;

    if (cycle % 20 === 1) {
      try {
        const r = await dns.lookup('elvira.lib');
        console.log(`[student ${id} | ${LOCAL_IP}] DNS → ${r.address}`);
      } catch (e) {
        console.warn(`[student ${id}] DNS failed: ${(e as Error).message}`);
      }
    }

    try {
      const t0 = Date.now();
      await axios.get(SIM_URL_BASE, { timeout: 10000, headers: { 'X-Sim-Client-IP': LOCAL_IP } });
      lastLatencyMs = Date.now() - t0;
      totalReqs++;
    } catch (e) {
      failedReqs++;
    }

    const num_books = IS_EXAM
      ? 1 + Math.floor(Math.random() * 9)   
      : 1 + Math.floor(Math.random() * 3);  

    for (let r = 0; r < num_books; r++) {
      const book = books[sampler()];
      const url = bookUrl(book);
      try {
        const t0 = Date.now();
        await axios.get(url, {
          timeout: 30000,
          responseType: 'arraybuffer',
          headers: { 'X-Sim-Client-IP': LOCAL_IP }
        });
        lastLatencyMs = Date.now() - t0;
        totalReqs++;
      } catch (err) {
        failedReqs++;
      }
    }

    const variation = IS_EXAM ? 0.9 : 0.2;
    const jitter = (Math.random() - 0.5) * 2 * variation;
    let sleep = SIM_THINK * (1 + jitter);
    if (sleep < 50) sleep = 50;

    await new Promise(r => setTimeout(r, sleep));
  }
}

async function run() {
  console.log('=== Student simulator START ===', {
    SIM_CONC, SIM_DURATION, SIM_THINK, SIM_URL_BASE, SIM_ZIPF_ALPHA, SIM_MODE, LOCAL_IP
  });

  const promises: Promise<void>[] = [];
  for (let i = 0; i < SIM_CONC; i++) {
    promises.push(studentLoop(i + 1));
  }
  await Promise.all(promises);

  console.log('=== All students finished ===');
  console.log(`total requests: ${totalReqs}, failed: ${failedReqs}, last latency ms: ${lastLatencyMs}`);
  process.exit(0);
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
