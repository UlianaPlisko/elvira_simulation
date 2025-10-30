# applications/central-manager/Dockerfile

# ---- Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package.json и tsconfig + исходники
COPY applications/central-manager/package.json /app/package.json
# Копируем базовый tsconfig (корневой) под именем tsconfig.base.json
COPY tsconfig.json /app/tsconfig.base.json

# Копируем локальный tsconfig, который extends "./tsconfig.base.json"
COPY applications/central-manager/tsconfig.json /app/tsconfig.json
COPY applications/central-manager/src/ /app/src/

# Устанавливаем все зависимости (dev + prod) для сборки
RUN npm install --no-audit --no-fund

# Build TypeScript
RUN npm run build

# ---- Final image ----
FROM nginx:alpine

# Устанавливаем node runtime только если нужно (мы запустим node из dist)
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories && \
    apk update && apk add --no-cache nodejs npm prometheus-node-exporter bash iproute2 && \
    rm -rf /var/cache/apk/*

# nginx config и статический контент
COPY infra/nginx/default.conf /etc/nginx/nginx.conf
RUN mkdir -p /var/www/elvira/books && \
    chown -R nginx:nginx /var/www/elvira /usr/share/nginx/html || true
COPY mock-content/ /var/www/elvira/books/

# Копируем собранное приложение и его зависимости из builder
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY applications/central-manager/package.json /app/

# Копируем entrypoint-prod в /app
COPY scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /app

EXPOSE 80 9100 3000 3100

ENTRYPOINT ["/app/entrypoint.sh"]
