# ── Build stage ──
FROM node:24-alpine AS builder

WORKDIR /app

# Install build deps for better-sqlite3 native compile
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

# ── Runtime stage ──
FROM node:24-alpine AS runtime

WORKDIR /app

# sqlite3 CLI for backup operations, tini for proper signal handling
RUN apk add --no-cache sqlite tini

# Non-root user for security
RUN addgroup -g 1001 lumen && adduser -u 1001 -G lumen -s /bin/sh -D lumen

# Copy built app + prod node_modules
COPY --from=builder --chown=lumen:lumen /app/dist ./dist
# schema.sql is not emitted by tsc — copy it explicitly
COPY --from=builder --chown=lumen:lumen /app/src/db/schema.sql ./dist/src/db/schema.sql
COPY --from=builder --chown=lumen:lumen /app/node_modules ./node_modules
COPY --from=builder --chown=lumen:lumen /app/package.json ./
COPY --chown=lumen:lumen docker/entrypoint.sh ./entrypoint.sh
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
