import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  listProjects,
  createProject,
  getProjectById,
  updateProject,
  softDeleteProject,
} from '../db/repos/projects.js';
import { logger } from '../lib/logger.js';

const createBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  systemPrompt: z.string().max(32_000).nullable().optional(),
});

const patchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  systemPrompt: z.string().max(32_000).nullable().optional(),
  pinned: z.boolean().optional(),
});

export async function projectRoutes(app: FastifyInstance) {
  app.get('/api/projects', { preHandler: requireAuth }, async (req, reply) => {
    const items = listProjects(req.auth!.userId);
    return reply.send({ items });
  });

  app.post('/api/projects', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }
    const project = createProject(req.auth!.userId, parsed.data);
    logger.info({ userId: req.auth!.userId, projectId: project.id }, 'project.created');
    return reply.code(201).send({ project });
  });

  app.get('/api/projects/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProjectById(id, req.auth!.userId);
    if (!project) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }
    return reply.send({ project });
  });

  app.patch('/api/projects/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }
    const project = updateProject(id, req.auth!.userId, parsed.data);
    if (!project) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }
    return reply.send({ project });
  });

  app.delete('/api/projects/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = softDeleteProject(id, req.auth!.userId);
    if (!ok) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }
    return reply.send({ ok: true });
  });
}
