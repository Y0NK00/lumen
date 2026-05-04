import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { getUserByEmail, getUserById } from '../db/repos/users.js';
import { createSession, revokeSession } from '../db/repos/sessions.js';
import { verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/token.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Invalid credentials shape' } });
    }
    const { email, password } = parsed.data;

    const user = getUserByEmail(email.toLowerCase());
    if (!user || user.disabled) {
      // TODO: write audit_log event 'auth.login_failed'
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    const { token, jti, expiresAt } = signToken({ userId: user.id, role: user.role });
    createSession({
      jti,
      userId: user.id,
      expiresAt,
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip,
    });

    logger.info({ userId: user.id }, 'auth.login');
    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    // At this point req.auth is set by requireAuth
    return reply.send({ auth: req.auth });
  });

  const updateMeBody = z.object({
    displayName: z.string().min(1).max(100).optional(),
  });

  app.patch('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = updateMeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Invalid request' } });
    }
    const { displayName } = parsed.data;
    if (displayName !== undefined) {
      db.prepare(`UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(displayName, req.auth!.userId);
    }
    const user = getUserById(req.auth!.userId);
    logger.info({ userId: req.auth!.userId }, 'auth.update_profile');
    return reply.send({ user });
  });

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    if (req.auth) {
      revokeSession(req.auth.jti);
      logger.info({ userId: req.auth.userId }, 'auth.logout');
    }
    return reply.send({ ok: true });
  });
}
