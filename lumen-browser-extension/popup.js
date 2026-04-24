// popup.js — checks connection status and updates the UI

const dot = document.getElementById('dot')
const label = document.getElementById('status-label')
const sub = document.getElementById('status-sub')

function setStatus(state) {
  dot.className = 'dot ' + state

  if (state === 'connected') {
    label.textContent = 'Connected to Lumen'
    sub.textContent = 'Browser tools are active. Claude can see and interact with this tab.'
    sub.style.color = '#4ade80'
  } else if (state === 'disconnected') {
    label.textContent = 'Lumen not running'
    sub.textContent = 'Start Lumen with npm run dev:v2 — the extension reconnects automatically.'
    sub.style.color = '#6b7280'
  } else {
    label.textContent = 'Checking…'
    sub.textContent = ''
  }
}

// Ask the background service worker for current WebSocket state.
// background.js owns the WS directly now — no offscreen relay needed.
chrome.runtime.sendMessage({ source: 'lumen-popup', command: 'get_status' }, (response) => {
  if (chrome.runtime.lastError || !response) {
    setStatus('disconnected')
    return
  }
  setStatus(response.connected ? 'connected' : 'disconnected')
})
