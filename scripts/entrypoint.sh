#!/usr/bin/env sh
set -eu

LOG_DIR=/var/log/central
mkdir -p ${LOG_DIR}
ip route add 10.50.1.0/24 via 10.50.0.4 || echo "Route already exists or error"
chmod 755 ${LOG_DIR}

echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') ENTRYPOINT PROD START" >> ${LOG_DIR}/entrypoint.log

# node_exporter
if [ -x "/usr/bin/node_exporter" ]; then
  /usr/bin/node_exporter | tee ${LOG_DIR}/node_exporter.log &
  echo "node_exporter started" >> ${LOG_DIR}/entrypoint.log
fi

# Node.js with tee (file + stdout)
if command -v node >/dev/null 2>&1; then
  node dist/main.js | tee ${LOG_DIR}/central-manager.log &
  echo "node dist/main.js started" >> ${LOG_DIR}/entrypoint.log
else
  echo "node not found" >> ${LOG_DIR}/entrypoint.log
fi

sleep 1

echo "Starting nginx in foreground" >> ${LOG_DIR}/entrypoint.log
exec nginx -g "daemon off;"