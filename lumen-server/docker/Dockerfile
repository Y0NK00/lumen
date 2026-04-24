# Build context: repo root (one level above lumen-server/)
# docker-compose.yml sets: context: ..

# ── PWA build stage ──────────────────────────────────────────────────────────
FROM node:24-alpine AS pwa-builder

WORKDIR /pwa

COPY lumen-pwa/package.json lumen-pwa/package-lock.json ./
RUN npm ci

COPY lumen-pwa/ ./
RUN npm run build

# ── Server build stage ───────────────────────────────────────────────────────
FROM node:24-alpine AS server-builder

WORKDIR /app

# Install build deps for better-sqlite3 native compile
RUN apk add --no-cache python3 make g++

COPY lumen-server/package.json lumen-server/package-lock.json* ./
RUN npm ci

COPY lumen-server/tsconfig.json ./
COPY lumen-server/src ./src
COPY lumen-server/scripts ./scripts

RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

WORKDIR /app

# sqlite3 CLI for backup operations, tini for proper signal handling
RUN apk add --no-cache sqlite tini

# Non-root user for security
RUN addgroup -g 1001 lumen && adduser -u 1001 -G lumen -s /bin/sh -D lumen

# Copy built server + prod node_modules
COPY --from=server-builder --chown=lumen:lumen /app/dist ./dist
# schema.sql is not emitted by tsc — copy it explicitly
COPY --from=server-builder --chown=lumen:lumen /app/src/db/schema.sql ./dist/src/db/schema.sql
COPY --from=server-builder --chown=lumen:lumen /app/node_modules ./node_modules
COPY --from=server-builder --chown=lumen:lumen /app/package.json ./

# Copy built PWA — served as static files by @fastify/static
COPY --from=pwa-builder --chown=lumen:lumen /pwa/dist ./public

COPY --chown=lumen:lumen lumen-server/docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Data directory (mount as volume)
RUN mkdir -p /data && chown lumen:lumen /data
VOLUME ["/data"]

USER lumen

EXPOSE 7747 7745

ENV NODE_ENV=production
ENV DATA_DIR=/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:7747/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "./entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
