import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  listConversations,
  createConversation,
  getConversationById,
  updateConversation,
  softDeleteConversation,
  getConversationMessageCount,
  getConversationCostUsd,
} from '../db/repos/conversations.js';
import { getMessages } from '../db/repos/messages.js';
import { logger } from '../lib/logger.js';

const createConversationBody = z.object({
  title: z.string().max(255).optional(),
  projectId: z.string().nullable().optional(),
  model: z.enum(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']).optional(),
  systemPrompt: z.string().nullable().optional(),
});

const updateConversationBody = z.object({
  title: z.string().max(255).optional(),
  projectId: z.string().nullable().optional(),
  model: z.enum(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']).optional(),
  systemPrompt: z.string().nullable().optional(),
});

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
  project_id: z.string().optional(),
});

export async function conversationRoutes(app: FastifyInstance) {
  // GET /api/conversations
  app.get('/api/conversations', { preHandler: requireAuth }, async (req, reply) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Invalid query params' } });
    }

    const conversations = listConversations({
      userId: req.auth!.userId,
      limit: q.data.limit,
      cursor: q.data.cursor,
      projectId: q.data.project_id,
    });

    const items = conversations.map((c) => ({
      ...c,
      messageCount: getConversationMessageCount(c.id),
      totalCostUsd: getConversationCostUsd(c.id),
    }));

    const nextCursor = items.length === (q.data.limit ?? 50) ? items[items.length - 1]?.id : null;
    return reply.send({ items, nextCursor });
  });

  // POST /api/conversations
  app.post('/api/conversations', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createConversationBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }

    const conversation = createConversation({
      userId: req.auth!.userId,
      ...parsed.data,
    });

    logger.info({ userId: req.auth!.userId, conversationId: conversation.id }, 'conversation.created');
    return reply.code(201).send({ conversation });
  });

  // GET /api/conversations/:id  (includes full message history)
  app.get('/api/conversations/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const conversation = getConversationById(id, req.auth!.userId);

    if (!conversation) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }

    const messages = getMessages(id, req.auth!.userId);
    const totalCostUsd = getConversationCostUsd(id);

    return reply.send({ conversation, messages, totalCostUsd });
  });

  // PATCH /api/conversations/:id
  app.patch('/api/conversations/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateConversationBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    }

    const conversation = updateConversation(id, req.auth!.userId, parsed.data);
    if (!conversation) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }

    return reply.send({ conversation });
  });

  // DELETE /api/conversations/:id
  app.delete('/api/conversations/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = softDeleteConversation(id, req.auth!.userId);

    if (!deleted) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }

    logger.info({ userId: req.auth!.userId, conversationId: id }, 'conversation.deleted');
    return reply.send({ ok: true });
  });
}
