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

function getGithubConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectBase = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 7747}`;

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${redirectBase}/api/oauth/github/callback`,
  };
}

/** Google consent: profile + Calendar + Drive (read-only) + offline refresh. */
const GOOGLE_OAUTH_SCOPE =
  'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.readonly';

/** GitHub OAuth App — repo + user read for connectors / Code tools. */
const GITHUB_OAUTH_SCOPE = 'read:user user:email repo';

// In-memory OAuth state — single-instance homelab server.
type PendingOAuth =
  | { userId: string; expiresAt: number; flow: 'google'; codeVerifier: string }
  | { userId: string; expiresAt: number; flow: 'github' };

const pendingStates = new Map<string, PendingOAuth>();

function cleanExpiredStates() {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (val.expiresAt < now) pendingStates.delete(key);
  }
}

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

const oauthProviderParam = z.enum(['google', 'github']);

// ── Routes ────────────────────────────────────────────────────────────────────

export async function oauthRoutes(app: FastifyInstance) {
  // ── Aggregated connector list (UI) ─────────────────────────────────────────
  app.get('/api/oauth/connectors', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.auth!.userId;

    const googleRow = db
      .prepare(`SELECT scope FROM oauth_tokens WHERE user_id = ? AND provider = 'google'`)
      .get(userId) as { scope: string } | undefined;

    const githubRow = db
      .prepare(`SELECT scope FROM oauth_tokens WHERE user_id = ? AND provider = 'github'`)
      .get(userId) as { scope: string } | undefined;

    return reply.send({
      items: [
        {
          id: 'google' as const,
          name: 'Google',
          description: 'Drive (read-only), Gmail, Calendar',
          configured: !!getGoogleConfig(),
          connected: !!googleRow,
          scope: googleRow?.scope ?? null,
        },
        {
          id: 'github' as const,
          name: 'GitHub',
          description: 'Repositories and profile for tools & Code',
          configured: !!getGithubConfig(),
          connected: !!githubRow,
          scope: githubRow?.scope ?? null,
        },
      ],
    });
  });

  // GET /api/oauth/google/start
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
      expiresAt: Date.now() + 10 * 60 * 1000,
      flow: 'google',
      codeVerifier: verifier,
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return reply.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // GET /api/oauth/google/callback
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
    if (!pending || pending.expiresAt < Date.now() || pending.flow !== 'google') {
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=state_expired`);
    }
    pendingStates.delete(state);

    const config = getGoogleConfig();
    if (!config) {
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=not_configured`);
    }

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

      tokenData = (await tokenRes.json()) as typeof tokenData;
    } catch (err) {
      logger.error({ err }, 'oauth.google.token_exchange_error');
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=network_error`);
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

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

  // GET /api/oauth/github/start
  app.get('/api/oauth/github/start', { preHandler: requireAuth }, async (req, reply) => {
    const config = getGithubConfig();
    if (!config) {
      return reply.code(501).send({
        error: { code: 'NOT_CONFIGURED', message: 'GitHub OAuth is not configured on this server' },
      });
    }

    cleanExpiredStates();
    const state = nanoid(24);
    pendingStates.set(state, {
      userId: req.auth!.userId,
      expiresAt: Date.now() + 10 * 60 * 1000,
      flow: 'github',
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: GITHUB_OAUTH_SCOPE,
      state,
      allow_signup: 'true',
    });

    return reply.redirect(302, `https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  // GET /api/oauth/github/callback
  app.get('/api/oauth/github/callback', async (req, reply) => {
    const q = callbackQuery.safeParse(req.query);
    const frontendBase = process.env.FRONTEND_URL ?? process.env.PUBLIC_URL ?? 'http://localhost:3000';

    if (!q.success || q.data.error) {
      logger.warn({ error: q.data?.error }, 'oauth.github.callback.denied');
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=${encodeURIComponent(q.data?.error ?? 'unknown')}`);
    }

    const { code, state } = q.data;
    if (!code || !state) {
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=missing_params`);
    }

    cleanExpiredStates();
    const pending = pendingStates.get(state);
    if (!pending || pending.expiresAt < Date.now() || pending.flow !== 'github') {
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=state_expired`);
    }
    pendingStates.delete(state);

    const config = getGithubConfig();
    if (!config) {
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=not_configured`);
    }

    let accessToken: string;
    let scope: string;

    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.redirectUri,
        }).toString(),
      });

      const body = (await tokenRes.json()) as {
        access_token?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      };

      if (!tokenRes.ok || !body.access_token) {
        logger.error({ status: tokenRes.status, body }, 'oauth.github.token_exchange_failed');
        return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=token_exchange_failed`);
      }

      accessToken = body.access_token;
      scope = body.scope ?? GITHUB_OAUTH_SCOPE;
    } catch (err) {
      logger.error({ err }, 'oauth.github.token_exchange_error');
      return reply.redirect(302, `${frontendBase}/settings?oauth=error&reason=network_error`);
    }

    // GitHub user tokens from this flow typically do not expire; store open-ended refresh as null.
    db.prepare(
      `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, scope, expires_at)
       VALUES (?, ?, 'github', ?, NULL, ?, NULL)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         access_token  = excluded.access_token,
         scope         = excluded.scope,
         updated_at    = datetime('now')`
    ).run(`ot_${nanoid(16)}`, pending.userId, accessToken, scope);

    logger.info({ userId: pending.userId }, 'oauth.github.connected');
    return reply.redirect(302, `${frontendBase}/settings?oauth=success`);
  });

  // GET /api/oauth/google/status  (legacy — prefer /api/oauth/connectors)
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

  // DELETE /api/oauth/:provider
  app.delete('/api/oauth/:provider', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = oauthProviderParam.safeParse((req.params as { provider?: string }).provider);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_PROVIDER', message: 'Use google or github' },
      });
    }

    const result = db
      .prepare(`DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?`)
      .run(req.auth!.userId, parsed.data);

    logger.info({ userId: req.auth!.userId, provider: parsed.data }, 'oauth.disconnected');
    return reply.send({ ok: true, removed: result.changes > 0 });
  });
}
