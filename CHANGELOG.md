# Changelog

## [Unreleased] — 2026-05-03

### Desktop PWA shell — Claude-style main header alignment

**Problem:** On desktop, the workspace controls (**Chat / Cowork / Code** + **+ New chat**) were centered in the main pane (three-column grid), then left-aligned but still wrapped in a **small bordered/shadow “card”**, so the UI looked like a floating island instead of integrated chrome next to the top command bar (Claude reference).

**Changes:**

- `lumen-pwa/src/components/WindowChrome.tsx` — `DesktopMainHeader` row 2: **`flex justify-start`** with matching horizontal padding; removed extra **border-t** between toolbar row and workspace row.
- `lumen-pwa/src/components/Layout.tsx` — Dropped outer **`rounded-2xl` / border / shadow** wrapper around `workspacePanel`; stack is **`flex flex-col gap-2 w-full max-w-[420px]`**; **+ New chat** uses **`var(--color-surface)`** so it reads as a continuous row with **`WorkspaceTabs`**.
- `lumen-pwa/src/components/Sidebar.tsx` — Removed duplicate top **NavRow “New chat”**; removed unused **`handleNew`**, **`newChatProjectId`**, and **`createConversation`** import.

**Handoff:** See **`SESSION_HANDOFF.md`** at repo root.

---

## [Unreleased] — 2026-05-02

### Task 1 — Chrome extension port mismatch (7745 → 7747)

**Problem:** The extension was trying to connect to port 7745, but the server runs on 7747. Every WebSocket reconnect attempt failed silently.

**Files changed:**

- `lumen-browser-extension/manifest.json` — Updated `connect-src` in `content_security_policy` from port 7745 to 7747 for both `ws://localhost` and `ws://tower.local`.
- `lumen-browser-extension/background.js` — Updated the `SERVERS` array (lines 23–26) from `ws://localhost:7745` / `ws://tower.local:7745` to port 7747.
- `lumen-browser-extension/offscreen.js` — Same `SERVERS` array fix, plus updated the stale port reference in the file header comment.

---

### Task 2 — Starter suggestion chips: wired up onClick

**Problem:** The empty-chat state already rendered four suggestion chips ("Explain a concept", "Help me write", "Debug my code", "Brainstorm ideas"), but clicking them did nothing — no `onClick` handler was attached.

**Files changed:**

- `lumen-pwa/src/components/MessageList.tsx`
  - Added `onStarterClick?: (text: string) => void` to `MessageListProps`.
  - Destructured `onStarterClick` in `MessageList`.
  - Added `onClick={() => onStarterClick?.(s.title)}` to each chip button.
- `lumen-pwa/src/components/ChatPane.tsx`
  - Passed `onStarterClick={handleSend}` to `<MessageList />`. Clicking a chip now sends that chip title as the first message, auto-creating a conversation if none is active (the existing `useStream.send` path handles this).

---

### Task 3 — Mobile delete button for conversations

**Problem:** The sidebar's conversation delete button used `opacity-0 group-hover:opacity-100`. CSS hover states never fire on touch screens, so the button was invisible and untappable on mobile.

**Files changed:**

- `lumen-pwa/src/components/Sidebar.tsx`
  - Changed the delete button class from `opacity-0 group-hover:opacity-100` to `opacity-40 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100`.
  - On mobile (below `sm` breakpoint): button is always visible at 40% opacity — tappable.
  - On desktop (`sm`+): old hover-reveal behaviour is preserved.

---

### Task 4 — Message layout polish

**Problem:** Two minor layout issues in the message list:

1. The AI message content wrapper had `overflow-hidden` which could clip the horizontal scroll area of code blocks in some viewport widths. The `min-w-0` flex constraint is sufficient to prevent layout overflow; the extra `overflow-hidden` was unnecessary and potentially harmful.
2. `space-y-1` (4 px) between messages was very tight, making multi-message threads feel cramped.

**Files changed:**

- `lumen-pwa/src/components/MessageList.tsx`
  - Removed `overflow-hidden` from the AI message content wrapper div (line ~209). `min-w-0` remains, which is the correct constraint in a flex layout.
  - Changed `space-y-1` → `space-y-2` (8 px gap) on the message list scroll container for better readability.

---

### Task 5 — WebSocket extension route + JWT auth for the browser extension

**Problem:** The browser extension previously connected to a bare WebSocket on port 7745 with no authentication — any local process could send commands to the extension. There was also no server-side WebSocket endpoint; the extension was targeting a port that nothing was listening on.

**Files changed:**

- `lumen-server/src/routes/extension.ts` *(new)* — `@fastify/websocket` route registered at `/ws/extension`. Reads `Authorization: Bearer <token>` from the HTTP upgrade request headers, verifies the JWT via the existing token library, and closes the socket with `4401` if auth fails. After handshake, dispatches inbound `{id, command, payload}` frames to the appropriate Chrome extension bridge and replies with `{id, success, result}` / `{id, success: false, error}`. Handles the full command set: `navigate`, `click`, `type`, `screenshot`, `scroll`, `get_content`, `get_url`, `get_tabs`, `switch_tab`, `reset_tab`.
- `lumen-server/src/index.ts` — Registered `@fastify/websocket` plugin (before routes); imported and registered `extensionRoutes`; removed the `// TODO: ws (browser extension WebSocket)` comment.
- `lumen-browser-extension/background.js` — Rewrote connection logic. `SERVERS` array updated from `ws://localhost:7745` to `ws://localhost:7747/ws/extension` (and `ws://tower.local:7747/ws/extension`). On `ws.onopen`, reads `extension_token` from `chrome.storage.local` and sends `{type: 'auth', token}` as the first frame. Added exponential-style reconnect backoff and a `'auth_failed'` message type to surface auth errors to the popup.
- `lumen-browser-extension/offscreen.js` — Updated `SERVERS` array to new `/ws/extension` path; updated auth handshake to send the same `{type: 'auth', token}` first-frame format as background.js.
- `lumen-browser-extension/popup.html` — Added a "Token Setup" section below the status indicator: a labelled text input ("Paste your Lumen token"), a Save button, and helper text pointing users to Settings → Browser Extension in the Lumen app to find their token.
- `lumen-browser-extension/popup.js` — Wired the token Save button to write to `chrome.storage.local` under key `extension_token` and show a "Saved" confirmation. On popup open, reads and pre-fills the input if a token is already saved. Shows an "Auth failed — check your token" warning in the status sub-line when background.js reports `auth_failed`.
