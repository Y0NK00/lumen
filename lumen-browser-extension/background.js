// =============================================================================
// Lumen Browser Extension — background.js (Service Worker)
// =============================================================================
//
// Single-file architecture — the WebSocket lives HERE, not in an offscreen doc.
//
// Why this works in Chrome 116+:
//   An active WebSocket connection prevents the service worker from going
//   dormant. As long as Lumen is running and the socket is open, this worker
//   stays alive. No offscreen document needed.
//
// Flow:
//   Lumen (main.js) → WebSocket → HERE → Chrome APIs → result → WebSocket → Lumen
//
// Tab isolation:
//   ALL browsing commands (navigate, click, type, scroll, get_content,
//   screenshot) target a dedicated Lumen task tab — never the user's active tab.
//   The task tab lives in a purple "Lumen" tab group.
// =============================================================================

// ─── WebSocket connection ─────────────────────────────────────────────────────

const SERVERS = [
  'ws://localhost:7745',
  'ws://tower.local:7745',
]
const RECONNECT_DELAY_MS = 3000

let ws = null
let isConnected = false
let serverIndex = 0
let reconnectTimer = null

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  const url = SERVERS[serverIndex]
  console.log('[Lumen] Connecting to', url)

  try {
    ws = new WebSocket(url)
  } catch (err) {
    console.warn('[Lumen] WebSocket constructor threw:', err.message)
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    console.log('[Lumen] Connected to Lumen desktop app')
    clearTimeout(reconnectTimer)
    isConnected = true
    // Announce extension — Lumen uses this to show "Browser: connected" status
    ws.send(JSON.stringify({ type: 'hello', source: 'lumen-browser-extension' }))
  }

  ws.onmessage = async (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      console.error('[Lumen] Non-JSON message:', event.data)
      return
    }

    const { id, command, payload } = message
    if (!id || !command) {
      console.warn('[Lumen] Malformed command:', message)
      return
    }

    try {
      const result = await executeCommand(command, payload ?? {})
      ws.send(JSON.stringify({ id, success: true, result }))
    } catch (err) {
      ws.send(JSON.stringify({ id, success: false, error: err.message ?? 'Command failed' }))
    }
  }

  ws.onclose = (event) => {
    isConnected = false
    serverIndex = (serverIndex + 1) % SERVERS.length
    console.log(`[Lumen] Disconnected (code: ${event.code}). Retrying in ${RECONNECT_DELAY_MS}ms…`)
    scheduleReconnect()
  }

  ws.onerror = () => {
    // onerror always fires before onclose — just log, let onclose handle reconnect
    console.warn('[Lumen] WebSocket error — Lumen may not be running')
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
}

// ─── Startup ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => connect())
chrome.runtime.onStartup.addListener(() => connect())

// Alarm as a safety net: if the socket dropped and reconnect somehow didn't fire,
// the alarm wakes the worker and kicks off a new connect attempt.
chrome.alarms.create('reconnect-watchdog', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'reconnect-watchdog' && !isConnected) {
    console.log('[Lumen] Watchdog: not connected — attempting reconnect')
    connect()
  }
})

// Connect immediately when this script first loads (covers page reload / update)
connect()

// ─── Message handler (popup → background) ────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === 'lumen-popup' && message.command === 'get_status') {
    sendResponse({ connected: isConnected })
    return false // synchronous — no need to return true
  }
})

// ─── Dedicated Lumen task tab ─────────────────────────────────────────────────
// All browse commands target this tab — NEVER the user's active tab.
// Created on first use, reused across commands, recreated if closed manually.

let lumenTabId   = null
let lumenGroupId = null

async function getLumenTab() {
  if (lumenTabId !== null) {
    try {
      const tab = await chrome.tabs.get(lumenTabId)
      if (tab) return lumenTabId
    } catch {
      lumenTabId = null
    }
  }

  // Create a background tab — active: false so focus stays with the user
  const tab = await chrome.tabs.create({ active: false, url: 'about:blank' })
  lumenTabId = tab.id
  await ensureLumenGroup(lumenTabId)
  console.log('[Lumen] Created task tab:', lumenTabId)
  return lumenTabId
}

async function ensureLumenGroup(tabId) {
  if (lumenGroupId !== null) {
    try {
      await chrome.tabGroups.get(lumenGroupId)
      await chrome.tabs.group({ tabIds: [tabId], groupId: lumenGroupId })
      return
    } catch {
      lumenGroupId = null
    }
  }
  lumenGroupId = await chrome.tabs.group({ tabIds: [tabId] })
  await chrome.tabGroups.update(lumenGroupId, { title: 'Lumen', color: 'purple', collapsed: false })
}

// ─── Command router ───────────────────────────────────────────────────────────

async function executeCommand(command, payload) {
  switch (command) {

    // Navigate the Lumen task tab — never touches the user's tab
    case 'navigate': {
      const tabId = await getLumenTab()
      await chrome.tabs.update(tabId, { url: payload.url })
      await waitForTabLoad(tabId, 15000)
      const tab = await chrome.tabs.get(tabId)
      return { url: tab.url, title: tab.title }
    }

    // Get visible text from the Lumen task tab
    case 'get_content': {
      const tabId = await getLumenTab()
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractPageContent,
      })
      return result
    }

    // Get current URL/title of the Lumen task tab
    case 'get_url': {
      const tabId = await getLumenTab()
      const tab = await chrome.tabs.get(tabId)
      return { url: tab.url, title: tab.title }
    }

    // Click an element in the Lumen task tab
    case 'click': {
      const tabId = await getLumenTab()
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: clickElement,
        args: [payload.selector ?? null, payload.text ?? null],
      })
      if (!result.success) throw new Error(result.error)
      return result.message
    }

    // Type into an element in the Lumen task tab
    case 'type': {
      const tabId = await getLumenTab()
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: typeIntoElement,
        args: [payload.selector, payload.text, payload.submit ?? false],
      })
      if (!result.success) throw new Error(result.error)
      return result.message
    }

    // Screenshot the Lumen task tab.
    // captureVisibleTab requires the tab to be active, so we briefly switch to it,
    // capture, then immediately restore the user's original tab (~100ms total).
    case 'screenshot': {
      const tabId = await getLumenTab()
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const originalTabId = currentTab?.id ?? null

      await chrome.tabs.update(tabId, { active: true })
      await new Promise((r) => setTimeout(r, 80))
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 90 })

      if (originalTabId && originalTabId !== tabId) {
        await chrome.tabs.update(originalTabId, { active: true })
      }

      return { base64: dataUrl.replace(/^data:image\/png;base64,/, ''), dataUrl }
    }

    // List all open tabs
    case 'get_tabs': {
      const tabs = await chrome.tabs.query({})
      return tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, active: t.active }))
    }

    // Switch to a specific tab by ID
    case 'switch_tab': {
      await chrome.tabs.update(payload.tabId, { active: true })
      return 'Tab switched'
    }

    // Close and recreate the Lumen task tab (fresh state for a new task)
    case 'reset_tab': {
      if (lumenTabId !== null) {
        try { await chrome.tabs.remove(lumenTabId) } catch {}
        lumenTabId = null
      }
      await getLumenTab()
      return 'Task tab reset'
    }

    // Scroll in the Lumen task tab
    case 'scroll': {
      const tabId = await getLumenTab()
      await chrome.scripting.executeScript({
        target: { tabId },
        func: scrollPage,
        args: [payload.direction ?? 'down', payload.amount ?? 500],
      })
      return 'Scrolled'
    }

    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

// ─── Wait for tab navigation to complete ─────────────────────────────────────

function waitForTabLoad(tabId, timeout = 10000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, timeout)

    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        setTimeout(resolve, 500) // extra settle time for SPAs
      }
    }

    chrome.tabs.onUpdated.addListener(listener)
  })
}

// ─── Page scripts (injected into the task tab via executeScript) ──────────────
// Must be self-contained — no imports, no closure variables from this scope.

function extractPageContent() {
  const clone = document.cloneNode(true)
  clone.querySelectorAll('script, style, nav, footer, [aria-hidden="true"]').forEach(el => el.remove())
  const root = clone.querySelector('main, article, [role="main"], #main, .main-content') ?? clone.body
  const cleaned = (root?.innerText ?? root?.textContent ?? '')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n')
  return { url: window.location.href, title: document.title, text: cleaned.slice(0, 50000) }
}

function clickElement(selector, text) {
  let el = selector
    ? document.querySelector(selector)
    : (() => {
        const xpath = `//*[normalize-space(text())="${text}" or normalize-space(.)="${text}"]`
        const r = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        return r.singleNodeValue ?? Array.from(
          document.querySelectorAll('a, button, [role="button"], input, label, [tabindex]')
        ).find(e => e.textContent?.trim().toLowerCase().includes(text?.toLowerCase()))
      })()

  if (!el) return { success: false, error: selector ? `No element: ${selector}` : `No element with text: "${text}"` }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  el.click()
  return { success: true, message: `Clicked: ${el.tagName} "${el.textContent?.trim().slice(0, 50)}"` }
}

function typeIntoElement(selector, text, submit) {
  const el = document.querySelector(selector)
  if (!el) return { success: false, error: `No element: ${selector}` }
  el.focus()
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.value = ''
  el.dispatchEvent(new Event('input', { bubbles: true }))
  for (const char of text) {
    el.value += char
    el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
  }
  el.dispatchEvent(new Event('change', { bubbles: true }))
  if (submit) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }))
    el.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }
  return { success: true, message: `Typed into ${el.tagName}${submit ? ' and submitted' : ''}` }
}

function scrollPage(direction, amount) {
  if (direction === 'down') window.scrollBy(0, amount)
  else if (direction === 'up') window.scrollBy(0, -amount)
  else if (direction === 'top') window.scrollTo(0, 0)
  else if (direction === 'bottom') window.scrollTo(0, document.body.scrollHeight)
}
