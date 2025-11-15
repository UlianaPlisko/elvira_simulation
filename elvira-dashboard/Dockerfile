# Dockerfile
FROM node:20-alpine

WORKDIR /app

# copy package files and install (dev deps needed for build)
COPY package*.json ./
RUN npm install --no-audit --no-fund

# copy source and build
COPY . .
RUN npm run build

# expose the port you want (container listens on 3101)
EXPOSE 3101

# run vite preview on all interfaces at port 3101
CMD ["npm", "run", "preview", "--", "--port", "3101", "--host", "0.0.0.0"]