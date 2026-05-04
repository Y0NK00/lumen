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

export async function updateProfile(patch: { displayName?: string }): Promise<void> {
  await apiJSON('/api/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

// ── Conversations ─────────────────────────────────────────────────────────────

export type ApiWorkspace = 'chat' | 'cowork' | 'code'

export interface ConversationSummary {
  id: string
  title: string
  model: string
  systemPrompt: string | null
  workspace?: ApiWorkspace
  projectId?: string | null
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

export async function listConversations(params?: {
  workspace?: ApiWorkspace
}): Promise<ConversationSummary[]> {
  const q =
    params?.workspace != null
      ? `?workspace=${encodeURIComponent(params.workspace)}`
      : ''
  const data = await apiJSON<{ items: ConversationSummary[] }>(`/api/conversations${q}`)
  return data.items
}

function normalizeConversationWorkspace(c: ConversationSummary): ApiWorkspace {
  const w = c.workspace
  return w === 'cowork' || w === 'code' ? w : 'chat'
}

/** Uses workspace filter when supported; falls back to unfiltered list if the server has no workspace column yet. Never throws for “old” servers. */
export async function listConversationsForWorkspace(
  workspace: ApiWorkspace,
): Promise<ConversationSummary[]> {
  try {
    return await listConversations({ workspace })
  } catch (e) {
    console.warn('[lumen] listConversations(workspace) failed, retrying without filter:', e)
    const all = await listConversations()
    return all.filter((c) => normalizeConversationWorkspace(c) === workspace)
  }
}

export async function createConversation(opts?: {
  title?: string
  model?: string
  systemPrompt?: string
  workspace?: ApiWorkspace
  projectId?: string | null
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
  projectId?: string | null
  workspace?: ApiWorkspace
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

// ── Memory ────────────────────────────────────────────────────────────────────

export interface Memory {
  id: string
  userId: string
  content: string
  source: string
  createdAt: string
}

export async function listMemories(): Promise<Memory[]> {
  const data = await apiJSON<{ memories: Memory[] }>('/api/memory')
  return data.memories
}

export async function createMemory(content: string): Promise<Memory> {
  const data = await apiJSON<{ memory: Memory }>('/api/memory', {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
  return data.memory
}

export async function deleteMemory(id: string): Promise<void> {
  await apiFetch(`/api/memory/${id}`, { method: 'DELETE' })
}

// ── OAuth / connectors ──────────────────────────────────────────────────────

export type OAuthConnectorId = 'google' | 'github'

export interface OAuthConnectorInfo {
  id: OAuthConnectorId
  name: string
  description: string
  /** Server has client id/secret configured */
  configured: boolean
  connected: boolean
  scope: string | null
}

export async function listOAuthConnectors(): Promise<{ items: OAuthConnectorInfo[] }> {
  return apiJSON('/api/oauth/connectors')
}

/** Opens provider consent in the same tab (302 from server). Sends JWT — use this instead of a plain anchor. */
export async function oauthStartRedirect(provider: OAuthConnectorId): Promise<void> {
  const token = getToken()
  const res = await fetch(`${BASE}/api/oauth/${provider}/start`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    redirect: 'manual',
  })
  if (res.status === 301 || res.status === 302) {
    const loc = res.headers.get('Location')
    if (loc) {
      window.location.assign(loc)
      return
    }
  }
  if (res.status === 501) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(
      501,
      (body as { error?: { code?: string } })?.error?.code ?? 'NOT_CONFIGURED',
      (body as { error?: { message?: string } })?.error?.message ?? 'OAuth not configured on server'
    )
  }
  const body = await res.json().catch(() => ({}))
  throw new ApiError(
    res.status,
    (body as { error?: { code?: string } })?.error?.code ?? 'UNKNOWN',
    (body as { error?: { message?: string } })?.error?.message ?? res.statusText
  )
}

/** @deprecated Prefer listOAuthConnectors */
export async function getOAuthStatus(): Promise<{ connected: boolean; scope?: string; expiresAt?: string }> {
  return apiJSON('/api/oauth/google/status')
}

export async function disconnectOAuthProvider(provider: OAuthConnectorId): Promise<void> {
  await apiFetch(`/api/oauth/${provider}`, { method: 'DELETE' })
}

/** Disconnect Google only (legacy). */
export async function disconnectOAuth(): Promise<void> {
  await disconnectOAuthProvider('google')
}

// ── Projects (folders / Helms) ───────────────────────────────────────────────

export interface Project {
  id: string
  userId: string
  name: string
  description: string | null
  systemPrompt: string | null
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export async function listProjects(): Promise<Project[]> {
  const data = await apiJSON<{ items: Project[] }>('/api/projects')
  return data.items
}

export async function createProject(body: {
  name: string
  description?: string | null
  systemPrompt?: string | null
}): Promise<Project> {
  const data = await apiJSON<{ project: Project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return data.project
}

export async function updateProject(
  id: string,
  patch: Partial<{ name: string; description: string | null; systemPrompt: string | null; pinned: boolean }>
): Promise<Project> {
  const data = await apiJSON<{ project: Project }>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return data.project
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
}

// ── Artifacts ─────────────────────────────────────────────────────────────────

export interface Artifact {
  id: string
  userId: string
  title: string
  body: string
  kind: string
  conversationId: string | null
  createdAt: string
  updatedAt: string
}

export async function listArtifacts(): Promise<Artifact[]> {
  const data = await apiJSON<{ items: Artifact[] }>('/api/artifacts')
  return data.items
}

export async function createArtifact(body: {
  title: string
  body?: string
  kind?: string
  conversationId?: string | null
}): Promise<Artifact> {
  const data = await apiJSON<{ artifact: Artifact }>('/api/artifacts', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return data.artifact
}

export async function updateArtifact(
  id: string,
  patch: Partial<{ title: string; body: string; kind: string; conversationId: string | null }>
): Promise<Artifact> {
  const data = await apiJSON<{ artifact: Artifact }>(`/api/artifacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return data.artifact
}

export async function deleteArtifact(id: string): Promise<void> {
  await apiFetch(`/api/artifacts/${id}`, { method: 'DELETE' })
}

// ── Scheduled tasks (Dispatch / phone triggers) ─────────────────────────────

export interface ScheduledTask {
  id: string
  userId: string
  name: string
  cronExpr: string
  prompt: string
  model: string | null
  enabled: boolean
  lastRunAt: string | null
  lastStatus: string | null
  createdAt: string
  updatedAt: string
}

export async function listScheduledTasks(): Promise<ScheduledTask[]> {
  const data = await apiJSON<{ items: ScheduledTask[] }>('/api/scheduled-tasks')
  return data.items
}

export async function createScheduledTask(body: {
  name: string
  cronExpr: string
  prompt: string
  model?: string | null
  enabled?: boolean
}): Promise<ScheduledTask> {
  const data = await apiJSON<{ task: ScheduledTask }>('/api/scheduled-tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return data.task
}

export async function updateScheduledTask(
  id: string,
  patch: Partial<{
    name: string
    cronExpr: string
    prompt: string
    model: string | null
    enabled: boolean
  }>
): Promise<ScheduledTask> {
  const data = await apiJSON<{ task: ScheduledTask }>(`/api/scheduled-tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return data.task
}

export async function deleteScheduledTask(id: string): Promise<void> {
  await apiFetch(`/api/scheduled-tasks/${id}`, { method: 'DELETE' })
}
