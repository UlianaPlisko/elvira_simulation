// applications/central-manager/src/control/dnsControl.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const PROJECT_DIR = '/project';
const COMPOSE_FILE = path.join(PROJECT_DIR, 'docker-compose.yml');
const PROJECT_NAME = 'elvira_simulation';

export type DnsMode = 'edge' | 'central';

export async function setDnsMode(mode: DnsMode): Promise<string> {
  console.log(`[DNS-CONTROL] Switching DNS mode to ${mode.toUpperCase()} via managed restart`);

  try {
    // Prefix the command with DNS_MODE=mode — this sets it in host env for the command only
    // Highest precedence → entrypoint sees it correctly
    const cmd = `DNS_MODE=${mode} docker compose --project-name ${PROJECT_NAME} -f "${COMPOSE_FILE}" ` +
                `up -d --force-recreate --no-deps secondary-dns`;

    console.log('[DNS-CONTROL] Executing:', cmd);

    const { stdout, stderr } = await execAsync(cmd, { cwd: PROJECT_DIR });

    if (stdout) console.log('[DNS-CONTROL] stdout:', stdout.trim());
    if (stderr) console.warn('[DNS-CONTROL] stderr:', stderr.trim());

    console.log('[DNS-CONTROL] secondary-dns restarted with project prefix and correct mode');

    const target = mode === 'central' 
      ? 'central server (172.20.0.2)' 
      : 'local faculty edges';

    return `DNS mode switched to "${mode}" — secondary-dns fully restarted under project. All new queries route to ${target}`;
  } catch (e: any) {
    console.error('[DNS-CONTROL] Failed:', e.stdout || e.stderr || e);
    throw new Error('Failed to switch DNS mode');
  }
}