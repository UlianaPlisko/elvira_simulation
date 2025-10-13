import axios from 'axios';
import express from 'express';
import { Counter, Gauge, Registry } from 'prom-client';

// Simple Zipf sampler (alpha > 0)
function buildZipfSampler(n: number, alpha = 0.9) {
  const weights = new Array(n);
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    const w = 1 / Math.pow(i, alpha);
    weights[i - 1] = w;
    sum += w;
  }
  for (let i = 0; i < n; i++) weights[i] /= sum;
  // CDF
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
    return lo; // index 0..n-1
  };
}

const PORT_METRICS = 9400;
const app = express();

const register = new Registry();
const reqsTotal = new Counter({ name: 'student_sim_requests_total', help: 'requests made', registers: [register] });
const reqsFailed = new Counter({ name: 'student_sim_requests_failed_total', help: 'failed', registers: [register] });
const latencyGauge = new Gauge({ name: 'student_sim_request_latency_ms', help: 'latency ms', registers: [register] });

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const SIM_CONC = parseInt(process.env.SIM_CONC || '10', 10);
const SIM_DURATION = parseInt(process.env.SIM_DURATION || '60', 10);
const SIM_THINK = parseInt(process.env.SIM_THINK || '1000', 10);
const SIM_URL = process.env.SIM_URL || 'http://elvira.lib/books/';
const SIM_ZIPF_ALPHA = parseFloat(process.env.SIM_ZIPF_ALPHA || '0.9');
const EXAM_AT = parseInt(process.env.SIM_EXAM_SPIKE_AT || '0', 10);
const EXAM_FACTOR = parseFloat(process.env.SIM_EXAM_SPIKE_FACTOR || '1');

const SIM_URL_BASE = process.env.SIM_URL || 'http://elvira.lib';
const BOOKS_PATH = '/books';
const bookUrl = (b: string) => `${SIM_URL_BASE.replace(/\/$/, '')}${BOOKS_PATH}/${b}`;

const books = ['book1.pdf','book2.pdf','book3.pdf','book4.pdf'];
const sampler = buildZipfSampler(books.length, SIM_ZIPF_ALPHA);

let stop = false;

async function studentLoop(id: number) {
  const end = Date.now() + SIM_DURATION * 1000;
  while (!stop && Date.now() < end) {
    // determine if we're in exam spike window
    const elapsed = SIM_DURATION - Math.max(0, Math.round((end - Date.now()) / 1000));
    const factor = (EXAM_AT > 0 && elapsed >= EXAM_AT) ? EXAM_FACTOR : 1;

    // homepage (quick hit) - not always necessary
    try {
      const t0 = Date.now();
      await axios.get(SIM_URL, { timeout: 5000 });
      const dt = Date.now() - t0;
      reqsTotal.inc(1);
      latencyGauge.set(dt);
    } catch (e) {
      reqsFailed.inc(1);
    }

    // choose k requests per loop depending on factor
    const requests = Math.max(1, Math.round(factor));
    for (let r = 0; r < requests; r++) {
      const i = sampler();
      const book = books[i];
      const url = bookUrl(book);
      try {
        const t0 = Date.now();
        const res = await axios.get(url, { timeout: 8000, responseType: 'arraybuffer' });
        const dt = Date.now() - t0;
        reqsTotal.inc(1);
        latencyGauge.set(dt);
        // optionally check response size: res.data.byteLength
      } catch (err) {
        reqsFailed.inc(1);
      }
    }

    // think time between loops (randomized a little)
    await new Promise(r => setTimeout(r, SIM_THINK + Math.round((Math.random() - 0.5) * SIM_THINK * 0.2)));
  }
}

async function run() {
  console.log('Student-sim starting with', { SIM_CONC, SIM_DURATION, SIM_THINK, SIM_URL, SIM_ZIPF_ALPHA, EXAM_AT, EXAM_FACTOR });
  app.listen(PORT_METRICS, () => console.log(`Metrics on http://0.0.0.0:${PORT_METRICS}/metrics`));
  const proms: Promise<void>[] = [];
  for (let i = 0; i < SIM_CONC; i++) {
    proms.push(studentLoop(i + 1));
  }
  await Promise.all(proms);
  console.log('Simulation complete');
  process.exit(0);
}

run().catch(err => {
  console.error('Sim error', err);
  process.exit(1);
});