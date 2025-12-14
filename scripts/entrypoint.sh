#!/usr/bin/env sh
set -eu

LOG_DIR=/var/log/central
mkdir -p "${LOG_DIR}"
chmod 755 "${LOG_DIR}"
echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') ENTRYPOINT START" >> "${LOG_DIR}/entrypoint.log"

mkdir -p /var/log/nginx
chown nginx:nginx /var/log/nginx
chmod 755 /var/log/nginx

rm -f /var/log/nginx/access.log /var/log/nginx/error.log


touch /var/log/nginx/access.log /var/log/nginx/error.log
chown nginx:nginx /var/log/nginx/access.log /var/log/nginx/error.log
chmod 644 /var/log/nginx/*.log

echo "Fixed nginx log files: created real files instead of symlinks to /dev/*" >> "${LOG_DIR}/entrypoint.log"

TEMPLATE=/etc/nginx/central.conf.template
OUT=/etc/nginx/nginx.conf

# Ensure envsubst exists
if ! command -v envsubst >/dev/null 2>&1; then
  echo "ERROR: envsubst not found" | tee -a "${LOG_DIR}/entrypoint.log"
  exit 1
fi

# Compute substitution values
if [ "${STRATEGY:-1}" = "1" ]; then
  export BOOKS_ALIAS="/var/www/books/"
  export CONTENT_ENCODING=""
else
  export BOOKS_ALIAS="/var/www/books/compressed/"
  case "${COMPRESS_ALGO:-gzip}" in
    gzip) export CONTENT_ENCODING="gzip" ;;
    brotli|br) export CONTENT_ENCODING="br" ;;
    zstd|zst) export CONTENT_ENCODING="zstd" ;;
    *) export CONTENT_ENCODING="${COMPRESS_ALGO:-gzip}" ;;
  esac
fi

echo "Using STRATEGY=${STRATEGY:-1} BOOKS_ALIAS=${BOOKS_ALIAS} CONTENT_ENCODING='${CONTENT_ENCODING}'" >> "${LOG_DIR}/entrypoint.log"

if [ -f "${TEMPLATE}" ]; then
  # do substitution and write out
  if envsubst '${BOOKS_ALIAS} ${CONTENT_ENCODING}' < "${TEMPLATE}" > "${OUT}.tmp"; then
    mv "${OUT}.tmp" "${OUT}"
    echo "nginx config generated at ${OUT}" >> "${LOG_DIR}/entrypoint.log"
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

# Start background collectors if present
if command -v node_exporter >/dev/null 2>&1; then
  node_exporter >/dev/null 2>&1 &
  echo "node_exporter started" >> "${LOG_DIR}/entrypoint.log"
fi

# start node app in background (if built)
if [ -f /app/dist/main.js ]; then
  node /app/dist/main.js &
  echo "node started" >> "${LOG_DIR}/entrypoint.log"
fi

sleep 1

# validate nginx config for extra safety
nginx -t >> "${LOG_DIR}/entrypoint.log" 2>&1 || ( echo "nginx -t failed, dumping generated config" >> "${LOG_DIR}/entrypoint.log"; sed -n '1,200p' "${OUT}" >> "${LOG_DIR}/entrypoint.log"; exit 1 )

echo "Starting nginx" >> "${LOG_DIR}/entrypoint.log"
exec nginx -g "daemon off;"
