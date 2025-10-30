import CONFIG from '../config';
import promClient from 'prom-client';
import axios from 'axios';
import express from 'express';
import os from 'os';

// Инициализация реестра Prometheus для custom метрик
const register = new promClient.Registry();
const loadGauge = new promClient.Gauge({
  name: 'central_load_lambda',
  help: 'Combined load (Nginx + CPU) for central server'
});
const energyCounter = new promClient.Counter({
  name: 'central_energy_kwh',
  help: 'Total energy consumption for central server (kWh)'
});
const cpuLoadGauge = new promClient.Gauge({
  name: 'central_cpu_load',
  help: 'CPU load for central server'
});
const transitionCounter = new promClient.Counter({  // NEW: For alpha transitions
  name: 'central_transitions_total',
  help: 'Total server state transitions for central'
});

// Регистрация метрик в реестре
register.registerMetric(loadGauge);
register.registerMetric(energyCounter);
register.registerMetric(cpuLoadGauge);
register.registerMetric(transitionCounter);

let previousLambda = 0;

// Функция для получения CPU load с фиксом TS (используем keyof для безопасного индексирования)
function getCpuLoad(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  cpus.forEach((cpu) => {
    // Явно указываем тип ключей как keyof typeof cpu.times для TS
    const timesKeys = Object.keys(cpu.times) as (keyof typeof cpu.times)[];
    timesKeys.forEach((type) => {
      total += cpu.times[type];
      if (type === 'idle') {
        idle += cpu.times[type];
      }
    });
  });

  // Избегаем деления на 0
  if (total === 0) return 0;
  return 1 - idle / total; // Нормализованная нагрузка CPU (0-1)
}

export async function updateMetrics() {
  try {
    // Шаг 1-3: unchanged (get nginxLambda, cpuLoad, combinedLambda)
    const { data } = await axios.get('http://localhost/stub_status');
    const activeMatch = data.match(/Active connections: (\d+)/);
    const active = activeMatch ? parseInt(activeMatch[1], 10) : 0;
    const nginxLambda = active / CONFIG.simulation.peakCapacity;
    const cpuLoad = getCpuLoad();
    const combinedLambda = (nginxLambda + cpuLoad) / 2;
    loadGauge.set(combinedLambda);
    cpuLoadGauge.set(cpuLoad);

    // Шаг 4: Расчет мощности и энергии (matches article P(t) and ΔE)
    const power = CONFIG.energy.Pidle + (CONFIG.energy.Ppeak - CONFIG.energy.Pidle) * combinedLambda;
    const energyDelta = power * CONFIG.load.deltaSeconds / 3600000;
    energyCounter.inc(energyDelta);

    console.log(`Central: Nginx Lambda=${nginxLambda.toFixed(2)}, CPU Load=${cpuLoad.toFixed(2)}, Combined Lambda=${combinedLambda.toFixed(2)}, Power=${power.toFixed(2)}W, Energy Delta=${energyDelta.toFixed(6)}kWh`);

    // Шаг 5: Detect transitions and add alpha (matches article)
    if (combinedLambda > CONFIG.load.threshold && previousLambda <= CONFIG.load.threshold) {
      const alphaKwh = CONFIG.energy.alpha / 3600000;  // J to kWh (~0.0103)
      energyCounter.inc(alphaKwh);  // Add to E_total
      transitionCounter.inc(1);
      console.log(`Transition detected (lambda ${previousLambda.toFixed(2)} -> ${combinedLambda.toFixed(2)} > ${CONFIG.load.threshold}) - added alpha ${alphaKwh.toFixed(4)} kWh`);
    }
    previousLambda = combinedLambda;  // Update for next interval
  } catch (e) {
    console.error('Metrics update error in central:', e);
  }
}

// Запуск обновления метрик каждые deltaSeconds (300s = 5 мин)
setInterval(updateMetrics, CONFIG.load.deltaSeconds * 1000);

// HTTP-сервер для экспорта custom метрик в Prometheus (порт 3000)
const app = express();
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
app.listen(3000, () => console.log('Central custom metrics server running on port 3000'));