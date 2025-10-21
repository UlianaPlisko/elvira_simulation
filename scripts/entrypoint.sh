#!/usr/bin/env sh
set -eu

LOG_DIR=/var/log/central
mkdir -p ${LOG_DIR}
ip route add 192.168.1.0/24 via 172.20.0.4 || echo "Route already exists or error"
chmod 755 ${LOG_DIR}

echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') ENTRYPOINT PROD START" >> ${LOG_DIR}/entrypoint.log

# Запуск node_exporter (если установлен) в фоне
if [ -x "/usr/bin/node_exporter" ]; then
  /usr/bin/node_exporter > ${LOG_DIR}/node_exporter.log 2>&1 &
  echo "node_exporter started" >> ${LOG_DIR}/entrypoint.log
fi

# Запуск скомпилированного Node приложения (dist/main.js) в фоне
if command -v node >/dev/null 2>&1; then
  node dist/main.js > ${LOG_DIR}/central-manager.log 2>&1 &
  echo "node dist/main.js started" >> ${LOG_DIR}/entrypoint.log
else
  echo "node not found" >> ${LOG_DIR}/entrypoint.log
fi

# Даем секунду, чтобы фоновые процессы стартовали
sleep 1

echo "Starting nginx in foreground" >> ${LOG_DIR}/entrypoint.log
exec nginx -g "daemon off;"