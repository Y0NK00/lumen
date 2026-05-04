import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  listArtifacts,
  createArtifact,
  getArtifactById,
  updateArtifact,
  softDeleteArtifact,
} from '../db/repos/artifacts.js';
import { logger } from '../lib/logger.js';

const createBody = z.object({
  title: z.string().min(1).max(500),
  body: z.string().max(256_000).optional(),
  kind: z.string().max(64).optional(),
  conversationId: z.string().nullable().optional(),
});

const patchBody = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().max(256_000).optional(),
  kind: z.string().max(64).optional(),
  conversationId: z.string().nullable().optional(),
});

export async function artifactRoutes(app: FastifyInstance) {
  app.get('/api/artifacts', { preHandler: requireAuth }, async (req, reply) => {
    const items = listArtifacts(req.auth!.userId);
    return reply.send({ items });
  });

  app.post('/api/artifacts', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }
    const artifact = createArtifact(req.auth!.userId, parsed.data);
    logger.info({ userId: req.auth!.userId, artifactId: artifact.id }, 'artifact.created');
    return reply.code(201).send({ artifact });
  });

  app.get('/api/artifacts/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const artifact = getArtifactById(id, req.auth!.userId);
    if (!artifact) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Artifact not found' } });
    }
    return reply.send({ artifact });
  });

  app.patch('/api/artifacts/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }
    const artifact = updateArtifact(id, req.auth!.userId, parsed.data);
    if (!artifact) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Artifact not found' } });
    }
    return reply.send({ artifact });
  });

  app.delete('/api/artifacts/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = softDeleteArtifact(id, req.auth!.userId);
    if (!ok) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Artifact not found' } });
    }
    return reply.send({ ok: true });
  });
}
