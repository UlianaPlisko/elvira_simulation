// applications/central-manager/src/control/nginxConfigControl.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type Strategy = 1 | 2 | 3;
export type Algo = 'gzip' | 'brotli';


export async function applyCentralNginxConfig(strategy: Strategy, algo: Algo): Promise<void> {
  console.log('[NGINX-CENTRAL] Applying config for strategy', strategy);

  let booksAlias: string;
  let contentEncoding: string = '';

  if (strategy === 1) {
    booksAlias = '/var/www/books/';
    contentEncoding = '';
  } else {
    booksAlias = '/var/compressed-books/';
    contentEncoding = algo === 'gzip' ? 'gzip'
                 :  'br';
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


export async function applyEdgeNginxConfig(strategy: Strategy, algo: Algo): Promise<void> {
  const edgeContainers = [
    'facultyA-edge',
    'facultyB-edge',
    'facultyC-edge',
    'facultyD-edge',
    'facultyE-edge',
  ];

  // Determine which decompression to enable
  let gunzipSetting = 'off';
  let brotliSetting = 'off';

  if (strategy === 2) {
    if (algo === 'gzip') {
      gunzipSetting = 'on';
    } else if (algo === 'brotli') {
      brotliSetting = 'on';
    }
    // zstd: leave both off (passthrough)
  }

  for (const container of edgeContainers) {
    console.log(`[NGINX-EDGE] Updating ${container} → strategy=${strategy} algo=${algo} gunzip=${gunzipSetting} brotli=${brotliSetting}`);

    const cmd = `docker exec ${container} sh -c '
      export STRATEGY="${strategy}" &&
      export COMPRESS_ALGO="${algo}" &&
      export GUNZIP_SETTING="${gunzipSetting}" && 
      export BROTL_SETTING="${brotliSetting}" && 
      envsubst "\\\${GUNZIP_SETTING} \\\${BROTL_SETTING}" < /etc/nginx/edge.conf.template > /etc/nginx/nginx.conf.tmp && 
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
    }
  }
}

export async function clearEdgeCaches(): Promise<void> {
  const edgeContainers = [
    'facultyA-edge',
    'facultyB-edge',
    'facultyC-edge',
    'facultyD-edge',
    'facultyE-edge',
  ];

  for (const container of edgeContainers) {
    console.log(`[CACHE-CLEAR] Clearing cache for ${container}`);
    const cmd = `docker exec ${container} sh -c 'rm -rf /var/cache/nginx/elvira_cache/* && mkdir -p /var/cache/nginx/elvira_cache'`;

    try {
      await execAsync(cmd);
      console.log(`[CACHE-CLEAR] ${container} cache cleared`);
    } catch (e: any) {
      console.warn(`[CACHE-CLEAR] Failed for ${container}:`, e.stdout || e.stderr || e);
      // Continue even if one fails
    }
  }
}