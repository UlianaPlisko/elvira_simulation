# builder
FROM node:20-alpine AS builder
WORKDIR /app

# copy package + lock first
COPY applications/edge-managers/facultyA/package.json /app/package.json
COPY applications/edge-managers/facultyA/package-lock.json /app/package-lock.json

# copy base tsconfig and local tsconfig + sources
COPY tsconfig.json /app/tsconfig.base.json
COPY applications/edge-managers/facultyA/tsconfig.json /app/tsconfig.json
COPY applications/edge-managers/facultyA/src/ /app/src/

# install deps (use npm ci because we copied lockfile)
RUN npm ci --no-audit --no-fund

# build TS
RUN npm run build

# ---- runtime ----
FROM nginx:alpine
# ... runtime steps (copy dist, node runtime if needed)
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
# other runtime steps...
