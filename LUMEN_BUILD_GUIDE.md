# Lumen — Developer Build Guide

Full implementation guide for the two major remaining features:
1. PowerShell Persistent Terminal
2. Native Lumen UI (replacing OpenHands + Skyvern embedded views)

---

## Current Project Status

| Feature | Status |
|---|---|
| Chat (Ollama + Claude + OpenRouter) | Done |
| AI Driver panel (Skyvern — BrowserView) | Done |
| Code Bot OpenHands panel (BrowserView) | Done |
| Code Bot Assistant | Done |
| Chat renaming (double-click) | Done |
| Claude models in Code Bot | Done |
| Google OAuth | Done |
| All connectors (GitHub, Telegram, etc.) | Done |
| Skyvern API key (404 error) | Pending — Skyvern config issue |
| PowerShell persistent terminal | Not built — guide below |
| Native Lumen UI (no embedded apps) | Not built — guide below |

---

---

# Part 1 — PowerShell Persistent Terminal

## What You Are Building

Right now each terminal command runs in isolation. If you type `cd Downloads`
it works, but the next command forgets where you are. This guide replaces
that with a real persistent PowerShell session — exactly like Windows Terminal.
Colors, cursor blinking, tab-complete, and directory memory all work.

---

## Phase 1 — Install Required Packages

Do this once before anything else.

**Step 1.1** — Open PowerShell in the Lumen project folder:

```powershell
cd "C:\Users\willi\OneDrive\Documents\Claude\Projects\Self Hosted AI\tower-ai-app"
```

**Step 1.2** — Install node-pty (creates the real shell session) and xterm
(renders it in the UI with full color and cursor support):

```powershell
npm install node-pty
npm install xterm xterm-addon-fit
```

**Step 1.3** — node-pty is a native module and needs to be compiled against
your version of Electron. Run:

```powershell
npm install --save-dev electron-rebuild
npx electron-rebuild
```

This may take 1-2 minutes. You will see "Rebuild Complete" when done.

---

## Phase 2 — main.js

This is where the PowerShell session lives. The renderer (your UI) sends
keystrokes here, and PowerShell's output comes back here and gets forwarded
to the UI.

**Step 2.1** — Open `main.js`. At the very top where the other `require`
lines are, add:

```javascript
const pty = require('node-pty');
let shellProcess = null;
```

**Step 2.2** — Add this function anywhere before the IPC handlers. It creates
the PowerShell session the first time it is called, then reuses it forever:

```javascript
function getShell() {
  if (!shellProcess) {
    shellProcess = pty.spawn('powershell.exe', [], {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: 'C:\\',
      env: process.env
    });

    // When PowerShell prints anything, forward it to the renderer
    shellProcess.onData(data => {
      mainWindow?.webContents.send('terminal:output', data);
    });

    // If the shell exits for any reason, clear it so it restarts next time
    shellProcess.onExit(() => {
      shellProcess = null;
    });
  }
  return shellProcess;
}
```

**Step 2.3** — Add these IPC handlers after the existing ones:

```javascript
// User types a key in the terminal UI — send it straight to PowerShell
ipcMain.on('terminal:input', (_, data) => {
  getShell().write(data);
});

// When the terminal panel is resized, tell PowerShell the new dimensions
// so line wrapping stays correct
ipcMain.handle('terminal:resize', (_, cols, rows) => {
  shellProcess?.resize(cols, rows);
});
```

**Step 2.4** — Find the old `terminal:run` handler (it uses `exec`) and
delete it or comment it out. The new handlers above replace it entirely.

---

## Phase 3 — preload.js

preload.js is the bridge between the UI and main.js. You need to expose
the new terminal functions so the UI can call them.

**Step 3.1** — Open `preload.js`. Inside the `tower` object, add these
three lines alongside the other entries:

```javascript
terminalInput:    (data)   => ipcRenderer.send('terminal:input', data),
terminalResize:   (c, r)   => ipcRenderer.invoke('terminal:resize', c, r),
onTerminalOutput: (cb)     => ipcRenderer.on('terminal:output', (_, d) => cb(d)),
```

---

## Phase 4 — index.html

Replace the old manual terminal div with a single container that xterm
will render into.

**Step 4.1** — Find this block in `index.html`:

```html
<div id="terminal-wrap">
  <div id="terminal-output">
    <div class="term-line system">Lumen Terminal...</div>
  </div>
  <div id="terminal-input-row">
    <span class="term-prompt">$</span>
    <input type="text" id="terminal-input" .../>
    <button id="terminal-send">Run</button>
  </div>
</div>
```

**Step 4.2** — Replace the entire block with:

```html
<div id="xterm-container" style="width:100%;height:100%;padding:8px;box-sizing:border-box;"></div>
```

---

## Phase 5 — app.js

Wire xterm to PowerShell inside the app logic.

**Step 5.1** — At the very top of `app.js`, add:

```javascript
const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
```

**Step 5.2** — Find the `switchCodeTab` function. Inside it, replace the
line that focuses `terminal-input` with:

```javascript
if (tab === 'terminal') {
  setTimeout(() => {
    if (!window._term) initXterm();
  }, 50);
}
```

**Step 5.3** — Add this new function anywhere above `switchCodeTab`:

```javascript
function initXterm() {
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'Consolas, monospace',
    theme: {
      background: '#0f0f0f',
      foreground: '#e0e0e0',
      cursor:     '#ffffff',
      selection:  '#ffffff33'
    }
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('xterm-container'));
  fitAddon.fit();
  window._term = term;

  // User types a key -> send to PowerShell
  term.onData(data => window.tower.terminalInput(data));

  // PowerShell output -> display in terminal
  window.tower.onTerminalOutput(data => term.write(data));

  // Keep terminal sized correctly when the window is resized
  window.addEventListener('resize', () => {
    fitAddon.fit();
    const { cols, rows } = term;
    window.tower.terminalResize(cols, rows);
  });
}
```

**Step 5.4** — Find any remaining code that references `terminal-output`,
`terminal-input`, `terminal-send`, or `termLog` and remove or comment it
out — those were for the old manual terminal and are no longer needed.

---

## Phase 6 — Test

**Step 6.1** — Run `npm start`

**Step 6.2** — Click Code Bot, then the Terminal tab

**Step 6.3** — You should see a real PowerShell prompt: `PS C:\>`

**Step 6.4** — Type `cd Downloads` and press Enter, then type `dir`.
The directory should be remembered. Colors, cursor blinking, and
tab-complete should all work exactly like Windows Terminal.

---

---

# Part 2 — Native Lumen UI

## What You Are Building

Right now Code Bot shows the OpenHands web app inside a BrowserView, and
AI Driver shows the Skyvern web app inside a BrowserView. You see their
branding, their inputs, their layout. This guide replaces both with
Lumen's own UI that talks to their APIs in the background. The user
never sees OpenHands or Skyvern — just Lumen.

This is a large project. It is split into two independent parts that can
be built one at a time.

---

## Part 2A — Native Code Bot (replacing OpenHands BrowserView)

### How OpenHands Works

OpenHands runs at `http://10.0.0.22:3001` and has a REST + WebSocket API.

The key API calls are:

| What you want | How to call it |
|---|---|
| Start a new coding session | `POST /api/conversations` |
| Send a message to the AI | `POST /api/conversations/{id}/events` with `{"action":"message","args":{"content":"your task"}}` |
| Stream what the AI is doing | `GET /api/conversations/{id}/events` (Server-Sent Events) |
| See files that were changed | `GET /api/conversations/{id}/files` |
| Read a changed file | `GET /api/conversations/{id}/files/{path}` |

### Phase 1 — Remove the BrowserView

**Step 1.1** — In `main.js`, delete the entire `code:*` IPC handler block
(code:init, code:show, code:hide, code:setBounds, code:reload) and the
`codeView` / `codeViewAttached` variables.

**Step 1.2** — In `preload.js`, delete the `code:` object.

**Step 1.3** — In `index.html`, find `id="codetab-openhands"` and replace
the entire contents with the new layout below.

**Step 1.4** — In `app.js`, delete `initCodeView`, `updateCodeBounds`,
`codeState`, and all `window.tower.code.*` calls.

### Phase 2 — New HTML Layout

Replace the OpenHands panel content in `index.html` with:

```html
<div id="codetab-openhands" class="code-panel">

  <!-- Left: conversation thread -->
  <div id="oh-thread">
    <div id="oh-messages"></div>
    <div id="oh-input-row">
      <textarea id="oh-input" placeholder="Describe what you want to build..."></textarea>
      <button id="oh-send">Run</button>
    </div>
  </div>

  <!-- Middle: live action feed -->
  <div id="oh-actions">
    <div class="oh-panel-title">Actions</div>
    <div id="oh-action-list"></div>
  </div>

  <!-- Right: file changes -->
  <div id="oh-changes">
    <div class="oh-panel-title">Changes</div>
    <div id="oh-changes-list"></div>
  </div>

</div>
```

### Phase 3 — CSS for the New Layout

Add to `style.css`:

```css
#codetab-openhands {
  display: flex;
  flex-direction: row;
  gap: 0;
  height: 100%;
  overflow: hidden;
}

#oh-thread {
  width: 40%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
}

#oh-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

#oh-input-row {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border);
}

#oh-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 8px 12px;
  font-size: 13px;
  resize: none;
  min-height: 60px;
  font-family: inherit;
  outline: none;
}

#oh-send {
  align-self: flex-end;
  padding: 8px 18px;
  background: var(--accent);
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

#oh-actions {
  width: 30%;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 12px;
}

#oh-changes {
  width: 30%;
  overflow-y: auto;
  padding: 12px;
}

.oh-panel-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}

.oh-msg {
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  max-width: 90%;
}

.oh-msg.user {
  background: var(--accent-dim);
  color: var(--accent);
  align-self: flex-end;
}

.oh-msg.ai {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.oh-action-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
}

.oh-action-icon { flex-shrink: 0; font-size: 14px; }

.oh-change-item {
  padding: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 12px;
}

.oh-change-filename {
  color: var(--accent);
  font-family: monospace;
  margin-bottom: 4px;
}

.oh-diff-add { color: #4ade80; }
.oh-diff-del { color: #f87171; }
```

### Phase 4 — app.js Logic

Add these functions to `app.js`:

```javascript
// ── NATIVE CODE BOT (OpenHands API) ──────────────

let ohSessionId = null;
let ohEventSource = null;

async function ohStartSession(task) {
  // Create a new OpenHands conversation
  const res = await fetch(`${state.settings.openhandsUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  ohSessionId = data.conversation_id;

  // Subscribe to the event stream
  ohEventSource = new EventSource(
    `${state.settings.openhandsUrl}/api/conversations/${ohSessionId}/events`
  );

  ohEventSource.onmessage = (e) => {
    const event = JSON.parse(e.data);
    ohHandleEvent(event);
  };

  // Send the task
  await fetch(
    `${state.settings.openhandsUrl}/api/conversations/${ohSessionId}/events`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'message',
        args: { content: task }
      })
    }
  );
}

function ohHandleEvent(event) {
  // AI sent a message
  if (event.action === 'message' && event.source === 'agent') {
    ohAppendMessage('ai', event.args?.content || '');
  }

  // AI ran a command
  if (event.action === 'run') {
    ohAppendAction('terminal', event.args?.command || '');
  }

  // AI read or wrote a file
  if (event.action === 'read') {
    ohAppendAction('read', event.args?.path || '');
  }
  if (event.action === 'write') {
    ohAppendAction('write', event.args?.path || '');
    ohAddChangedFile(event.args?.path, event.args?.content);
  }

  // AI finished
  if (event.action === 'finish') {
    ohAppendAction('done', 'Task complete');
    ohEventSource?.close();
  }
}

function ohAppendMessage(role, text) {
  const msgs = document.getElementById('oh-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = `oh-msg ${role}`;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function ohAppendAction(type, text) {
  const list = document.getElementById('oh-action-list');
  if (!list) return;
  const icons = { terminal: 'terminal', read: 'read', write: 'write', done: 'done' };
  const iconMap = { terminal: '>', read: 'R', write: 'W', done: 'V' };
  const div = document.createElement('div');
  div.className = 'oh-action-item';
  div.innerHTML = `<span class="oh-action-icon">${iconMap[type] || '.'}</span><span>${text}</span>`;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

function ohAddChangedFile(path, content) {
  const list = document.getElementById('oh-changes-list');
  if (!list || !path) return;
  const div = document.createElement('div');
  div.className = 'oh-change-item';
  div.innerHTML = `<div class="oh-change-filename">${path}</div>
    <pre style="font-size:11px;overflow:auto;max-height:120px;margin:0">${
      (content || '').slice(0, 500)
    }</pre>`;
  list.appendChild(div);
}

function ohSend() {
  const input = document.getElementById('oh-input');
  const task = input?.value?.trim();
  if (!task) return;
  ohAppendMessage('user', task);
  input.value = '';
  // Clear previous actions and changes
  document.getElementById('oh-action-list').innerHTML = '';
  document.getElementById('oh-changes-list').innerHTML = '';
  ohStartSession(task).catch(err => ohAppendMessage('ai', 'Error: ' + err.message));
}
```

### Phase 5 — Wire Up the Send Button

In `bindEvents()` in `app.js`, add:

```javascript
document.getElementById('oh-send').addEventListener('click', ohSend);
document.getElementById('oh-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ohSend(); }
});
```

---

## Part 2B — Native AI Driver (replacing Skyvern BrowserView)

### How Skyvern Works

Skyvern runs at `http://10.0.0.22:8000`. You authenticate every request
with your API key in the header: `x-api-key: tower-skyvern-key`

The key API calls are:

| What you want | How to call it |
|---|---|
| Run a browser task | `POST /api/v1/tasks` with `{"url":"...","navigation_goal":"..."}` |
| Check task status | `GET /api/v1/tasks/{task_id}` |
| See step-by-step actions | `GET /api/v1/tasks/{task_id}/steps` |
| Get latest screenshot | `GET /api/v1/tasks/{task_id}/steps/{step_id}/screenshots` |
| List past tasks | `GET /api/v1/tasks` |

### Phase 1 — Remove the BrowserView

**Step 1.1** — In `main.js`, delete the `driver:*` IPC handler block and
`driverView` / `driverViewAttached` variables.

**Step 1.2** — In `preload.js`, delete the `driver:` object.

**Step 1.3** — In `app.js`, delete `initDriverView`, `updateDriverBounds`,
`driverState`, `getDriverOverlayHTML`, and all `window.tower.driver.*` calls.

### Phase 2 — New HTML Layout

Replace the AI Driver panel content in `index.html`:

```html
<div id="panel-driver" class="panel">

  <!-- Top toolbar (keep the existing one) -->
  <div class="panel-toolbar">
    <div class="toolbar-title">AI Driver</div>
    <span class="toolbar-sub">Browser automation</span>
  </div>

  <!-- Task input bar -->
  <div id="driver-task-bar">
    <input id="driver-task-input" type="text"
      placeholder="What do you want Skyvern to do? e.g. Go to LinkedIn and search for Software Engineer jobs in Seattle"/>
    <input id="driver-url-input" type="text" placeholder="Starting URL (optional)"/>
    <button id="driver-run-btn">Run Task</button>
  </div>

  <!-- Main area: screenshot on left, steps on right -->
  <div id="driver-main">

    <div id="driver-screenshot-wrap">
      <div id="driver-screenshot-placeholder">
        Browser view will appear here when a task is running
      </div>
      <img id="driver-screenshot-img" style="display:none;width:100%;height:100%;object-fit:contain;"/>
    </div>

    <div id="driver-sidebar">

      <!-- Status -->
      <div id="driver-status-row">
        <span id="driver-status-badge">Idle</span>
        <span id="driver-task-label"></span>
      </div>

      <!-- Step log -->
      <div class="oh-panel-title" style="margin-top:12px">Steps</div>
      <div id="driver-steps-list"></div>

      <!-- Past tasks -->
      <div class="oh-panel-title" style="margin-top:16px">Recent Tasks</div>
      <div id="driver-history-list"></div>

    </div>
  </div>

</div>
```

### Phase 3 — CSS for AI Driver

Add to `style.css`:

```css
#driver-task-bar {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

#driver-task-input {
  flex: 2;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 7px 12px;
  font-size: 13px;
  outline: none;
}

#driver-url-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 7px 12px;
  font-size: 13px;
  outline: none;
}

#driver-run-btn {
  padding: 7px 20px;
  background: var(--accent);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

#driver-main {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

#driver-screenshot-wrap {
  flex: 1;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--border);
}

#driver-screenshot-placeholder {
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  padding: 40px;
}

#driver-sidebar {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 12px;
}

#driver-status-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  background: var(--bg-hover);
  color: var(--text-muted);
}

#driver-status-badge.running {
  background: #fbbf2420;
  color: #fbbf24;
}

#driver-status-badge.complete {
  background: #4ade8020;
  color: #4ade80;
}

#driver-status-badge.failed {
  background: #f8717120;
  color: #f87171;
}

.driver-step {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
}

.driver-step-num {
  color: var(--text-muted);
  flex-shrink: 0;
  font-size: 11px;
}

.driver-history-item {
  padding: 7px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 5px;
  font-size: 12px;
  cursor: pointer;
}

.driver-history-item:hover { border-color: var(--accent); }

.driver-history-status {
  font-size: 10px;
  margin-top: 2px;
  color: var(--text-muted);
}
```

### Phase 4 — app.js Logic

Add these functions to `app.js`:

```javascript
// ── NATIVE AI DRIVER (Skyvern API) ──────────────

const SKYVERN_KEY = () => state.settings.skyvernApiKey || 'tower-skyvern-key';
const SKYVERN_API = () => state.settings.skyvernUrl.replace(':8081', ':8000');

let driverPollInterval = null;

async function driverRunTask() {
  const taskInput = document.getElementById('driver-task-input');
  const urlInput  = document.getElementById('driver-url-input');
  const goal = taskInput?.value?.trim();
  if (!goal) return;

  // Clear previous run
  document.getElementById('driver-steps-list').innerHTML = '';
  document.getElementById('driver-screenshot-img').style.display = 'none';
  document.getElementById('driver-screenshot-placeholder').style.display = 'flex';
  driverSetStatus('running', 'Starting…');

  try {
    const res = await fetch(`${SKYVERN_API()}/api/v1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SKYVERN_KEY()
      },
      body: JSON.stringify({
        url: urlInput?.value?.trim() || 'https://www.google.com',
        navigation_goal: goal,
        data_extraction_goal: null,
        proxy_location: null
      })
    });

    if (!res.ok) throw new Error(`Skyvern API error: ${res.status}`);
    const task = await res.json();
    document.getElementById('driver-task-label').textContent = goal.slice(0, 60);

    // Poll for updates every 3 seconds
    driverPollInterval = setInterval(() => driverPoll(task.task_id), 3000);

  } catch (err) {
    driverSetStatus('failed', err.message);
  }
}

async function driverPoll(taskId) {
  try {
    const [taskRes, stepsRes] = await Promise.all([
      fetch(`${SKYVERN_API()}/api/v1/tasks/${taskId}`,
        { headers: { 'x-api-key': SKYVERN_KEY() } }),
      fetch(`${SKYVERN_API()}/api/v1/tasks/${taskId}/steps`,
        { headers: { 'x-api-key': SKYVERN_KEY() } })
    ]);

    const task  = await taskRes.json();
    const steps = await stepsRes.json();

    // Update step list
    const stepList = document.getElementById('driver-steps-list');
    stepList.innerHTML = '';
    (steps || []).forEach((s, i) => {
      const div = document.createElement('div');
      div.className = 'driver-step';
      div.innerHTML = `<span class="driver-step-num">${i + 1}</span>
        <span>${s.action_description || s.step_id}</span>`;
      stepList.appendChild(div);
    });

    // Try to show the latest screenshot
    if (steps?.length) {
      const lastStep = steps[steps.length - 1];
      const screenshotUrl =
        `${SKYVERN_API()}/api/v1/tasks/${taskId}/steps/${lastStep.step_id}/screenshots`;
      const img = document.getElementById('driver-screenshot-img');
      img.src = screenshotUrl + '?key=' + SKYVERN_KEY() + '&t=' + Date.now();
      img.style.display = 'block';
      document.getElementById('driver-screenshot-placeholder').style.display = 'none';
    }

    // Update status
    const status = task.status?.toLowerCase() || 'running';
    driverSetStatus(
      status === 'completed' ? 'complete' : status === 'failed' ? 'failed' : 'running',
      status
    );

    // Stop polling when done
    if (status === 'completed' || status === 'failed' || status === 'terminated') {
      clearInterval(driverPollInterval);
      driverLoadHistory();
    }

  } catch (err) {
    console.error('Driver poll error:', err);
  }
}

function driverSetStatus(state, label) {
  const badge = document.getElementById('driver-status-badge');
  if (!badge) return;
  badge.className = `driver-status-badge ${state}`;
  badge.textContent = label.charAt(0).toUpperCase() + label.slice(1);
}

async function driverLoadHistory() {
  try {
    const res = await fetch(`${SKYVERN_API()}/api/v1/tasks?page_size=10`,
      { headers: { 'x-api-key': SKYVERN_KEY() } });
    const tasks = await res.json();
    const list = document.getElementById('driver-history-list');
    if (!list) return;
    list.innerHTML = '';
    (tasks || []).forEach(t => {
      const div = document.createElement('div');
      div.className = 'driver-history-item';
      div.innerHTML = `
        <div>${(t.navigation_goal || 'Task').slice(0, 60)}</div>
        <div class="driver-history-status">${t.status} · ${
          new Date(t.created_at).toLocaleDateString()
        }</div>`;
      list.appendChild(div);
    });
  } catch {}
}
```

### Phase 5 — Wire Up the Run Button

In `bindEvents()` in `app.js`, add:

```javascript
document.getElementById('driver-run-btn').addEventListener('click', driverRunTask);
document.getElementById('driver-task-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') driverRunTask();
});
```

Also add this to the `switchMode` function so history loads when you open the tab:

```javascript
if (mode === 'driver') driverLoadHistory();
```

### Phase 6 — Add skyvernApiKey to Settings

In the Settings page in `index.html`, add a field for the API key:

```html
<div class="field-row">
  <label>Skyvern API Key</label>
  <input type="password" id="s-skyvern-api-key" placeholder="tower-skyvern-key"/>
</div>
```

In `app.js`, in `populateSettingsForm`:

```javascript
document.getElementById('s-skyvern-api-key').value = state.settings.skyvernApiKey || '';
```

In `saveSettings`:

```javascript
state.settings.skyvernApiKey = document.getElementById('s-skyvern-api-key').value.trim();
```

---

## Recommended Build Order

```
1. Done  — BrowserView fix (AI Driver + Code Bot)
2. Done  — Chat renaming
3. Done  — Claude models in Code Bot
4. Next  — PowerShell terminal (self-contained, 1-2 days)
5. Then  — Native Code Bot UI (1 week)
6. Then  — Native AI Driver UI (3-4 days)
```

---

*Generated for the Lumen project — github.com/Y0NK00/lumen*
