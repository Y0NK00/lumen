import { nanoid } from 'nanoid';
import { db } from '../connection.js';

export interface LumenFile {
  id: string;
  userId: string;
  projectId: string | null;
  conversationId: string | null;
  name: string;
  language: string;
  content: string;
  sizeBytes: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

// List all files for user (no content — for sidebar listing)
export interface LumenFileStub {
  id: string;
  userId: string;
  projectId: string | null;
  conversationId: string | null;
  name: string;
  language: string;
  sizeBytes: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FileRow {
  id: string;
  user_id: string;
  project_id: string | null;
  conversation_id: string | null;
  name: string;
  language: string;
  content: string;
  size_bytes: number;
  pinned: number;
  created_at: string;
  updated_at: string;
}

interface FileStubRow {
  id: string;
  user_id: string;
  project_id: string | null;
  conversation_id: string | null;
  name: string;
  language: string;
  size_bytes: number;
  pinned: number;
  created_at: string;
  updated_at: string;
}

function rowToFile(row: FileRow): LumenFile {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    name: row.name,
    language: row.language,
    content: row.content,
    sizeBytes: row.size_bytes,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFileStub(row: FileStubRow): LumenFileStub {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    name: row.name,
    language: row.language,
    sizeBytes: row.size_bytes,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listFiles(userId: string, opts?: { projectId?: string; conversationId?: string }): LumenFileStub[] {
  const where: string[] = ['user_id = ?', 'deleted_at IS NULL'];
  const params: unknown[] = [userId];

  if (opts?.projectId !== undefined) {
    where.push('project_id = ?');
    params.push(opts.projectId);
  }

  if (opts?.conversationId !== undefined) {
    where.push('conversation_id = ?');
    params.push(opts.conversationId);
  }

  const rows = db
    .prepare(
      `SELECT id, user_id, project_id, conversation_id, name, language, size_bytes, pinned, created_at, updated_at
       FROM files
       WHERE ${where.join(' AND ')}
       ORDER BY pinned DESC, updated_at DESC`
    )
    .all(...params) as FileStubRow[];

  return rows.map(rowToFileStub);
}

export function getFileById(id: string, userId: string): LumenFile | null {
  const row = db
    .prepare(
      `SELECT id, user_id, project_id, conversation_id, name, language, content, size_bytes, pinned, created_at, updated_at
       FROM files
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    )
    .get(id, userId) as FileRow | undefined;

  return row ? rowToFile(row) : null;
}

export function createFile(
  userId: string,
  input: {
    name: string;
    language?: string;
    content?: string;
    projectId?: string | null;
    conversationId?: string | null;
  }
): LumenFile {
  const id = `f_${nanoid(16)}`;
  const content = input.content ?? '';
  const sizeBytes = Buffer.byteLength(content, 'utf8');

  db.prepare(
    `INSERT INTO files (id, user_id, project_id, conversation_id, name, language, content, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    input.projectId ?? null,
    input.conversationId ?? null,
    input.name,
    input.language ?? 'markdown',
    content,
    sizeBytes
  );

  return getFileById(id, userId)!;
}

export function updateFile(
  id: string,
  userId: string,
  input: {
    name?: string;
    language?: string;
    content?: string;
    projectId?: string | null;
    pinned?: boolean;
  }
): LumenFile | null {
  const fields: string[] = [`updated_at = datetime('now')`];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    fields.push('name = ?');
    params.push(input.name);
  }

  if (input.language !== undefined) {
    fields.push('language = ?');
    params.push(input.language);
  }

  if (input.content !== undefined) {
    fields.push('content = ?');
    params.push(input.content);
    fields.push('size_bytes = ?');
    params.push(Buffer.byteLength(input.content, 'utf8'));
  }

  if ('projectId' in input) {
    fields.push('project_id = ?');
    params.push(input.projectId ?? null);
  }

  if (input.pinned !== undefined) {
    fields.push('pinned = ?');
    params.push(input.pinned ? 1 : 0);
  }

  params.push(id, userId);
  db.prepare(`UPDATE files SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).run(...params);

  return getFileById(id, userId);
}

export function softDeleteFile(id: string, userId: string): boolean {
  const result = db
    .prepare(`UPDATE files SET deleted_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .run(id, userId);
  return result.changes > 0;
}
