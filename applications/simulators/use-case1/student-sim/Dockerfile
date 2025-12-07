FROM node:20-alpine AS builder
WORKDIR /sim

COPY applications/simulators/use-case1/student-sim/package.json /sim/package.json
COPY applications/simulators/use-case1/student-sim/package-lock.json /sim/package-lock.json 
COPY applications/simulators/use-case1/student-sim/tsconfig.json /sim/tsconfig.json
COPY applications/simulators/use-case1/student-sim/src/ /sim/src/

RUN npm ci --no-audit --no-fund
RUN npm run build

FROM node:20-alpine
# Добавляем iproute2 для ip route
RUN apk add --no-cache iproute2 bind-tools

WORKDIR /sim
COPY --from=builder /sim/dist /sim/dist
COPY --from=builder /sim/node_modules /sim/node_modules
COPY applications/simulators/use-case1/student-sim/package.json /sim/package.json

# Копируем entrypoint
COPY scripts/student-entrypoint.sh /sim/entrypoint.sh
RUN chmod +x /sim/entrypoint.sh

ENV NODE_ENV=production
EXPOSE 9400

ENTRYPOINT ["/sim/entrypoint.sh"]
# CMD ["node", "dist/sim.js"]  