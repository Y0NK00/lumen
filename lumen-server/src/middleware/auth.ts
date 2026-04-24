import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken } from '../lib/token.js';
import { getSession } from '../db/repos/sessions.js';
import { logger } from '../lib/logger.js';

/**
 * Middleware: Validates the JWT on incoming requests and attaches request.auth.
 * Returns 401 if missing, invalid, expired, or revoked.
 *
 * Apply globally via `fastify.addHook('preHandler', requireAuth)` with an
 * exempt list for /api/auth/login, /api/auth/refresh, /api/health.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
  }
  const token = header.slice(7);

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    logger.debug({ err }, 'token verify failed');
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }

  // Check revocation
  const session = getSession(payload.jti);
  if (!session || session.revokedAt) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Session revoked' } });
  }

  req.auth = { userId: payload.sub, role: payload.role, jti: payload.jti };
}

/**
 * Middleware: Requires admin role. Apply AFTER requireAuth.
 */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (req.auth?.role !== 'admin') {
    return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
  }
}
