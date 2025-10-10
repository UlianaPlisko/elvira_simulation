FROM nginx:alpine

RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache nodejs npm prometheus-node-exporter && \
    npm install -g ts-node && \
    rm -rf /var/cache/apk/*

COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
VOLUME /usr/share/nginx/html/books/
COPY applications/edge-managers/facultyA/src/ /app/src/
COPY applications/edge-managers/facultyA/package.json /app/
COPY tsconfig.json /app/ 

WORKDIR /app
RUN npm install

EXPOSE 80 9100 3000

CMD ["sh", "-c", "nginx -g 'daemon off;' & /usr/bin/node_exporter & ts-node --project tsconfig.json src/main.ts"]