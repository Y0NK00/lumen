// SSE streaming via fetch — EventSource can't send auth headers, so we use
// fetch + ReadableStream to parse the server-sent event protocol manually.

export interface SSEEvent {
  event: string
  data: unknown
}

export async function* sseStream(
  conversationId: string,
  content: string,
  model?: string,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  const token = localStorage.getItem('lumen_token')
  const BASE = import.meta.env.VITE_API_URL ?? ''

  const res = await fetch(`${BASE}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content, ...(model ? { model } : {}) }),
    signal,
  })

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? `Stream failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            yield { event: currentEvent, data }
          } catch {
            // malformed JSON — skip
          }
          currentEvent = ''
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}
