import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { listFiles, getFileById, createFile, updateFile, softDeleteFile } from '../db/repos/files.js';
import { logger } from '../lib/logger.js';

// Allowed file languages/types
const LANGUAGES = [
  'markdown', 'plaintext', 'javascript', 'typescript', 'python',
  'bash', 'sh', 'json', 'yaml', 'toml', 'html', 'css', 'sql',
  'rust', 'go', 'java', 'csharp', 'cpp', 'c', 'xml', 'dockerfile',
] as const;

const createBody = z.object({
  name: z.string().min(1).max(500),
  language: z.enum(LANGUAGES).optional().default('markdown'),
  content: z.string().max(500_000).optional().default(''),
  projectId: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
});

const patchBody = z.object({
  name: z.string().min(1).max(500).optional(),
  language: z.enum(LANGUAGES).optional(),
  content: z.string().max(500_000).optional(),
  projectId: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
});

export async function fileRoutes(app: FastifyInstance) {
  // List files (no content — stub only)
  app.get('/api/files', { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as { project_id?: string; conversation_id?: string };
    const items = listFiles(req.auth!.userId, {
      projectId: query.project_id,
      conversationId: query.conversation_id,
    });
    return reply.send({ items });
  });

  // Get single file with full content
  app.get('/api/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = getFileById(id, req.auth!.userId);
    if (!file) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    return reply.send({ file });
  });

  // Create file
  app.post('/api/files', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    const file = createFile(req.auth!.userId, parsed.data);
    logger.info({ userId: req.auth!.userId, fileId: file.id, name: file.name }, 'file.created');
    return reply.code(201).send({ file });
  });

  // Update file (content, name, language, pin)
  app.patch('/api/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.message } });
    const file = updateFile(id, req.auth!.userId, parsed.data);
    if (!file) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    return reply.send({ file });
  });

  // Export / download raw content
  app.get('/api/files/:id/export', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = getFileById(id, req.auth!.userId);
    if (!file) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    // Derive a safe filename
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_');
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${safeName}"`);
    return reply.send(file.content);
  });

  // Upload a file (multipart — raw text files only for now)
  // Accepts: Content-Type: text/plain, sends raw body as content
  app.post('/api/files/upload', { preHandler: requireAuth }, async (req, reply) => {
    const name = (req.headers['x-file-name'] as string) ?? 'uploaded-file.txt';
    const language = (req.headers['x-file-language'] as string) ?? 'plaintext';
    const content = typeof req.body === 'string' ? req.body : '';
    if (content.length > 500_000) {
      return reply.code(413).send({ error: { code: 'TOO_LARGE', message: 'File exceeds 500KB limit' } });
    }
    const file = createFile(req.auth!.userId, { name, language, content });
    logger.info({ userId: req.auth!.userId, fileId: file.id }, 'file.uploaded');
    return reply.code(201).send({ file });
  });

  // Soft delete
  app.delete('/api/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = softDeleteFile(id, req.auth!.userId);
    if (!ok) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    return reply.send({ ok: true });
  });
}
