# applications/central-manager/Dockerfile
FROM nginx:alpine

# добавить community repo (если нужен) и установить зависимости
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache nodejs npm prometheus-node-exporter bash && \
    npm install -g ts-node && \
    rm -rf /var/cache/apk/*

# nginx конфиг и статический контент
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY mock-content/ /usr/share/nginx/html/books/

# приложение (TS код)
COPY applications/central-manager/src/ /app/src/
COPY applications/central-manager/package.json /app/
COPY tsconfig.json /app/

# Копируем entrypoint из корневой папки scripts (вы просили его туда положить)
# Убедитесь, что в вашем репозитории есть scripts/entrypoint.sh
COPY scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /app
RUN npm install --production

EXPOSE 80 9100 3000 3100

# Используем entrypoint — он сам запустит node_exporter и ts-node в фоне,
# затем выполнит nginx в foreground (exec), чтобы контейнер не завершался.
ENTRYPOINT ["/app/entrypoint.sh"]
