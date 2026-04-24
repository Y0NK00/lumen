import { db } from '../connection.js';
import { nanoid } from 'nanoid';
import type { Conversation } from '../../types/index.js';

interface ConversationRow {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  model: string;
  system_prompt: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  deleted_at: string | null;
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    title: row.title,
    model: row.model,
    systemPrompt: row.system_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

export interface ListConversationsOptions {
  userId: string;
  limit?: number;
  cursor?: string;
  projectId?: string | null;
}

export function listConversations(opts: ListConversationsOptions): Conversation[] {
  const limit = Math.min(opts.limit ?? 50, 200);
  const params: unknown[] = [opts.userId];
  let sql = `SELECT * FROM conversations WHERE user_id = ? AND deleted_at IS NULL`;

  if (opts.projectId) {
    sql += ` AND project_id = ?`;
    params.push(opts.projectId);
  }
  if (opts.cursor) {
    // cursor is a conversation id; page after its last_message_at
    sql += ` AND (last_message_at < (SELECT last_message_at FROM conversations WHERE id = ?)
               OR (last_message_at IS NULL AND created_at < (SELECT created_at FROM conversations WHERE id = ?)))`;
    params.push(opts.cursor, opts.cursor);
  }

  sql += ` ORDER BY last_message_at DESC, created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as ConversationRow[];
  return rows.map(rowToConversation);
}

export interface CreateConversationInput {
  userId: string;
  title?: string;
  projectId?: string | null;
  model?: string;
  systemPrompt?: string | null;
}

export function createConversation(input: CreateConversationInput): Conversation {
  const id = `c_${nanoid(16)}`;
  db.prepare(
    `INSERT INTO conversations (id, user_id, project_id, title, model, system_prompt)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.projectId ?? null,
    input.title ?? 'New chat',
    input.model ?? 'claude-sonnet-4-6',
    input.systemPrompt ?? null
  );
  return getConversationById(id, input.userId)!;
}

export function getConversationById(id: string, userId: string): Conversation | null {
  const row = db
    .prepare(`SELECT * FROM conversations WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .get(id, userId) as ConversationRow | undefined;
  return row ? rowToConversation(row) : null;
}

export interface UpdateConversationInput {
  title?: string;
  model?: string;
  systemPrompt?: string | null;
  projectId?: string | null;
  lastMessageAt?: string;
}

export function updateConversation(
  id: string,
  userId: string,
  input: UpdateConversationInput
): Conversation | null {
  const fields: string[] = [`updated_at = datetime('now')`];
  const params: unknown[] = [];

  if (input.title !== undefined) { fields.push('title = ?'); params.push(input.title); }
  if (input.model !== undefined) { fields.push('model = ?'); params.push(input.model); }
  if ('systemPrompt' in input) { fields.push('system_prompt = ?'); params.push(input.systemPrompt ?? null); }
  if ('projectId' in input) { fields.push('project_id = ?'); params.push(input.projectId ?? null); }
  if (input.lastMessageAt !== undefined) { fields.push('last_message_at = ?'); params.push(input.lastMessageAt); }

  params.push(id, userId);
  db.prepare(
    `UPDATE conversations SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
  ).run(...params);

  return getConversationById(id, userId);
}

export function softDeleteConversation(id: string, userId: string): boolean {
  const result = db
    .prepare(
      `UPDATE conversations SET deleted_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    )
    .run(id, userId);
  return result.changes > 0;
}

export function getConversationMessageCount(conversationId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ?`)
    .get(conversationId) as { c: number };
  return row.c;
}

export function getConversationCostUsd(conversationId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM usage_events WHERE conversation_id = ?`
    )
    .get(conversationId) as { total: number };
  return row.total;
}
