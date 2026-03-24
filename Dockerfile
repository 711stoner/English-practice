# Build stage
FROM node:22 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage (Node preview with API middleware)
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Vite preview + plugins require config and node_modules at runtime.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/vite.config.js ./vite.config.js
COPY --from=builder /app/dist ./dist

EXPOSE 4173
CMD ["sh", "-c", "npm run preview -- --host 0.0.0.0 --port ${PORT:-4173}"]
