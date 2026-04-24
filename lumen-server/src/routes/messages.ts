import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { checkBudget } from '../middleware/budget.js';
import { getConversationById, updateConversation } from '../db/repos/conversations.js';
import { getMessages, createMessage } from '../db/repos/messages.js';
import { recordUsage } from '../db/repos/usage.js';
import { streamAnthropicMessage, abortStream } from '../services/providers/anthropic.js';
import { logger } from '../lib/logger.js';

const sendMessageBody = z.object({
  content: z.string().min(1).max(100_000),
  model: z.enum(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']).optional(),
  // Future: attachments
});

export async function messageRoutes(app: FastifyInstance) {
  // POST /api/conversations/:id/messages  — SSE streaming
  app.post(
    '/api/conversations/:id/messages',
    { preHandler: [requireAuth, checkBudget] },
    async (req, reply) => {
      const { id: conversationId } = req.params as { id: string };
      const userId = req.auth!.userId;

      const parsed = sendMessageBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
      }

      const conversation = getConversationById(conversationId, userId);
      if (!conversation) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
      }

      const model = parsed.data.model ?? conversation.model;

      // Save user message
      const userMessage = createMessage({
        conversationId,
        userId,
        role: 'user',
        content: [{ type: 'text', text: parsed.data.content }],
      });

      // Update conversation timestamp
      updateConversation(conversationId, userId, {
        lastMessageAt: new Date().toISOString(),
      });

      // Create placeholder assistant message (filled after stream)
      const assistantMessage = createMessage({
        conversationId,
        userId,
        role: 'assistant',
        content: [],
        finishReason: null,
      });

      // Hijack reply — we're driving the raw HTTP response from here
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const sendEvent = (event: string, data: unknown) => {
        try {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
          // client disconnected mid-stream
        }
      };

      // Notify client: user message saved
      sendEvent('message_created', { messageId: userMessage.id, role: 'user' });
      // Notify client: assistant message placeholder created, streaming begins
      sendEvent('assistant_start', { messageId: assistantMessage.id });

      // Build message history for Anthropic
      const history = getMessages(conversationId, userId).filter(
        (m) => m.role === 'user' || m.role === 'assistant'
      );
      const anthropicMessages = history
        .filter((m) => m.id !== assistantMessage.id) // exclude the empty placeholder
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
            .filter((b) => b.type === 'text')
            .map((b) => ({ type: 'text' as const, text: (b as { type: string; text: string }).text })),
        }));

      try {
        const result = await streamAnthropicMessage({
          conversationId,
          assistantMessageId: assistantMessage.id,
          model,
          systemPrompt: conversation.systemPrompt,
          messages: anthropicMessages,
          onEvent: sendEvent,
        });

        // Persist complete assistant message
        const { updateMessageContent } = await import('../db/repos/messages.js');
        updateMessageContent(
          assistantMessage.id,
          [{ type: 'text', text: result.content }],
          result.finishReason
        );

        // Record token usage + cost
        recordUsage({
          userId,
          conversationId,
          messageId: assistantMessage.id,
          model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          cacheWriteTokens: result.usage.cacheWriteTokens,
          costUsd: result.costUsd,
        });

        sendEvent('done', { messageId: assistantMessage.id, finishReason: result.finishReason });
        logger.info(
          { userId, conversationId, model, costUsd: result.costUsd },
          'message.streamed'
        );
      } catch (err) {
        logger.error({ err, userId, conversationId }, 'message stream failed');
        // error event already sent by provider
      } finally {
        reply.raw.end();
      }
    }
  );

  // POST /api/conversations/:id/abort
  app.post(
    '/api/conversations/:id/abort',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id: conversationId } = req.params as { id: string };
      const userId = req.auth!.userId;

      // Verify ownership before aborting
      const conversation = getConversationById(conversationId, userId);
      if (!conversation) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
      }

      const aborted = abortStream(conversationId);
      return reply.send({ ok: true, aborted });
    }
  );
}
