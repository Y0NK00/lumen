import { db } from '../connection.js';
import { nanoid } from 'nanoid';
import { hashPassword } from '../../lib/password.js';
import type { User, UserWithPassword, UserRole } from '../../types/index.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: UserRole;
  monthly_budget_usd: number;
  budget_alert_threshold: number;
  disabled: number;
  settings_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    monthlyBudgetUsd: row.monthly_budget_usd,
    budgetAlertThreshold: row.budget_alert_threshold,
    disabled: row.disabled === 1,
    settings: JSON.parse(row.settings_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToUserWithPassword(row: UserRow): UserWithPassword {
  return { ...rowToUser(row), passwordHash: row.password_hash };
}

export function getUserById(id: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getUserByEmail(email: string): UserWithPassword | null {
  const row = db.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').get(email) as UserRow | undefined;
  return row ? rowToUserWithPassword(row) : null;
}

export function countUsers(): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL').get() as { c: number };
  return row.c;
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  role?: UserRole;
  monthlyBudgetUsd?: number;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const id = `u_${nanoid(16)}`;
  const passwordHash = await hashPassword(input.password);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role, monthly_budget_usd)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.email.toLowerCase(),
    passwordHash,
    input.displayName,
    input.role ?? 'user',
    input.monthlyBudgetUsd ?? 25.0
  );
  const user = getUserById(id);
  if (!user) throw new Error('createUser: user not found after insert');
  return user;
}
