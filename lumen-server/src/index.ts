import 'dotenv/config';

// Sentry must be imported and initialized before everything else so it can
// instrument the Fastify request lifecycle and catch startup errors.
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1, // 10% of requests traced — free tier friendly
  });
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { logger } from './lib/logger.js';
import { bootstrapAdmin } from './bootstrap.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { conversationRoutes } from './routes/conversations.js';
import { messageRoutes } from './routes/messages.js';
import { settingsRoutes } from './routes/settings.js';
import { usageRoutes } from './routes/usage.js';
import { adminRoutes } from './routes/admin.js';
import { oauthRoutes } from './routes/oauth.js';
import { memoryRoutes } from './routes/memory.js';

async function main() {
  const app = Fastify({
    logger,
    bodyLimit: 25 * 1024 * 1024, // 25MB for image attachments
    trustProxy: true, // Behind Cloudflare Tunnel
  });

  await app.register(cors, {
    origin: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
  });

  // ── Routes ──────────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(conversationRoutes);
  await app.register(messageRoutes);
  await app.register(settingsRoutes);
  await app.register(usageRoutes);
  await app.register(adminRoutes);
  await app.register(oauthRoutes);
  await app.register(memoryRoutes);
  // TODO: vault, tasks, ws (browser extension WebSocket)

  // ── Static PWA (production only) ────────────────────────────────────────────
  // In dev the Vite dev server handles this; in production the built PWA lives
  // at ./public (copied from lumen-pwa/dist during Docker build).
  const publicDir = path.resolve('public');
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: '/',
      // Don't serve index.html automatically — we handle it in the catch-all
      // so client-side routes like /settings get the SPA entry point.
      wildcard: false,
    });

    // SPA catch-all: any request that didn't match an API route gets index.html.
    // This enables React Router / client-side navigation.
    app.setNotFoundHandler(async (_req, reply) => {
      return reply.sendFile('index.html', publicDir);
    });
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  await bootstrapAdmin();

  // ── Listen ───────────────────────────────────────────────────────────────────
  const port = Number(process.env.PORT) || 7747;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen({ port, host });
  logger.info({ port, host }, 'lumen-server listening');
}

main().catch((err) => {
  Sentry.captureException(err);
  logger.error(err, 'fatal startup error');
  process.exit(1);
});
