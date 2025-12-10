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

const STUDENT_IMAGE_NAME = 'elvira-sim-student:latest';

// .env файл теперь в /tmp — туда писать можно всегда
const ENV_FILE_PATH = '/tmp/.env.elvira_simulator';

const SELENIUM_IMAGE = 'selenium/standalone-chrome:latest';

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

async function runCompose(cmd: string) {
  const servicesStr ='selenium-client';
  const fullCmd = `docker compose --project-name ${PROJECT_NAME} -f ${COMPOSE_FILE} ${cmd}  ${servicesStr}`;
  console.log('[usecase2-control] →', fullCmd);
  const { stdout, stderr } = await execAsync(fullCmd, { cwd: PROJECT_DIR });
  if (stderr?.trim()) console.log('[usecase2-control] stderr:', stderr.trim());
  return stdout;
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
      await runCmd(`docker image inspect ${STUDENT_IMAGE_NAME}`);
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

export async function startUsecase2Client(): Promise<void> {
  try {
    // Check if image exists, pull if not (since it's external image, no build)
    try {
      const { stdout: inspectOut } = await runCmd(`docker image inspect ${SELENIUM_IMAGE}`);
      console.log('[usecase2] Image inspect output:', inspectOut.trim());
    } catch (err) {
      console.log('[usecase2] Image not found, pulling selenium image...');
      try {
        const { stdout: pullOut, stderr: pullErr } = await runCmd(`docker pull ${SELENIUM_IMAGE}`);
        console.log('[usecase2] Pull stdout:', pullOut.trim());
        if (pullErr.trim()) console.warn('[usecase2] Pull stderr:', pullErr.trim());
      } catch (pullErr) {
        console.error('[usecase2] Failed to pull image:', pullErr);
        throw pullErr;
      }
    }

    console.log('[usecase2] Запуск selenium-client...');
    let composeOut = '';
    try {
      composeOut = await runCompose('up -d --force-recreate --no-deps');
      console.log('[usecase2] docker compose up stdout:', composeOut.trim());
    } catch (composeErr) {
      console.error('[usecase2] docker compose up failed:', composeErr);
      // Try to get logs or status even if failed
      try {
        const { stdout: logsOut } = await runCmd('docker logs selenium-client');
        console.log('[usecase2] Partial logs after failed up:', logsOut.trim());
      } catch {}
      throw composeErr;
    }

    // Даём 5 секунд на старт Chrome (increase if needed)
    console.log('[usecase2] Waiting 5 seconds for container startup...');
    await new Promise(r => setTimeout(r, 5000));

    // Check if container is running
    const { stdout: statusOut } = await runCmd('docker inspect -f "{{.State.Status}}" selenium-client');
    const status = statusOut.trim();
    console.log('[usecase2] Selenium container status:', status);

    if (status !== 'running') {
      // Get exit code if exited
      let exitCode = 'N/A';
      try {
        const { stdout: exitCodeOut } = await runCmd('docker inspect -f "{{.State.ExitCode}}" selenium-client');
        exitCode = exitCodeOut.trim();
      } catch {}
      console.log('[usecase2] Selenium container exit code:', exitCode);

      // Get container logs
      let containerLogs = '';
      let logsErr = '';
      try {
        const logsResult = await runCmd('docker logs selenium-client');
        containerLogs = logsResult.stdout.trim();
        logsErr = logsResult.stderr.trim();
      } catch (logsFail) {
        console.warn('[usecase2] Failed to get docker logs:', logsFail);
      }
      console.log('[usecase2] Selenium container logs:', containerLogs);
      if (logsErr) console.warn('[usecase2] docker logs stderr:', logsErr);

      throw new Error(`Selenium container not running. Status: ${status}, Exit Code: ${exitCode}, Logs: ${containerLogs}`);
    }

    console.log('[usecase2] selenium-client запущен и готов');
  } catch (err: any) {
    console.error('[usecase2] Не удалось запустить selenium-client:', err.message);
    throw err;
  }
}

export async function stopUsecase2Client(): Promise<void> {
  try {
    console.log('[usecase2] Остановка selenium-client...');
    await runCompose('--profile usecase2 down selenium-client');
  } catch (err: any) {
    console.warn('[usecase2] Остановка не удалась (возможно, уже остановлен)');
  }
}