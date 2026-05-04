import { db } from '../connection.js';
import { nanoid } from 'nanoid';

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  pinned: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToProject(row: Row): Project {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProjects(userId: string): Project[] {
  const rows = db
    .prepare(
      `SELECT * FROM projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC`
    )
    .all(userId) as Row[];
  return rows.map(rowToProject);
}

export function createProject(
  userId: string,
  input: { name: string; description?: string | null; systemPrompt?: string | null }
): Project {
  const id = `p_${nanoid(16)}`;
  db.prepare(
    `INSERT INTO projects (id, user_id, name, description, system_prompt)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, input.name, input.description ?? null, input.systemPrompt ?? null);
  return getProjectById(id, userId)!;
}

export function getProjectById(id: string, userId: string): Project | null {
  const row = db
    .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .get(id, userId) as Row | undefined;
  return row ? rowToProject(row) : null;
}

export function updateProject(
  id: string,
  userId: string,
  input: { name?: string; description?: string | null; systemPrompt?: string | null; pinned?: boolean }
): Project | null {
  const fields: string[] = [`updated_at = datetime('now')`];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    fields.push('name = ?');
    params.push(input.name);
  }
  if ('description' in input) {
    fields.push('description = ?');
    params.push(input.description ?? null);
  }
  if ('systemPrompt' in input) {
    fields.push('system_prompt = ?');
    params.push(input.systemPrompt ?? null);
  }
  if (input.pinned !== undefined) {
    fields.push('pinned = ?');
    params.push(input.pinned ? 1 : 0);
  }
  params.push(id, userId);
  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).run(
    ...params
  );
  return getProjectById(id, userId);
}

export function softDeleteProject(id: string, userId: string): boolean {
  const r = db
    .prepare(`UPDATE projects SET deleted_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .run(id, userId);
  return r.changes > 0;
}
