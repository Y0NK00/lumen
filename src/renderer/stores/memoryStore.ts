// src/renderer/stores/memoryStore.ts
// Local memory system — stores facts extracted from conversations, injects
// relevant context into Claude's system prompt, and optionally mirrors to
// the user's Obsidian vault.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemoryTag = 'fact' | 'preference' | 'project' | 'person' | 'context' | 'note'

export interface MemoryItem {
  id:        string
  content:   string          // the actual memory text
  tag:       MemoryTag
  source:    'manual' | 'generated'
  createdAt: number
  updatedAt: number
  pinned:    boolean         // pinned memories always inject
  useCount:  number          // tracks how often this was injected
}

interface MemoryStore {
  items: Record<string, MemoryItem>

  // CRUD
  addMemory:    (content: string, tag: MemoryTag, source?: 'manual' | 'generated') => string
  updateMemory: (id: string, patch: Partial<Pick<MemoryItem, 'content' | 'tag' | 'pinned'>>) => void
  deleteMemory: (id: string) => void
  pinMemory:    (id: string, pinned: boolean) => void
  clearAll:     () => void

  // Bulk import from generation (replaces/merges generated memories)
  importGenerated: (items: { content: string; tag: MemoryTag }[]) => void

  // Usage tracking (called by the injection layer)
  markUsed: (ids: string[]) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set) => ({
      items: {},

      addMemory: (content, tag, source = 'manual') => {
        const id = crypto.randomUUID()
        const now = Date.now()
        const item: MemoryItem = { id, content, tag, source, createdAt: now, updatedAt: now, pinned: false, useCount: 0 }
        set((s) => ({ items: { ...s.items, [id]: item } }))
        return id
      },

      updateMemory: (id, patch) => {
        set((s) => {
          const item = s.items[id]
          if (!item) return s
          return { items: { ...s.items, [id]: { ...item, ...patch, updatedAt: Date.now() } } }
        })
      },

      deleteMemory: (id) => {
        set((s) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [id]: _r, ...rest } = s.items
          return { items: rest }
        })
      },

      pinMemory: (id, pinned) => {
        set((s) => {
          const item = s.items[id]
          if (!item) return s
          return { items: { ...s.items, [id]: { ...item, pinned, updatedAt: Date.now() } } }
        })
      },

      clearAll: () => set({ items: {} }),

      importGenerated: (newItems) => {
        set((s) => {
          const now = Date.now()
          // Remove existing generated memories, keep manual + pinned
          const kept = Object.fromEntries(
            Object.entries(s.items).filter(([, v]) => v.source === 'manual' || v.pinned)
          )
          // Add new generated items
          const added = Object.fromEntries(
            newItems.map(({ content, tag }) => {
              const id = crypto.randomUUID()
              const item: MemoryItem = { id, content, tag, source: 'generated', createdAt: now, updatedAt: now, pinned: false, useCount: 0 }
              return [id, item]
            })
          )
          return { items: { ...kept, ...added } }
        })
      },

      markUsed: (ids) => {
        set((s) => {
          const patch = Object.fromEntries(
            ids
              .filter((id) => id in s.items)
              .map((id) => [id, { ...s.items[id], useCount: s.items[id].useCount + 1 }])
          )
          return { items: { ...s.items, ...patch } }
        })
      },
    }),
    {
      name: 'lumen-memory',
      version: 1,
    }
  )
)

// ─── Memory injection ─────────────────────────────────────────────────────────
// Called by the chat hook to prepend relevant memories to the system prompt.
// Uses simple keyword matching — fast, no API calls required at inject time.

export function buildMemoryBlock(query: string): { block: string; usedIds: string[] } {
  const items = Object.values(useMemoryStore.getState().items)
  if (items.length === 0) return { block: '', usedIds: [] }

  const lower = query.toLowerCase()
  const words = lower.split(/\s+/).filter((w) => w.length > 3)

  // Score each memory by keyword overlap + pinned boost
  const scored = items.map((item) => {
    const text = item.content.toLowerCase()
    const matchCount = words.filter((w) => text.includes(w)).length
    const score = matchCount + (item.pinned ? 10 : 0)
    return { item, score }
  })

  // Take top 8 relevant + all pinned
  const relevant = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.item)

  if (relevant.length === 0) return { block: '', usedIds: [] }

  const lines = relevant.map((m) => `- [${m.tag}] ${m.content}`)
  const block = `<memory>\n${lines.join('\n')}\n</memory>`
  return { block, usedIds: relevant.map((m) => m.id) }
}

// ─── Vault RAG injection ──────────────────────────────────────────────────────
// Searches the Obsidian vault for notes relevant to the user's query and injects
// snippets into the system prompt. Called async before Claude stream starts.
// Gated on vaultPath being set + vaultRagEnabled setting.
//
// Strategy: try semantic search (Ollama embeddings) first.
// If the index doesn't exist or Ollama is unreachable, fall back to keyword search.

export async function buildVaultBlock(query: string): Promise<string> {
  const tower = (window as any).tower
  if (!tower?.vault) return ''
  if (!query || query.length < 4) return ''

  // ── Attempt semantic search ────────────────────────────────────────────────
  try {
    // Import settingsStore lazily to avoid circular deps
    const { useSettingsStore } = await import('./settingsStore')
    const { ollamaBaseUrl, vaultEmbedModel } = useSettingsStore.getState()

    if (ollamaBaseUrl && vaultEmbedModel) {
      const { results, error } = await tower.vault.semanticSearch({
        query,
        ollamaBaseUrl,
        model: vaultEmbedModel,
        topK: 5,
      })

      if (!error && results && results.length > 0) {
        const lines = (results as Array<{ file: string; text: string; score: number }>)
          .map(({ file, text, score }) => {
            const name = file.replace(/\\/g, '/').split('/').pop() ?? file
            const clean = text.replace(/\s+/g, ' ').trim().slice(0, 400)
            return `### ${name} (relevance: ${Math.round(score * 100)}%)\n${clean}`
          })
        return `<vault_context>\nSemantically relevant notes from your Obsidian vault:\n\n${lines.join('\n\n')}\n</vault_context>`
      }
    }
  } catch {
    // Semantic search failed — fall through to keyword
  }

  // ── Keyword fallback ──────────────────────────────────────────────────────
  try {
    const { results, error } = await tower.vault.search(query)
    if (error || !results || results.length === 0) return ''

    const top = (results as Array<{ file: string; snippet: string }>).slice(0, 5)
    const lines = top.map(({ file, snippet }) => {
      const name = file.replace(/\\/g, '/').split('/').pop() ?? file
      const clean = snippet.replace(/\s+/g, ' ').trim().slice(0, 300)
      return `### ${name}\n${clean}`
    })

    return `<vault_context>\nRelevant notes from your Obsidian vault:\n\n${lines.join('\n\n')}\n</vault_context>`
  } catch {
    return ''
  }
}

// ─── Memory generation ────────────────────────────────────────────────────────
// Calls Claude Haiku with a conversation transcript to extract facts/preferences.
// Returns structured items ready to import.

export async function generateMemoriesFromConversation(
  messages: { role: string; content: string }[],
  apiKey: string,
  model = 'claude-haiku-4-5-20251001'
): Promise<{ content: string; tag: MemoryTag }[]> {
  if (!apiKey || messages.length < 2) return []

  const transcript = messages
    .slice(-20) // last 20 messages max
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const prompt = `Extract memorable facts, preferences, or context from this conversation that would be useful to remember for future conversations. Focus on: user preferences, key facts about the user or their work, project context, or important decisions made.

Output a JSON array of objects with shape: { "content": "...", "tag": "fact|preference|project|person|context|note" }

Rules:
- Only extract things worth remembering long-term
- Keep each item to 1-2 concise sentences
- Skip generic/obvious things
- Return empty array [] if nothing is worth saving
- Output ONLY valid JSON, no other text

Conversation:
${transcript}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return []
    const data = await res.json()
    const text = data.content?.[0]?.text ?? ''
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        'content' in item &&
        'tag' in item &&
        typeof (item as { content: unknown }).content === 'string'
    ) as { content: string; tag: MemoryTag }[]
  } catch {
    return []
  }
}

// ─── Vault sync ───────────────────────────────────────────────────────────────
// Writes all memories to {vaultPath}/Lumen/Memory.md for Obsidian viewing.

export async function syncMemoriesToVault(vaultPath: string): Promise<boolean> {
  if (!vaultPath) return false
  const tower = (window as any).tower
  if (!tower?.vault) return false

  const items = Object.values(useMemoryStore.getState().items)
  if (items.length === 0) return true

  const byTag: Partial<Record<MemoryTag, MemoryItem[]>> = {}
  for (const item of items) {
    if (!byTag[item.tag]) byTag[item.tag] = []
    byTag[item.tag]!.push(item)
  }

  const lines = [
    '# Lumen Memory',
    '',
    `_Last synced: ${new Date().toLocaleString()}_`,
    '',
  ]

  for (const [tag, tagItems] of Object.entries(byTag)) {
    lines.push(`## ${tag.charAt(0).toUpperCase() + tag.slice(1)}s`)
    lines.push('')
    for (const item of tagItems!) {
      lines.push(`- ${item.pinned ? '📌 ' : ''}${item.content}`)
    }
    lines.push('')
  }

  const content = lines.join('\n')
  const filePath = `${vaultPath}/Lumen/Memory.md`.replace(/\\/g, '/')
  const result = await tower.vault.writeFile(filePath, content)
  return !result.error
}

// ─── Session log writer ───────────────────────────────────────────────────────
// Writes a structured session log to {vaultPath}/Sessions/YYYY-MM-DD.md

export async function writeSessionLog(
  vaultPath: string,
  log: {
    title: string
    summary: string
    decisions: string[]
    nextSteps: string[]
    tags?: string[]
  }
): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!vaultPath) return { ok: false, error: 'No vault path configured' }
  const tower = (window as any).tower
  if (!tower?.vault) return { ok: false, error: 'Vault bridge not available' }

  const date = new Date()
  const dateStr = date.toISOString().split('T')[0]
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  const lines = [
    `# ${log.title}`,
    `**Date:** ${dateStr} at ${timeStr}`,
    log.tags?.length ? `**Tags:** ${log.tags.map((t) => `#${t}`).join(' ')}` : '',
    '',
    '## Summary',
    log.summary,
    '',
    '## Decisions Made',
    ...log.decisions.map((d) => `- ${d}`),
    '',
    '## Next Steps',
    ...log.nextSteps.map((s) => `- [ ] ${s}`),
    '',
    '---',
    `_Written by Lumen at ${timeStr}_`,
  ].filter((l) => l !== null)

  const content = lines.join('\n')
  const filePath = `${vaultPath}/Sessions/${dateStr}.md`
  const result = await tower.vault.writeFile(filePath, content)

  if (result.error) return { ok: false, error: result.error }
  return { ok: true, path: filePath }
}
