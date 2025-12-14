// applications/central-manager/src/control/nginxConfigControl.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type Strategy = 1 | 2 | 3;
export type Algo = 'gzip' | 'brotli';


export async function applyCentralNginxConfig(strategy: Strategy, algo: Algo = 'gzip'): Promise<void> {
  console.log('[NGINX-CENTRAL] Applying config for strategy', strategy);

  let booksAlias: string;
  let contentEncoding: string = '';

  if (strategy === 1) {
    booksAlias = '/var/www/books/';
    contentEncoding = '';
  } else {
    booksAlias = '/var/compressed-books/';
    contentEncoding = strategy === 3 ? algo : ''; 
  }

  const templatePath = '/etc/nginx/central.conf.template';
  const outputPath = '/etc/nginx/nginx.conf';

  const cmd = `sh -c '\
    export BOOKS_ALIAS="${booksAlias}" && \
    export CONTENT_ENCODING="${contentEncoding}" && \
    envsubst "\\\${BOOKS_ALIAS} \\\${CONTENT_ENCODING}" \
      < "${templatePath}" > "${outputPath}.tmp" && \
    mv "${outputPath}.tmp" "${outputPath}" \
  '`;

  try {
    await execAsync(cmd);
    console.log(`[NGINX-CENTRAL] Config regenerated: alias=${booksAlias}, Content-Encoding=${contentEncoding || 'none'}`);
  } catch (e: any) {
    console.error('[NGINX-CENTRAL] Failed to regenerate config:', e.stdout || e.stderr || e);
    throw new Error('Failed to regenerate central nginx config');
  }

  // nginx -t + reload
  try {
    const { stdout } = await execAsync('/usr/sbin/nginx -t');
    console.log('[NGINX-CENTRAL] nginx -t OK:', stdout.trim());

    await execAsync('/usr/sbin/nginx -s reload');
    console.log('[NGINX-CENTRAL] nginx reloaded successfully');
  } catch (e: any) {
    console.error('[NGINX-CENTRAL] nginx test/reload failed:', e.stdout || e.stderr || e);
    throw new Error('nginx config invalid or reload failed');
  }
}


export async function applyEdgeNginxConfig(enableGunzip: boolean): Promise<void> {
  const edgeContainers = [
    'facultyA-edge',
    'facultyB-edge',
    'facultyC-edge',
    'facultyD-edge',
    'facultyE-edge',
  ];

  const gunzipSetting = enableGunzip ? 'on' : 'off';

  for (const container of edgeContainers) {
    console.log(`[NGINX-EDGE] Updating ${container} → gunzip ${gunzipSetting}`);

    const cmd = `docker exec ${container} sh -c '
      export GUNZIP_SETTING="${gunzipSetting}" && 
      envsubst "\\\${GUNZIP_SETTING}" < /etc/nginx/edge.conf.template > /etc/nginx/nginx.conf.tmp && 
      mv /etc/nginx/nginx.conf.tmp /etc/nginx/nginx.conf && 
      nginx -t && 
      nginx -s reload
    '`;

    try {
      const { stdout, stderr } = await execAsync(cmd);
      if (stdout) console.log(`[NGINX-EDGE] ${container} stdout:`, stdout.trim());
      if (stderr) console.warn(`[NGINX-EDGE] ${container} stderr:`, stderr.trim());
      console.log(`[NGINX-EDGE] ${container} updated and reloaded`);
    } catch (e: any) {
      console.warn(`[NGINX-EDGE] Failed to update ${container}:`, e.stdout || e.stderr || e);
      // Не бросаем ошибку — если один edge упал, остальные могут работать
    }
  }
}