import { db } from '../connection.js';
import { nanoid } from 'nanoid';

export interface Artifact {
  id: string;
  userId: string;
  title: string;
  body: string;
  kind: string;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  user_id: string;
  title: string;
  body: string;
  kind: string;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToArtifact(row: Row): Artifact {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listArtifacts(userId: string): Artifact[] {
  const rows = db
    .prepare(
      `SELECT * FROM artifacts WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`
    )
    .all(userId) as Row[];
  return rows.map(rowToArtifact);
}

export function createArtifact(
  userId: string,
  input: { title: string; body?: string; kind?: string; conversationId?: string | null }
): Artifact {
  const id = `a_${nanoid(16)}`;
  db.prepare(
    `INSERT INTO artifacts (id, user_id, title, body, kind, conversation_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    input.title,
    input.body ?? '',
    input.kind ?? 'note',
    input.conversationId ?? null
  );
  return getArtifactById(id, userId)!;
}

export function getArtifactById(id: string, userId: string): Artifact | null {
  const row = db
    .prepare(`SELECT * FROM artifacts WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .get(id, userId) as Row | undefined;
  return row ? rowToArtifact(row) : null;
}

export function updateArtifact(
  id: string,
  userId: string,
  input: { title?: string; body?: string; kind?: string; conversationId?: string | null }
): Artifact | null {
  const fields: string[] = [`updated_at = datetime('now')`];
  const params: unknown[] = [];
  if (input.title !== undefined) {
    fields.push('title = ?');
    params.push(input.title);
  }
  if (input.body !== undefined) {
    fields.push('body = ?');
    params.push(input.body);
  }
  if (input.kind !== undefined) {
    fields.push('kind = ?');
    params.push(input.kind);
  }
  if ('conversationId' in input) {
    fields.push('conversation_id = ?');
    params.push(input.conversationId ?? null);
  }
  params.push(id, userId);
  db.prepare(`UPDATE artifacts SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).run(
    ...params
  );
  return getArtifactById(id, userId);
}

export function softDeleteArtifact(id: string, userId: string): boolean {
  const r = db
    .prepare(`UPDATE artifacts SET deleted_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .run(id, userId);
  return r.changes > 0;
}
