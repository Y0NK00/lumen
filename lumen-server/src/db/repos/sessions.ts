import { db } from '../connection.js';

interface SessionRow {
  jti: string;
  user_id: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  user_agent: string | null;
  ip_address: string | null;
}

export interface Session {
  jti: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export function createSession(params: {
  jti: string;
  userId: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}): void {
  db.prepare(
    `INSERT INTO sessions (jti, user_id, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    params.jti,
    params.userId,
    params.expiresAt.toISOString(),
    params.userAgent ?? null,
    params.ipAddress ?? null
  );
}

export function getSession(jti: string): Session | null {
  const row = db.prepare('SELECT * FROM sessions WHERE jti = ?').get(jti) as SessionRow | undefined;
  if (!row) return null;
  return {
    jti: row.jti,
    userId: row.user_id,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export function revokeSession(jti: string): void {
  db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE jti = ?`).run(jti);
}
