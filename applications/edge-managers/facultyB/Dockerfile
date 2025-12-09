# builder
FROM node:20-alpine AS builder
WORKDIR /app

# copy package + lock first
COPY applications/edge-managers/facultyB/package.json /app/package.json
COPY applications/edge-managers/facultyB/package-lock.json /app/package-lock.json

# copy base tsconfig and local tsconfig + sources
COPY tsconfig.json /app/tsconfig.base.json
COPY applications/edge-managers/facultyB/tsconfig.json /app/tsconfig.json
COPY applications/edge-managers/facultyB/src/ /app/src/

# install deps (use npm ci because we copied lockfile)
RUN npm i --save-dev @types/cors

# build TS
RUN npm run build

# ---- runtime ----
FROM nginx:alpine

# Устанавливаем node runtime и другие пакеты
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories && \
    apk update && apk add --no-cache nodejs npm gettext prometheus-node-exporter bash iproute2 && \
    rm -rf /var/cache/apk/*

# nginx config (предполагаю, что conf в infra/nginx/edge.conf или подобном — адаптируй путь)
COPY infra/nginx/edge.conf.template /etc/nginx/edge.conf.template

# Создаём директории для кэша и логов
RUN mkdir -p /var/cache/nginx/elvira_cache /var/log/edge /var/www/elvira && \
    chown -R nginx:nginx /var/cache/nginx /var/www/elvira || true

# Копируем собранное приложение и зависимости
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY applications/edge-managers/facultyC/package.json /app/

# Копируем entrypoint
COPY scripts/edge-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /app

EXPOSE 80 9100 3000 3100 

ENTRYPOINT ["/app/entrypoint.sh"]