// =============================================================================
// Lumen Browser Extension — background.js (Service Worker)
// =============================================================================
//
// This service worker does two things:
//   1. Ensures the offscreen document (WebSocket bridge) stays alive
//   2. Handles Chrome API commands routed from the offscreen document
//
// Flow for every tool call:
//   Lumen (main.js) → WebSocket → offscreen.js → chrome.runtime.sendMessage
//   → HERE (background.js) → Chrome APIs → sendResponse → offscreen.js
//   → WebSocket → Lumen
//
// Why offscreen document for the WebSocket?
//   MV3 service workers go dormant after ~30 seconds of inactivity.
//   Offscreen documents stay alive as long as they're open.
//   So the WebSocket lives in offscreen.js, and service worker just handles
//   the Chrome API calls (which require service worker context).
// =============================================================================

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html')

// ─── Keep offscreen document alive ───────────────────────────────────────────

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [OFFSCREEN_URL],
  })

  if (existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Maintain persistent WebSocket connection to Lumen desktop app',
    })
    console.log('[Lumen] Offscreen document created')
  }
}

// Create offscreen doc on install and startup
chrome.runtime.onInstalled.addListener(ensureOffscreen)
chrome.runtime.onStartup.addListener(ensureOffscreen)

// Use alarms to revive the service worker periodically, which checks the
// offscreen doc is still alive. Alarm fires every 25 seconds.
chrome.alarms.create('keep-alive', { periodInMinutes: 0.4 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keep-alive') ensureOffscreen()
})

// ─── Command handler ──────────────────────────────────────────────────────────
// Receives messages from offscreen.js and executes Chrome APIs.
// MUST return true from the listener to use async sendResponse.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── Status check from popup ──────────────────────────────────────────────────
  // Popup asks background → background asks offscreen → offscreen replies
  if (message.source === 'lumen-popup' && message.command === 'get_status') {
    chrome.runtime.sendMessage(
      { source: 'lumen-background', command: 'ws_status' },
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ connected: false })
        } else {
          sendResponse({ connected: response?.connected ?? false })
        }
      }
    )
    return true
  }

  // ── Normal tool commands from offscreen ──────────────────────────────────────
  if (message.source !== 'lumen-offscreen') return false

  executeCommand(message.command, message.payload)
    .then((result) => sendResponse({ success: true, result }))
    .catch((err) => sendResponse({ success: false, error: err.message }))

  return true // Keep message channel open for async response
})

// ─── Command implementations ──────────────────────────────────────────────────

async function executeCommand(command, payload) {
  switch (command) {

    // ── Navigate the active tab to a URL ─────────────────────────────────────
    case 'navigate': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      await chrome.tabs.update(tab.id, { url: payload.url })

      // Wait for the page to finish loading (up to 15 seconds)
      await waitForTabLoad(tab.id, 15000)

      // Return the final URL and title after navigation
      const [updated] = await chrome.tabs.query({ active: true, currentWindow: true })
      return { url: updated.url, title: updated.title }
    }

    // ── Get visible text from the current page ────────────────────────────────
    case 'get_content': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageContent,
      })
      return result
    }

    // ── Get the current page URL and title ────────────────────────────────────
    case 'get_url': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      return { url: tab.url, title: tab.title }
    }

    // ── Click an element by CSS selector or visible text ──────────────────────
    case 'click': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: clickElement,
        args: [payload.selector ?? null, payload.text ?? null],
      })
      if (!result.success) throw new Error(result.error)
      return result.message
    }

    // ── Type text into an input field ─────────────────────────────────────────
    case 'type': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: typeIntoElement,
        args: [payload.selector, payload.text, payload.submit ?? false],
      })
      if (!result.success) throw new Error(result.error)
      return result.message
    }

    // ── Take a screenshot of the active tab ───────────────────────────────────
    // Returns base64-encoded PNG (WITHOUT the data:image/png;base64, prefix)
    case 'screenshot': {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: 'png',
        quality: 90,
      })
      // Strip the data URL prefix — we only want the raw base64
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      return { base64, dataUrl }
    }

    // ── List all open tabs ────────────────────────────────────────────────────
    case 'get_tabs': {
      const tabs = await chrome.tabs.query({})
      return tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, active: t.active }))
    }

    // ── Switch to a tab by ID ─────────────────────────────────────────────────
    case 'switch_tab': {
      await chrome.tabs.update(payload.tabId, { active: true })
      return 'Tab switched'
    }

    // ── Scroll the page ───────────────────────────────────────────────────────
    case 'scroll': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrollPage,
        args: [payload.direction ?? 'down', payload.amount ?? 500],
      })
      return 'Scrolled'
    }

    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

// ─── Helper: wait for a tab to finish loading ─────────────────────────────────

function waitForTabLoad(tabId, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve() // Don't reject — page might be partially loaded but usable
    }, timeout)

    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        // Small extra delay for JS-heavy pages (SPAs, etc.)
        setTimeout(resolve, 500)
      }
    }

    chrome.tabs.onUpdated.addListener(listener)
  })
}

// ─── Page functions (injected via executeScript) ──────────────────────────────
// These run IN the page's context. They cannot reference anything outside
// this function body — no imports, no closures from background.js scope.

function extractPageContent() {
  // Remove script, style, nav, footer elements for cleaner text
  const clone = document.cloneNode(true)
  const remove = clone.querySelectorAll('script, style, nav, footer, [aria-hidden="true"]')
  remove.forEach((el) => el.remove())

  // Get the main content area if it exists, otherwise use body
  const main = clone.querySelector('main, article, [role="main"], #main, .main-content')
  const root = main ?? clone.body

  const text = root?.innerText ?? root?.textContent ?? ''

  // Clean up excessive whitespace
  const cleaned = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  return {
    url: window.location.href,
    title: document.title,
    text: cleaned.slice(0, 50000), // cap at 50k chars — enough for Claude
  }
}

function clickElement(selector, text) {
  let el = null

  if (selector) {
    el = document.querySelector(selector)
    if (!el) return { success: false, error: `No element found for selector: ${selector}` }
  } else if (text) {
    // XPath: find element whose text content matches exactly or contains the text
    const xpath = `//*[normalize-space(text())="${text}" or normalize-space(.)="${text}"]`
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
    el = result.singleNodeValue

    if (!el) {
      // Fallback: partial match on any interactive element
      const candidates = Array.from(
        document.querySelectorAll('a, button, [role="button"], input, label, [tabindex]')
      )
      el = candidates.find(
        (e) => e.textContent?.trim().toLowerCase().includes(text.toLowerCase())
      )
    }

    if (!el) return { success: false, error: `No clickable element found with text: "${text}"` }
  } else {
    return { success: false, error: 'Provide either selector or text' }
  }

  // Scroll element into view before clicking
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // Dispatch both mousedown and click for maximum compatibility
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  el.click()

  return { success: true, message: `Clicked: ${el.tagName} "${el.textContent?.trim().slice(0, 50)}"` }
}

function typeIntoElement(selector, text, submit) {
  const el = document.querySelector(selector)
  if (!el) return { success: false, error: `No element found for selector: ${selector}` }

  el.focus()
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // Clear existing value
  el.value = ''
  el.dispatchEvent(new Event('input', { bubbles: true }))

  // Type character by character to trigger React/Vue synthetic events
  for (const char of text) {
    el.value += char
    el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
  }

  // Trigger change event (some frameworks need this)
  el.dispatchEvent(new Event('change', { bubbles: true }))

  if (submit) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }))
    // Also try submitting the parent form if it exists
    const form = el.closest('form')
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }

  return { success: true, message: `Typed "${text}" into ${el.tagName}${submit ? ' and submitted' : ''}` }
}

function scrollPage(direction, amount) {
  if (direction === 'down') window.scrollBy(0, amount)
  else if (direction === 'up') window.scrollBy(0, -amount)
  else if (direction === 'top') window.scrollTo(0, 0)
  else if (direction === 'bottom') window.scrollTo(0, document.body.scrollHeight)
}
