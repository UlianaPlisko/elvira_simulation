import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PROJECT_DIR = '/project';
const COMPOSE_FILE = `${PROJECT_DIR}/docker-compose.yml`;
const PROJECT_NAME = 'elvira_simulation';
const SERVICE_NAME = 'student-facultyA';

const NETWORK_ELVIRA = `${PROJECT_NAME}_elvira-net`;
const NETWORK_FACULTYA = `${PROJECT_NAME}_facultyA-net`;

const SUBNET_ELVIRA = '172.20.0.0/16';
const GATEWAY_ELVIRA = '172.20.0.1';
const SUBNET_FACULTYA = '192.168.1.0/24';
const GATEWAY_FACULTYA = '192.168.1.1';

async function runCmd(cmd: string, cwd = PROJECT_DIR): Promise<{ stdout: string; stderr: string }> {
  console.log('[sim-control] running:', cmd);
  const { stdout, stderr } = await execAsync(cmd, { cwd });
  return { stdout, stderr };
}

async function networkExists(name: string): Promise<boolean> {
  try {
    const { stdout } = await runCmd(`docker network inspect ${name}`);
    return !!stdout && stdout.trim().length > 0;
  } catch (e) {
    return false;
  }
}

async function createNetwork(name: string, subnet: string, gateway: string): Promise<void> {
  if (await networkExists(name)) {
    console.log(`[sim-control] network ${name} already exists`);
    return;
  }
  const cmd = `docker network create --driver bridge --subnet ${subnet} --gateway ${gateway} ${name}`;
  console.log('[sim-control] creating network:', cmd);
  await runCmd(cmd, '/');
}

async function ensureNetworks(): Promise<void> {
  await createNetwork(NETWORK_ELVIRA, SUBNET_ELVIRA, GATEWAY_ELVIRA);
  await createNetwork(NETWORK_FACULTYA, SUBNET_FACULTYA, GATEWAY_FACULTYA);
}

async function runComposeCommand(command: string, useProfileSimulator = false): Promise<{ stdout: string; stderr: string }> {
  if (command.startsWith('up') || command.startsWith('create') || command.startsWith('restart')) {
    await ensureNetworks();
  }

  const profilePart = useProfileSimulator ? '--profile simulator ' : '';
  const full = `docker compose --project-name ${PROJECT_NAME} -f ${COMPOSE_FILE} ${profilePart}${command}`;
  console.log('[sim-control] running:', full);

  try {
    const { stdout, stderr } = await execAsync(full, { cwd: PROJECT_DIR });

    if (stderr && stderr.trim().length > 0) {
      console.log('[sim-control] command stderr:', stderr.trim());
    }

    return { stdout, stderr };
  } catch (err: any) {
    const stdout = err.stdout ?? '';
    const stderr = err.stderr ?? err.message ?? '';
    console.error('[sim-control] command failed:', full, '\nstdout:', stdout, '\nstderr:', stderr);
    throw new Error(`Failed to run "${command}": ${stderr || stdout || err.message}`);
  }
}

type SimStatus = {
  running: boolean;
  exists: boolean;
  status: string;           
  composeManaged: boolean;   
  containerId?: string;
};

export async function getSimulatorStatus(service: string = SERVICE_NAME): Promise<SimStatus> {
  try {
    const { stdout } = await runComposeCommand(`ps --format json ${service}`, true);
    const trimmed = (stdout || '').toString().trim();
    const psData = trimmed ? JSON.parse(trimmed) : [];
    if (Array.isArray(psData) && psData.length > 0) {
      const entry = psData[0];
      const rawState = (entry?.State || '').toString().toLowerCase();
      const running = rawState === 'running' || rawState === 'up';
      return {
        running,
        exists: true,
        status: rawState || 'unknown',
        composeManaged: true,
        containerId: entry?.ID || entry?.Container || undefined,
      };
    }
  } catch (err) {
    console.warn('[sim-control] compose ps failed (falling back to docker inspect):', (err as Error).message);
  }

  try {
    const { stdout } = await runCmd(`docker inspect ${service}`);
    const arr = JSON.parse(stdout || '[]');
    if (Array.isArray(arr) && arr.length > 0 && arr[0]) {
      const info = arr[0];
      const stateObj = info?.State || {};
      const running = !!stateObj?.Running || (stateObj?.Status && stateObj.Status.toString().toLowerCase() === 'running');
      const rawStatus = (stateObj?.Status || (running ? 'running' : 'exited')).toString().toLowerCase();
      const labels = info?.Config?.Labels || {};
      const composeManaged = !!labels['com.docker.compose.project'] && labels['com.docker.compose.project'] === PROJECT_NAME;
      return {
        running,
        exists: true,
        status: rawStatus,
        composeManaged,
        containerId: info.Id,
      };
    }
  } catch (err) {
    // inspect failed -> container likely doesn't exist
    // log and return not exists
    console.warn('[sim-control] docker inspect fallback failed:', (err as Error).message);
  }

  // Nothing found
  return { running: false, exists: false, status: 'not exists', composeManaged: false };
}

// startSimulator: use compose up when possible (so container becomes compose-managed)
export async function startSimulator(service: string = SERVICE_NAME): Promise<string> {
  try {
    await ensureNetworks();

    // Ensure image exists; build if not
    const imageName = 'elvira-sim-student-facultya:latest';
    try {
      await runCmd(`docker image inspect ${imageName}`);
    } catch {
      console.log('[sim-control] image not found, building via compose');
      await runComposeCommand(`build ${service}`, true);
    }

    // Remove any manual container with same name to avoid name conflict with Compose
    await runCmd(`docker rm -f ${service}`).catch(() => { /* ignore if missing */ });

    // Use compose to create/start service so container is compose-managed
    await runComposeCommand(`up -d --no-deps ${service}`, true);

    // final status
    const status = await getSimulatorStatus(service);
    if (status.exists && status.running) return 'Simulator started (compose-managed)';
    return 'Simulator started (but status not running yet)';
  } catch (err) {
    console.error('[sim-control] Start error:', err);
    throw err;
  }
}

// stopSimulator: prefer compose stop if compose-managed; otherwise docker stop
export async function stopSimulator(service: string = SERVICE_NAME): Promise<string> {
  try {
    const status = await getSimulatorStatus(service);
    if (!status.exists) {
      return 'Simulator does not exist';
    }

    if (status.composeManaged) {
      // use compose to stop the service (respects compose lifecycle)
      await runComposeCommand(`stop ${service}`, true);
      return 'Simulator stopped (compose)';
    }

    // fallback to docker stop for plain containers
    await runCmd(`docker stop ${service}`);
    return 'Simulator stopped (docker)';
  } catch (err) {
    console.error('[sim-control] Stop error:', err);
    throw err;
  }
}

export async function restartSimulator(service: string = SERVICE_NAME): Promise<string> {
  try {
    const status = await getSimulatorStatus(service);
    if (!status.exists) {
      // If it doesn't exist, just start it
      await startSimulator(service);
      return 'Simulator started (was not existing)';
    }

    if (status.composeManaged) {
      await runComposeCommand(`restart ${service}`, true);
      return 'Simulator restarted (compose)';
    }

    // plain docker restart
    await runCmd(`docker restart ${service}`);
    return 'Simulator restarted (docker)';
  } catch (err) {
    console.error('[sim-control] Restart error:', err);
    throw err;
  }
}
