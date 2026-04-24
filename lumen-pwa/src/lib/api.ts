// Typed fetch client — thin wrapper that injects the JWT and handles errors.
// All API calls go through here so auth is handled in one place.

const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function getToken(): string | null {
  return localStorage.getItem('lumen_token')
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? res.statusText
    )
  }
  return res
}

export async function apiJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  displayName: string | null
  role: 'admin' | 'user'
  createdAt: string
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  return apiJSON('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
}

// ── Conversations ─────────────────────────────────────────────────────────────

export interface ConversationSummary {
  id: string
  title: string
  model: string
  systemPrompt: string | null
  createdAt: string
  updatedAt: string
  lastMessageAt: string | null
  messageCount: number
  totalCostUsd: number
}

export interface ServerMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: Array<{ type: string; text?: string }>
  finishReason: string | null
  createdAt: string
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const data = await apiJSON<{ items: ConversationSummary[] }>('/api/conversations')
  return data.items
}

export async function createConversation(opts?: {
  title?: string
  model?: string
  systemPrompt?: string
}): Promise<ConversationSummary> {
  const data = await apiJSON<{ conversation: ConversationSummary }>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(opts ?? {}),
  })
  return data.conversation
}

export async function getConversation(id: string): Promise<{
  conversation: ConversationSummary
  messages: ServerMessage[]
}> {
  return apiJSON(`/api/conversations/${id}`)
}

export async function updateConversation(id: string, patch: {
  title?: string
  model?: string
  systemPrompt?: string | null
}): Promise<ConversationSummary> {
  const data = await apiJSON<{ conversation: ConversationSummary }>(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return data.conversation
}

export async function deleteConversation(id: string): Promise<void> {
  await apiFetch(`/api/conversations/${id}`, { method: 'DELETE' })
}

export async function abortConversation(id: string): Promise<void> {
  await apiFetch(`/api/conversations/${id}/abort`, { method: 'POST' }).catch(() => {})
}
