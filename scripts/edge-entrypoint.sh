#!/usr/bin/env sh
set -eu

LOG_DIR=/var/log/edge
mkdir -p ${LOG_DIR}
ip route add 10.50.1.0/24 via 10.50.0.4 || echo "Route already exists or error"

# start node_exporter
if [ -x "/usr/bin/node_exporter" ]; then
  /usr/bin/node_exporter > ${LOG_DIR}/node_exporter.log 2>&1 &
  echo "node_exporter started" >> ${LOG_DIR}/entrypoint.log
fi

# start app (node dist/main.js) in background
if command -v node >/dev/null 2>&1; then
  node dist/main.js > ${LOG_DIR}/edge-manager.log 2>&1 &
  echo "node dist/main.js started" >> ${LOG_DIR}/entrypoint.log
else
  echo "node not found" >> ${LOG_DIR}/entrypoint.log
fi

sleep 1
exec nginx -g "daemon off;"
