import promClient from 'prom-client';
import axios from 'axios';

const CONFIG = {
  energy: { Pidle: 63, Ppeak: 92, alpha: 37000 },
  load: { threshold: 0.75, deltaSeconds: 300 },
  simulation: { peakCapacity: 200 }
};

const register = new promClient.Registry();
const loadGauge = new promClient.Gauge({ name: 'edge_load_facultyA', help: 'Current load lambda for facultyA' });
const energyCounter = new promClient.Counter({ name: 'edge_energy_kwh_facultyA', help: 'Total energy for facultyA' });


export async function updateMetrics() {
  try {
    const { data } = await axios.get('http://localhost/stub_status');
    const active = parseInt(data.match(/Active connections: (\d+)/)?.[1] || '0');
    const lambda = active / CONFIG.simulation.peakCapacity;
    loadGauge.set(lambda);

    const power = CONFIG.energy.Pidle + (CONFIG.energy.Ppeak - CONFIG.energy.Pidle) * lambda;
    const energyDelta = power * CONFIG.load.deltaSeconds / 3600000;  // kWh per slot
    energyCounter.inc(energyDelta);

    console.log(`FacultyA: Lambda=${lambda.toFixed(2)}, Power=${power}W, Energy delta=${energyDelta.toFixed(4)}kWh`);

    if (lambda > CONFIG.load.threshold) {
      console.log('High load - potential transition');
    }
  } catch (e) {
    console.error('Metrics error in facultyA:', e);
  }
}


register.registerMetric(loadGauge);
register.registerMetric(energyCounter);