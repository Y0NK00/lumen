import { db } from '../connection.js';
import { nanoid } from 'nanoid';

export interface ScheduledTask {
  id: string;
  userId: string;
  name: string;
  cronExpr: string;
  prompt: string;
  model: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  user_id: string;
  name: string;
  cron_expr: string;
  prompt: string;
  model: string | null;
  enabled: number;
  last_run_at: string | null;
  last_status: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: Row): ScheduledTask {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    cronExpr: row.cron_expr,
    prompt: row.prompt,
    model: row.model,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listScheduledTasks(userId: string): ScheduledTask[] {
  const rows = db
    .prepare(`SELECT * FROM scheduled_tasks WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as Row[];
  return rows.map(rowToTask);
}

export function createScheduledTask(
  userId: string,
  input: { name: string; cronExpr: string; prompt: string; model?: string | null; enabled?: boolean }
): ScheduledTask {
  const id = `t_${nanoid(16)}`;
  db.prepare(
    `INSERT INTO scheduled_tasks (id, user_id, name, cron_expr, prompt, model, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    input.name,
    input.cronExpr,
    input.prompt,
    input.model ?? null,
    input.enabled === false ? 0 : 1
  );
  return getScheduledTaskById(id, userId)!;
}

export function getScheduledTaskById(id: string, userId: string): ScheduledTask | null {
  const row = db
    .prepare(`SELECT * FROM scheduled_tasks WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Row | undefined;
  return row ? rowToTask(row) : null;
}

export function updateScheduledTask(
  id: string,
  userId: string,
  input: {
    name?: string;
    cronExpr?: string;
    prompt?: string;
    model?: string | null;
    enabled?: boolean;
    lastRunAt?: string | null;
    lastStatus?: string | null;
  }
): ScheduledTask | null {
  const fields: string[] = [`updated_at = datetime('now')`];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    fields.push('name = ?');
    params.push(input.name);
  }
  if (input.cronExpr !== undefined) {
    fields.push('cron_expr = ?');
    params.push(input.cronExpr);
  }
  if (input.prompt !== undefined) {
    fields.push('prompt = ?');
    params.push(input.prompt);
  }
  if ('model' in input) {
    fields.push('model = ?');
    params.push(input.model ?? null);
  }
  if (input.enabled !== undefined) {
    fields.push('enabled = ?');
    params.push(input.enabled ? 1 : 0);
  }
  if ('lastRunAt' in input) {
    fields.push('last_run_at = ?');
    params.push(input.lastRunAt ?? null);
  }
  if ('lastStatus' in input) {
    fields.push('last_status = ?');
    params.push(input.lastStatus ?? null);
  }
  params.push(id, userId);
  db.prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  return getScheduledTaskById(id, userId);
}

export function deleteScheduledTask(id: string, userId: string): boolean {
  const r = db.prepare(`DELETE FROM scheduled_tasks WHERE id = ? AND user_id = ?`).run(id, userId);
  return r.changes > 0;
}
