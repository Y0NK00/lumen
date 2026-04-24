// Shared types used across the server.

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  monthlyBudgetUsd: number;
  budgetAlertThreshold: number;
  disabled: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface AuthContext {
  userId: string;
  role: UserRole;
  jti: string;
}

export interface JwtPayload {
  sub: string;        // user id
  role: UserRole;
  jti: string;
  iat: number;
  exp: number;
}

export type Model =
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-6'
  | 'claude-haiku-4-5-20251001';

export interface UsageEvent {
  id: string;
  userId: string;
  conversationId: string | null;
  messageId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  projectId: string | null;
  title: string;
  model: string;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

// Module augmentation for Fastify request context
declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
