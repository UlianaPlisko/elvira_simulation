# ================ Builder Stage ================
FROM node:20-alpine AS builder

WORKDIR /app

COPY applications/edge-managers/faculty-edge/package.json /app/package.json
COPY applications/edge-managers/faculty-edge/package-lock.json /app/package-lock.json

COPY tsconfig.json /app/tsconfig.base.json
COPY applications/edge-managers/faculty-edge/tsconfig.json /app/tsconfig.json

COPY applications/edge-managers/faculty-edge/src/ /app/src/

RUN npm install --save-dev @types/cors

RUN npm run build

# ================ Final Stage – Nginx with Brotli ================
FROM wokalek/nginx-brotli:1.27.1

# Install your required packages
RUN apk update && \
    apk add --no-cache \
      nodejs \
      npm \
      gettext \
      prometheus-node-exporter \
      bash \
      iproute2 && \
    rm -rf /var/cache/apk/*

COPY infra/nginx/edge.conf.template /etc/nginx/edge.conf.template

RUN mkdir -p /var/cache/nginx/elvira_cache /var/log/edge /var/www/elvira && \
    chown -R nginx:nginx /var/cache/nginx /var/www/elvira /var/log/edge || true

# Copy Node app
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY applications/edge-managers/faculty-edge/package.json /app/package.json

COPY scripts/edge-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /app

EXPOSE 80 9100 3000-3010

ENTRYPOINT ["/app/entrypoint.sh"]