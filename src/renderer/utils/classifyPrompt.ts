// src/renderer/utils/classifyPrompt.ts
// Routes a task prompt to the best-fit agent.
//
// Strategy:
//   1. If a Claude API key is set, use claude-haiku for fast, cheap classification.
//   2. On API failure or missing key, fall back to keyword regex.
//   3. If no pattern matches, return the first enabled agent (or 'code').

import { useHelmStore, type AgentId } from '../stores/helmStore'
import { useSettingsStore } from '../stores/settingsStore'

// ─── Regex fallback ───────────────────────────────────────────────────────────

const KEYWORD_MAP: Record<AgentId, RegExp> = {
  code:     /\b(shell|bash|grep|git|compile|build|refactor|npm|pip|deploy|code|script|debug|function|typescript|python)\b/i,
  research: /\b(research|search|summarize|compare|find out|look up|news|article|web|explain|what is|how does)\b/i,
  file:     /\b(file|folder|organize|rename|move|copy|read|write|delete|clean up|directory|save|open)\b/i,
  schedule: /\b(schedule|every|daily|weekly|cron|recurring|remind|automate|run at)\b/i,
}

function regexClassify(prompt: string, enabledIds: AgentId[]): AgentId {
  for (const id of enabledIds) {
    if (KEYWORD_MAP[id].test(prompt)) return id
  }
  return enabledIds[0] ?? 'code'
}

// ─── LLM classifier ───────────────────────────────────────────────────────────

async function llmClassify(prompt: string, enabledIds: AgentId[], apiKey: string): Promise<AgentId | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: `You are a task router. Classify the following task prompt into exactly one of these agent types: ${enabledIds.join(', ')}.

Respond with ONLY the agent name — nothing else, no punctuation, no explanation.

Task: "${prompt}"`,
        }],
      }),
    })

    if (!response.ok) return null

    const data = await response.json() as { content?: Array<{ text?: string }> }
    const text = data.content?.[0]?.text?.trim().toLowerCase() as AgentId | undefined
    return text && enabledIds.includes(text) ? text : null
  } catch {
    return null
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function classifyPrompt(prompt: string): Promise<AgentId> {
  const { agents } = useHelmStore.getState()
  const enabledIds = (Object.keys(agents) as AgentId[]).filter((id) => agents[id].enabled)

  if (enabledIds.length === 0) return 'code'

  const { claudeApiKey } = useSettingsStore.getState()

  // Use LLM if we have a key, fall back to regex on any failure
  if (claudeApiKey) {
    const result = await llmClassify(prompt, enabledIds, claudeApiKey)
    if (result) return result
  }

  return regexClassify(prompt, enabledIds)
}
