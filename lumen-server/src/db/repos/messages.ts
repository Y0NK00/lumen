import { db } from '../connection.js';
import { nanoid } from 'nanoid';

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'image';
  [key: string]: unknown;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content_json: string;
  finish_reason: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: ContentBlock[];
  finishReason: string | null;
  createdAt: string;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    role: row.role as Message['role'],
    content: JSON.parse(row.content_json),
    finishReason: row.finish_reason,
    createdAt: row.created_at,
  };
}

export function getMessages(conversationId: string, userId: string): Message[] {
  const rows = db
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ? AND user_id = ?
       ORDER BY created_at ASC`
    )
    .all(conversationId, userId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getMessageById(id: string): Message | null {
  const row = db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(id) as MessageRow | undefined;
  return row ? rowToMessage(row) : null;
}

export interface CreateMessageInput {
  conversationId: string;
  userId: string;
  role: Message['role'];
  content: ContentBlock[];
  finishReason?: string | null;
}

export function createMessage(input: CreateMessageInput): Message {
  const id = `m_${nanoid(16)}`;
  db.prepare(
    `INSERT INTO messages (id, conversation_id, user_id, role, content_json, finish_reason)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.conversationId,
    input.userId,
    input.role,
    JSON.stringify(input.content),
    input.finishReason ?? null
  );
  return getMessageById(id)!;
}

export function updateMessageContent(
  id: string,
  content: ContentBlock[],
  finishReason: string
): void {
  db.prepare(
    `UPDATE messages SET content_json = ?, finish_reason = ? WHERE id = ?`
  ).run(JSON.stringify(content), finishReason, id);
}
