# Build stage
FROM node:22 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage (static)
FROM zeabur/caddy-static:latest
COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
