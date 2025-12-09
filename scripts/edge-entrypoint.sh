#!/usr/bin/env sh
set -eu

LOG_DIR=/var/log/edge
mkdir -p "${LOG_DIR}"
chmod 755 "${LOG_DIR}"
echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') EDGE ENTRYPOINT START" >> "${LOG_DIR}/entrypoint.log"

TEMPLATE=/etc/nginx/edge.conf.template
OUT=/etc/nginx/nginx.conf

if ! command -v envsubst >/dev/null 2>&1; then
  echo "ERROR: envsubst not found" | tee -a "${LOG_DIR}/entrypoint.log"
  exit 1
fi

# Compute GUNZIP_SETTING (must be exactly "on" or "off")
if [ "${STRATEGY:-1}" = "2" ] && [ "${COMPRESS_ALGO:-gzip}" = "gzip" ]; then
  export GUNZIP_SETTING="on"
else
  export GUNZIP_SETTING="off"
fi

echo "Using STRATEGY=${STRATEGY:-1} COMPRESS_ALGO=${COMPRESS_ALGO:-gzip} => GUNZIP_SETTING=${GUNZIP_SETTING}" >> "${LOG_DIR}/entrypoint.log"

if [ -f "${TEMPLATE}" ]; then
  if envsubst '${GUNZIP_SETTING}' < "${TEMPLATE}" > "${OUT}.tmp"; then
    mv "${OUT}.tmp" "${OUT}"
    echo "edge nginx config generated at ${OUT}" >> "${LOG_DIR}/entrypoint.log"
  else
    echo "envsubst failed" | tee -a "${LOG_DIR}/entrypoint.log"
    rm -f "${OUT}.tmp"
    exit 1
  fi
else
  echo "Template ${TEMPLATE} not found!" | tee -a "${LOG_DIR}/entrypoint.log"
  ls -la /etc/nginx >> "${LOG_DIR}/entrypoint.log" || true
  exit 1
fi

# start background simulator if present
if [ -f /app/dist/main.js ]; then
  node /app/dist/main.js >> "${LOG_DIR}/main.log" 2>&1 &
  echo "edge started" >> "${LOG_DIR}/entrypoint.log"
fi

sleep 1

nginx -t >> "${LOG_DIR}/entrypoint.log" 2>&1 || ( echo "nginx -t failed, dumping generated config" >> "${LOG_DIR}/entrypoint.log"; sed -n '1,200p' "${OUT}" >> "${LOG_DIR}/entrypoint.log"; exit 1 )

echo "Starting nginx" >> "${LOG_DIR}/entrypoint.log"
exec nginx -g "daemon off;"
