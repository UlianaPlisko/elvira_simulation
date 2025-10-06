import { updateMetrics } from './monitoring/local-metrics';

console.log('Faculty A Edge Manager started');

setInterval(updateMetrics, 300 * 1000); 

process.on('SIGUSR1', () => {
  console.log('Reloading Nginx config for cache update');
});