import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const PROJECT_DIR = '/project';
const COMPOSE_FILE = `${PROJECT_DIR}/docker-compose.yml`;
const PROJECT_NAME = 'elvira_simulation';

const STUDENT_SERVICES = [
  'student-facultyA',
  'student-facultyB',
  'student-facultyC',
  'student-facultyD',
  'student-facultyE',
];

const IMAGE_NAME = 'elvira-sim-student:latest';

// .env файл теперь в /tmp — туда писать можно всегда
const ENV_FILE_PATH = '/tmp/.env.elvira_simulator';

async function runCmd(cmd: string, cwd = PROJECT_DIR) {
  console.log('[sim-control] →', cmd);
  const { stdout, stderr } = await execAsync(cmd, { cwd });
  if (stderr?.trim()) console.log('[sim-control] stderr:', stderr.trim());
  return { stdout, stderr };
}

async function runComposeCommand(command: string): Promise<void> {
  const servicesStr = STUDENT_SERVICES.join(' ');
  const fullCmd = `docker compose --project-name ${PROJECT_NAME} -f ${COMPOSE_FILE} --env-file ${ENV_FILE_PATH} ${command} ${servicesStr}`;
  console.log('[sim-control] running:', fullCmd);
  await execAsync(fullCmd, { cwd: PROJECT_DIR });
}

// Создаём .env в /tmp
async function createTempEnvFile(mode: 'normal' | 'exam'): Promise<void> {
  await fs.promises.writeFile(ENV_FILE_PATH, `SIM_MODE=${mode}\n`, 'utf-8');
  console.log(`[sim-control] Created env file ${ENV_FILE_PATH} → SIM_MODE=${mode}`);
}

async function removeTempEnvFile(): Promise<void> {
  try { await fs.promises.unlink(ENV_FILE_PATH); } catch {}
}

// ====================== PUBLIC API ======================

export async function startSimulator(mode: 'normal' | 'exam' = 'exam'): Promise<string> {
  try {
    // Build если нет образа
    try {
      await runCmd(`docker image inspect ${IMAGE_NAME}`);
    } catch {
      console.log('[sim-control] Building image...');
      await runComposeCommand('build');
    }

    // Удаляем старые контейнеры
    for (const s of STUDENT_SERVICES) {
      await runCmd(`docker rm -f ${s}`).catch(() => {});
    }

    // Создаём .env в /tmp
    await createTempEnvFile(mode);

    // Запускаем ТОЛЬКО студентов (central/edges/prometheus НЕ трогаются!)
    await runComposeCommand('up -d --force-recreate --no-deps');
    console.log('[sim-control] Simulator started in mode:', mode);
    return `Simulator started in "${mode}" mode (5 faculties, 10 min)`;
  } catch (err: any) {
    console.error('[sim-control] Start failed:', err);
    throw new Error(`Start failed: ${err.message}`);
  }
}

export async function stopSimulator(): Promise<string> {
  try {
    await runComposeCommand('stop');
    await runComposeCommand('rm -f');
    await removeTempEnvFile();
    return 'Simulator stopped';
  } catch (err: any) {
    console.error('[sim-control] Stop failed:', err);
    throw new Error(`Stop failed: ${err.message}`);
  }
}

export async function getSimulatorStatus(): Promise<{
  running: boolean;
  currentMode: 'normal' | 'exam' | null;
  services: Record<string, boolean>;
}> {
  const services: Record<string, boolean> = {};
  let allRunning = true;

  for (const service of STUDENT_SERVICES) {
    try {
      const { stdout } = await runCmd(`docker ps --filter "name=^${PROJECT_NAME}_${service}$" --format "{{.State}}"`);
      const state = stdout.trim();
      const running = state === 'running';
      services[service] = running;
      if (!running) allRunning = false;
    } catch {
      services[service] = false;
      allRunning = false;
    }
  }

  let currentMode: 'normal' | 'exam' | null = null;
  try {
    const content = await fs.promises.readFile(ENV_FILE_PATH, 'utf-8');
    if (content.includes('normal')) currentMode = 'normal';
    else if (content.includes('exam')) currentMode = 'exam';
  } catch {}

  return { running: allRunning, currentMode, services };
}