// =============================================================================
// Lumen Browser Extension — offscreen.js
// =============================================================================
//
// This script runs inside the offscreen document. Its only job:
//   1. Maintain a persistent WebSocket connection to Lumen (port 7745)
//   2. When Lumen sends a command → forward to background.js via sendMessage
//   3. When background.js responds → send result back to Lumen over WebSocket
//
// The offscreen document is the ONLY place in MV3 where a WebSocket can live
// persistently. Service workers go dormant; this document doesn't.
// =============================================================================

// Try localhost (Electron app on same PC) first, then tower.local (Unraid / remote).
// Localhost first ensures local dev always connects to the running Lumen instance
// rather than accidentally connecting to a remote server on the same port.
const SERVERS = [
  'ws://localhost:7745',
  'ws://tower.local:7745',
]
const RECONNECT_DELAY_MS = 3000

let ws = null
let reconnectTimer = null
let isConnected = false
let serverIndex = 0  // which server we're currently trying

// ─── WebSocket management ─────────────────────────────────────────────────────

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  const url = SERVERS[serverIndex]
  console.log('[Lumen] Connecting to ' + url)
  ws = new WebSocket(url)

  ws.onopen = () => {
    console.log('[Lumen] Connected to Lumen desktop app')
    clearTimeout(reconnectTimer)
    isConnected = true

    // Announce ourselves — Lumen uses this to track extension status
    ws.send(JSON.stringify({ type: 'hello', source: 'lumen-browser-extension' }))
  }

  ws.onmessage = async (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      console.error('[Lumen] Received non-JSON message:', event.data)
      return
    }

    const { id, command, payload } = message

    if (!id || !command) {
      console.warn('[Lumen] Malformed command (missing id or command):', message)
      return
    }

    try {
      // Forward the command to background.js which has Chrome API access.
      // background.js runs executeCommand() and responds via sendResponse.
      const response = await chrome.runtime.sendMessage({
        source: 'lumen-offscreen',
        command,
        payload: payload ?? {},
      })

      // Send result back to Lumen over WebSocket
      ws.send(JSON.stringify({
        id,
        success: response.success,
        result: response.result ?? null,
        error: response.error ?? null,
      }))
    } catch (err) {
      ws.send(JSON.stringify({
        id,
        success: false,
        error: err.message ?? 'Command execution failed',
      }))
    }
  }

  ws.onclose = (event) => {
    isConnected = false
    // Rotate to next server so we try them in round-robin
    serverIndex = (serverIndex + 1) % SERVERS.length
    console.log(`[Lumen] Disconnected (code: ${event.code}). Trying next server in ${RECONNECT_DELAY_MS}ms…`)
    scheduleReconnect()
  }

  ws.onerror = (err) => {
    // onerror always fires before onclose — just log it
    console.warn('[Lumen] WebSocket error. Lumen may not be running.')
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
}

// ─── Status listener (for popup) ─────────────────────────────────────────────
// Popup → background → here → background → popup

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === 'lumen-background' && message.command === 'ws_status') {
    sendResponse({ connected: isConnected })
    return false
  }
})

// ─── Start ────────────────────────────────────────────────────────────────────

connect()
