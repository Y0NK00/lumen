import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  listScheduledTasks,
  createScheduledTask,
  getScheduledTaskById,
  updateScheduledTask,
  deleteScheduledTask,
} from '../db/repos/scheduledTasks.js';
import { logger } from '../lib/logger.js';

const modelEnum = z.enum(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']).nullable();

const createBody = z.object({
  name: z.string().min(1).max(200),
  cronExpr: z.string().min(1).max(128),
  prompt: z.string().min(1).max(32_000),
  model: modelEnum.optional(),
  enabled: z.boolean().optional(),
});

const patchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  cronExpr: z.string().min(1).max(128).optional(),
  prompt: z.string().min(1).max(32_000).optional(),
  model: modelEnum.optional(),
  enabled: z.boolean().optional(),
});

export async function scheduledTaskRoutes(app: FastifyInstance) {
  app.get('/api/scheduled-tasks', { preHandler: requireAuth }, async (req, reply) => {
    const items = listScheduledTasks(req.auth!.userId);
    return reply.send({ items });
  });

  app.post('/api/scheduled-tasks', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }
    const task = createScheduledTask(req.auth!.userId, parsed.data);
    logger.info({ userId: req.auth!.userId, taskId: task.id }, 'scheduled_task.created');
    return reply.code(201).send({ task });
  });

  app.get('/api/scheduled-tasks/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = getScheduledTaskById(id, req.auth!.userId);
    if (!task) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }
    return reply.send({ task });
  });

  app.patch('/api/scheduled-tasks/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }
    const task = updateScheduledTask(id, req.auth!.userId, parsed.data);
    if (!task) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }
    return reply.send({ task });
  });

  app.delete('/api/scheduled-tasks/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = deleteScheduledTask(id, req.auth!.userId);
    if (!ok) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }
    return reply.send({ ok: true });
  });
}
