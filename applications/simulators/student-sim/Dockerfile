FROM node:20-alpine AS builder
WORKDIR /sim

COPY applications/simulators/student-sim/package.json /sim/package.json
COPY applications/simulators/student-sim/package-lock.json /sim/package-lock.json 
COPY applications/simulators/student-sim/tsconfig.json /sim/tsconfig.json
COPY applications/simulators/student-sim/src/ /sim/src/

RUN npm ci --no-audit --no-fund
RUN npm run build

FROM node:20-alpine
WORKDIR /sim
COPY --from=builder /sim/dist /sim/dist
COPY --from=builder /sim/node_modules /sim/node_modules
COPY applications/simulators/student-sim/package.json /sim/package.json

ENV NODE_ENV=production
EXPOSE 9400
CMD ["node", "dist/sim.js"]