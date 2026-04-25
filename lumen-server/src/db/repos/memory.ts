import { db } from '../connection.js';
import { nanoid } from 'nanoid';

export interface Memory {
  id: string;
  userId: string;
  content: string;
  source: string;
  createdAt: string;
}

interface MemoryRow {
  id: string;
  user_id: string;
  content: string;
  source: string;
  created_at: string;
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    source: row.source,
    createdAt: row.created_at,
  };
}

export function listMemories(userId: string): Memory[] {
  const rows = db
    .prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as MemoryRow[];
  return rows.map(rowToMemory);
}

export function createMemory(userId: string, content: string, source = 'manual'): Memory {
  const id = `mem_${nanoid(16)}`;
  db.prepare(
    `INSERT INTO memories (id, user_id, content, source) VALUES (?, ?, ?, ?)`
  ).run(id, userId, content.trim(), source);
  return rowToMemory(
    db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as MemoryRow
  );
}

export function deleteMemory(id: string, userId: string): boolean {
  const result = db
    .prepare(`DELETE FROM memories WHERE id = ? AND user_id = ?`)
    .run(id, userId);
  return result.changes > 0;
}
