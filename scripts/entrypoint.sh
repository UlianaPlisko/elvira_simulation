#!/usr/bin/env sh
set -eu

# Логи для удобства — сохраняются внутри контейнера в /var/log
LOG_DIR=/var/log/central
mkdir -p ${LOG_DIR}
chmod 755 ${LOG_DIR}

echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') ENTRYPOINT: starting node_exporter and central-manager (ts-node)" >> ${LOG_DIR}/entrypoint.log

# Запускаем node_exporter в фоне (если установлен)
if [ -x "/usr/bin/node_exporter" ]; then
  /usr/bin/node_exporter > ${LOG_DIR}/node_exporter.log 2>&1 &
  echo "node_exporter started" >> ${LOG_DIR}/entrypoint.log
else
  echo "node_exporter not found, skipping" >> ${LOG_DIR}/entrypoint.log
fi

# Запускаем центральный TS-менеджер (ts-node) в фоне; он поднимает /metrics и decision loop
if command -v ts-node >/dev/null 2>&1; then
  # Перенаправляем stdout/stderr в лог
  ts-node --project tsconfig.json src/main.ts > ${LOG_DIR}/central-manager.log 2>&1 &
  echo "ts-node central-manager started (background)" >> ${LOG_DIR}/entrypoint.log
else
  echo "ts-node not found in PATH" >> ${LOG_DIR}/entrypoint.log
fi

# Небольшая задержка, чтобы фоновые процессы стартовали и успели дать первые логи
sleep 1

# Запускаем nginx в foreground (exec — чтобы nginx стал PID 1)
echo "Starting nginx in foreground" >> ${LOG_DIR}/entrypoint.log
exec nginx -g "daemon off;"
