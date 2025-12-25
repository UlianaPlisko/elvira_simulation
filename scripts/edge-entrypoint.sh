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

# Default values (safe fallbacks)
export GUNZIP_SETTING="off"
export BROTL_SETTING="off"
# ZSTD_SETTING not used — no decompression module available

# Determine which decompression to enable based on environment variables
# These may be set by central manager (via docker exec) or passed at container start
if [ "${STRATEGY:-1}" = "2" ]; then
  case "${COMPRESS_ALGO:-gzip}" in
    gzip)
      export GUNZIP_SETTING="on"
      echo "Strategy 2 with gzip → enabling gunzip decompression" >> "${LOG_DIR}/entrypoint.log"
      ;;
    brotli)
      export BROTL_SETTING="on"
      echo "Strategy 2 with brotli → enabling brotli decompression" >> "${LOG_DIR}/entrypoint.log"
      ;;
    zstd)
      echo "WARNING: Strategy 2 with zstd requested, but edge decompression not supported." >> "${LOG_DIR}/entrypoint.log"
      echo "         Compressed data will be passed through (client may fail to decompress if not capable)." >> "${LOG_DIR}/entrypoint.log"
      # All decompression left off → passthrough
      ;;
    *)
      echo "Unknown or missing COMPRESS_ALGO='${COMPRESS_ALGO:-}' → defaulting to no decompression" >> "${LOG_DIR}/entrypoint.log"
      ;;
  esac
else
  echo "Strategy ${STRATEGY:-1} → no edge decompression needed" >> "${LOG_DIR}/entrypoint.log"
fi

echo "Final settings: STRATEGY=${STRATEGY:-1} COMPRESS_ALGO=${COMPRESS_ALGO:-gzip} GUNZIP=${GUNZIP_SETTING} BROTLI=${BROTL_SETTING}" >> "${LOG_DIR}/entrypoint.log"

# Generate nginx config from template
if [ -f "${TEMPLATE}" ]; then
  if envsubst '${GUNZIP_SETTING} ${BROTL_SETTING}' < "${TEMPLATE}" > "${OUT}.tmp"; then
    mv "${OUT}.tmp" "${OUT}"
    echo "edge nginx config successfully generated at ${OUT}" >> "${LOG_DIR}/entrypoint.log"
  else
    echo "ERROR: envsubst failed" | tee -a "${LOG_DIR}/entrypoint.log"
    rm -f "${OUT}.tmp"
    exit 1
  fi
else
  echo "ERROR: Template ${TEMPLATE} not found!" | tee -a "${LOG_DIR}/entrypoint.log"
  ls -la /etc/nginx >> "${LOG_DIR}/entrypoint.log" 2>&1 || true
  exit 1
fi

# Start background edge manager (if exists)
if [ -f /app/dist/main.js ]; then
  echo "Starting edge manager (Node.js app) in background..." >> "${LOG_DIR}/entrypoint.log"
  node /app/dist/main.js >> "${LOG_DIR}/main.log" 2>&1 &
fi

sleep 1

# Test nginx config
if nginx -t >> "${LOG_DIR}/entrypoint.log" 2>&1; then
  echo "nginx syntax test passed" >> "${LOG_DIR}/entrypoint.log"
else
  echo "ERROR: nginx -t failed — dumping generated config for debugging:" >> "${LOG_DIR}/entrypoint.log"
  cat "${OUT}" >> "${LOG_DIR}/entrypoint.log" 2>&1 || true
  exit 1
fi

echo "Starting nginx in foreground..." >> "${LOG_DIR}/entrypoint.log"
exec nginx -g "daemon off;"