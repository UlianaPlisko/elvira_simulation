// applications/edge-managers/facultyA/src/monitoring/local-metrics.ts
import promClient from 'prom-client';
import axios from 'axios';
import express from 'express';

const CONFIG = {
  energy: { Pidle: 63, Ppeak: 92, alpha: 37000 },
  load: { threshold: 0.75, deltaSeconds: 300 },
  simulation: { peakCapacity: 200 }
};

const register = new promClient.Registry();
const loadGauge = new promClient.Gauge({ name: 'edge_load_facultyA', help: 'Current load lambda for facultyA' });
const energyCounter = new promClient.Counter({ name: 'edge_energy_kwh_facultyA', help: 'Total energy for facultyA' });

// регистрация метрик
register.registerMetric(loadGauge);
register.registerMetric(energyCounter);

// функция обновления метрик (вызывается извне)
export async function updateMetrics() {
  try {
    const { data } = await axios.get('http://localhost/stub_status', { timeout: 2000 });
    const active = parseInt(data.match(/Active connections: (\d+)/)?.[1] || '0', 10);
    const lambda = active / CONFIG.simulation.peakCapacity;
    loadGauge.set(lambda);

    const power = CONFIG.energy.Pidle + (CONFIG.energy.Ppeak - CONFIG.energy.Pidle) * lambda;
    const energyDelta = power * CONFIG.load.deltaSeconds / 3600000;  // kWh per slot
    energyCounter.inc(energyDelta);

    console.log(`FacultyA metrics: active=${active}, lambda=${lambda.toFixed(2)}, power=${power.toFixed(2)}W, energyΔ=${energyDelta.toFixed(6)}kWh`);
  } catch (e) {
    console.error('Metrics error in facultyA:', e && (e as Error).message ? (e as Error).message : e);
  }
}

// expose /metrics (edge custom metrics) — порт 3000
const app = express();
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
const PORT = 3000;
app.listen(PORT, () => console.log(`Edge custom metrics server running on port ${PORT}`));
