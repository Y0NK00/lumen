import type { FastifyInstance } from 'fastify';

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async (_req, reply) => {
    return reply.send({
      ok: true,
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    });
  });
}
