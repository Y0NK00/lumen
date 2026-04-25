import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { listMemories, createMemory, deleteMemory } from '../db/repos/memory.js';

const createMemoryBody = z.object({
  content: z.string().min(1).max(2000),
});

export async function memoryRoutes(app: FastifyInstance) {
  // GET /api/memory
  app.get('/api/memory', { preHandler: requireAuth }, async (req, reply) => {
    const memories = listMemories(req.auth!.userId);
    return reply.send({ memories });
  });

  // POST /api/memory
  app.post('/api/memory', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createMemoryBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }
    const memory = createMemory(req.auth!.userId, parsed.data.content);
    return reply.code(201).send({ memory });
  });

  // DELETE /api/memory/:id
  app.delete('/api/memory/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = deleteMemory(id, req.auth!.userId);
    if (!removed) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Memory not found' } });
    }
    return reply.send({ ok: true });
  });
}
