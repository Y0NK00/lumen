import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db/connection.js';
import { logger } from '../lib/logger.js';
import { nanoid } from 'nanoid';

// ── Config ────────────────────────────────────────────────────────────────────

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectBase = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 7747}`;

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${redirectBase}/api/oauth/google/callback`,
  };
}

// In-memory PKCE state store — maps state → { userId, codeVerifier, expiresAt }
// Good enough for a homelab single-instance server. Cleans up on each request.
const pendingStates = new Map<string, { userId: string; codeVerifier: string; expiresAt: number }>();

function cleanExpiredStates() {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (val.expiresAt < now) pendingStates.delete(key);
  }
}

// PKCE helpers (no external dep, using Node built-ins)
function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE() {
  const { randomBytes, createHash } = await import('node:crypto');
  const verifier = base64urlEncode(randomBytes(32));
  const challenge = base64urlEncode(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// ── Validators ────────────────────────────────────────────────────────────────

const callbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

export async function oauthRoutes(app: FastifyInstance) {
  // GET /api/oauth/google/start
  // Redirects the user to Google's consent screen.
  // Query param ?redirect_to= is where the frontend should land after success.
  app.get('/api/oauth/google/start', { preHandler: requireAuth }, async (req, reply) => {
    const config = getGoogleConfig();
    if (!config) {
      return reply.code(501).send({
        error: { code: 'NOT_CONFIGURED', message: 'Google OAuth is not configured on this server' },
      });
    }

    cleanExpiredStates();

    const { verifier, challenge } = await generatePKCE();
    const state = nanoid(24);

    pendingStates.set(state, {
      userId: req.auth!.userId,
      codeVerifier: verifier,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile https://www.googleapis.com/auth/calendar',
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return reply.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // GET /api/oauth/google/callback
  // Google redirects here after user consent. Exchanges code for tokens and
  // stores them in oauth_tokens. Redirects to the frontend on success/failure.
  app.get('/api/oauth/google/callback', async (req, reply) => {
    const q = callbackQuery.safeParse(req.query);
    const frontendBase = process.env.FRONTEND_URL ?? process.env.PUBLIC_URL ?? 'http://localhost:3000';

    if (!q.success || q.data.error) {
      logger.warn({ error: q.data?.error }, 'oauth.google.callback.denied');
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=${encodeURIComponent(q.data?.error ?? 'unknown')}`);
    }

    const { code, state } = q.data;
    if (!code || !state) {
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=missing_params`);
    }

    cleanExpiredStates();
    const pending = pendingStates.get(state);
    if (!pending || pending.expiresAt < Date.now()) {
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=state_expired`);
    }
    pendingStates.delete(state);

    const config = getGoogleConfig();
    if (!config) {
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=not_configured`);
    }

    // Exchange authorization code for tokens
    let tokenData: {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      token_type: string;
    };

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          code_verifier: pending.codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: config.redirectUri,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        logger.error({ status: tokenRes.status, body }, 'oauth.google.token_exchange_failed');
        return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=token_exchange_failed`);
      }

      tokenData = await tokenRes.json() as typeof tokenData;
    } catch (err) {
      logger.error({ err }, 'oauth.google.token_exchange_error');
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=network_error`);
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Upsert into oauth_tokens
    // TODO: encrypt access_token and refresh_token at rest before storing
    db.prepare(
      `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, scope, expires_at)
       VALUES (?, ?, 'google', ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         access_token  = excluded.access_token,
         refresh_token = COALESCE(excluded.refresh_token, refresh_token),
         scope         = excluded.scope,
         expires_at    = excluded.expires_at,
         updated_at    = datetime('now')`
    ).run(
      `ot_${nanoid(16)}`,
      pending.userId,
      tokenData.access_token,
      tokenData.refresh_token ?? null,
      tokenData.scope,
      expiresAt
    );

    logger.info({ userId: pending.userId }, 'oauth.google.connected');
    return reply.redirect(302, `${frontendBase}/settings?oauth=success`);
  });

  // GET /api/oauth/google/status  — is Google connected for this user?
  app.get('/api/oauth/google/status', { preHandler: requireAuth }, async (req, reply) => {
    const row = db
      .prepare(`SELECT id, scope, expires_at, updated_at FROM oauth_tokens WHERE user_id = ? AND provider = 'google'`)
      .get(req.auth!.userId) as { id: string; scope: string; expires_at: string; updated_at: string } | undefined;

    if (!row) {
      return reply.send({ connected: false });
    }

    return reply.send({
      connected: true,
      scope: row.scope,
      expiresAt: row.expires_at,
      updatedAt: row.updated_at,
    });
  });

  // DELETE /api/oauth/google  — disconnect / revoke stored tokens
  app.delete('/api/oauth/google', { preHandler: requireAuth }, async (req, reply) => {
    const result = db
      .prepare(`DELETE FROM oauth_tokens WHERE user_id = ? AND provider = 'google'`)
      .run(req.auth!.userId);

    logger.info({ userId: req.auth!.userId }, 'oauth.google.disconnected');
    return reply.send({ ok: true, removed: result.changes > 0 });
  });
}
