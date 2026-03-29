# Lumen — Feature Implementation Guide


---

## What This Guide Covers

| Feature | What it does |
|---|---|
| [OAuth Connectors](#-oauth-connectors) | Let Lumen read your Google/Slack/etc. — without using your Claude API credits |
| [Memory Wiring](#-memory-wiring) | Make Lumen remember things between conversations |
| [Artifacts Panel](#-artifacts-panel) | Show live previews of HTML/code the AI writes |
| [Per-Project System Prompt](#-per-project-system-prompt) | Give Lumen different "personalities" for different tasks |

---

## 🔗 OAuth Connectors

### What is this?
OAuth is how apps get permission to read your other accounts (Google Drive, Slack, GitHub, etc.) **without** you giving them your password. You've seen it — it's the "Sign in with Google" button. We're going to make Lumen have its own version of that.

### What "not utilizing your usage" means
When you connect a Google account, Lumen can search your Drive or Calendar using **Google's free API** — not Claude's paid API. So it costs you nothing extra.

---

### Step 1 — Create a Google Cloud Project (free, takes 5 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Sign in with your Google account
3. At the top, click the dropdown that says "Select a project" → click **New Project**
4. Name it `Lumen Local` → click **Create**
5. Wait a few seconds, then make sure `Lumen Local` is selected in the dropdown

---

### Step 2 — Turn on the APIs you want

1. In the left menu, go to **APIs & Services → Library**
2. Search for and **Enable** whichever ones you want:
   - `Google Drive API` — read/search your files
   - `Google Calendar API` — see your events
   - `Gmail API` — read/send email
   - `Google Docs API` — read documents

> 💡 You can enable more later. Start with just Drive.

---

### Step 3 — Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. If it asks you to configure a "consent screen" first:
   - Click **Configure Consent Screen**
   - Choose **External** → click Create
   - App name: `Lumen` | Your email in the support field | click Save and Continue through all steps
   - On the last screen, click **Back to Dashboard**
4. Back on Credentials → **+ Create Credentials → OAuth client ID**
5. Application type: choose **Desktop app**
6. Name: `Lumen Desktop`
7. Click **Create**
8. A popup shows your **Client ID** and **Client Secret** — copy both somewhere safe (like Notepad)

---

### Step 4 — Add the credentials to Lumen

Open this file in VS Code or Notepad:
```
C:\Users\willi\OneDrive\Documents\Claude\Projects\Self Hosted AI\tower-ai-app\main.js
```

Near the top, add a new section like this:

```js
// OAuth credentials — paste yours here
const OAUTH_CONFIG = {
  google: {
    clientId: 'PASTE_YOUR_CLIENT_ID_HERE',
    clientSecret: 'PASTE_YOUR_CLIENT_SECRET_HERE',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/calendar.readonly'
    ]
  }
};
```

---

### Step 5 — Install the Google auth library

Open a terminal (Win+R → type `cmd` → Enter) and run:

```
cd "C:\Users\willi\OneDrive\Documents\Claude\Projects\Self Hosted AI\tower-ai-app"
npm install googleapis electron-oauth2
```

---

### Step 6 — Wire the login button in main.js

Add this function to `main.js`. It opens a small login window when the user clicks "Connect Google":

```js
const { BrowserWindow } = require('electron');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Where we save the token so the user stays logged in
const TOKEN_PATH = path.join(app.getPath('userData'), 'google_token.json');

function getOAuthClient() {
  return new google.auth.OAuth2(
    OAUTH_CONFIG.google.clientId,
    OAUTH_CONFIG.google.clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'  // This means "desktop app, show me the code"
  );
}

async function connectGoogle(mainWindow) {
  const oAuth2Client = getOAuthClient();

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: OAUTH_CONFIG.google.scopes,
  });

  // Open a small popup window with the Google login page
  const authWindow = new BrowserWindow({
    width: 600, height: 700,
    parent: mainWindow,
    modal: true,
    webPreferences: { nodeIntegration: false }
  });
  authWindow.loadURL(authUrl);

  // Listen for the redirect that has the auth code
  authWindow.webContents.on('will-redirect', async (event, url) => {
    if (url.startsWith('http://localhost') || url.includes('code=')) {
      const urlParams = new URL(url);
      const code = urlParams.searchParams.get('code');
      authWindow.close();

      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);

      // Save the token for next time
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      mainWindow.webContents.send('google-connected', true);
    }
  });
}

// Handle the connect button from the renderer
ipcMain.handle('connect-google', async (event) => {
  await connectGoogle(BrowserWindow.getFocusedWindow());
  return { success: true };
});
```

---

### Step 7 — Add the button in the Settings UI

In `renderer/index.html`, find the Connectors section in Settings and add:

```html
<div class="settings-row">
  <div class="settings-label">
    <span>Google Account</span>
    <span class="settings-desc">Drive, Calendar, Gmail</span>
  </div>
  <button class="btn-secondary" id="btn-connect-google">Connect</button>
</div>
```

In `renderer/app.js`, add:

```js
document.getElementById('btn-connect-google')?.addEventListener('click', async () => {
  const result = await window.electronAPI.invoke('connect-google');
  if (result.success) {
    document.getElementById('btn-connect-google').textContent = '✓ Connected';
    document.getElementById('btn-connect-google').disabled = true;
  }
});
```

In `preload.js`, make sure `invoke` is exposed (it probably already is):
```js
invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
```

---

### Step 8 — Test it

1. Run `npm start` in the terminal
2. Go to Settings → Connectors
3. Click **Connect** next to Google Account
4. A Google login window should open
5. Sign in, approve the permissions
6. The button should change to ✓ Connected

---

### Using the Google data in chat

Once connected, you can call the Drive API in any IPC handler:

```js
async function searchDrive(query) {
  const oAuth2Client = getOAuthClient();
  const savedToken = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(savedToken);

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const res = await drive.files.list({
    q: `name contains '${query}'`,
    fields: 'files(id, name, webViewLink)',
    pageSize: 10
  });
  return res.data.files;
}
```

---

---

## 🧠 Memory Wiring

### What is this?
Right now every conversation in Lumen starts fresh — the AI doesn't remember what you talked about yesterday. Memory wiring fixes that by saving important facts to a file and injecting them into every new conversation.

---

### Step 1 — Create the memory file

In your app folder, create a new file:
```
C:\Users\willi\OneDrive\Documents\Claude\Projects\Self Hosted AI\tower-ai-app\user_memory.json
```

Start it with this content:
```json
{
  "facts": [],
  "preferences": {},
  "lastUpdated": ""
}
```

---

### Step 2 — Add memory handlers in main.js

```js
const MEMORY_PATH = path.join(app.getPath('userData'), 'lumen_memory.json');

function loadMemory() {
  if (fs.existsSync(MEMORY_PATH)) {
    return JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf-8'));
  }
  return { facts: [], preferences: {} };
}

function saveMemory(memory) {
  memory.lastUpdated = new Date().toISOString();
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2));
}

ipcMain.handle('get-memory', () => loadMemory());
ipcMain.handle('save-memory', (event, memory) => {
  saveMemory(memory);
  return true;
});
ipcMain.handle('add-memory-fact', (event, fact) => {
  const memory = loadMemory();
  memory.facts.push({ text: fact, added: new Date().toISOString() });
  saveMemory(memory);
  return memory;
});
```

---

### Step 3 — Inject memory into every chat message

In `app.js`, find the function where you build the messages array that gets sent to Ollama (look for where you create the `messages: [...]` array). Update it to prepend a system message with the memory:

```js
async function buildMessages(userMessage) {
  const memory = await window.electronAPI.invoke('get-memory');

  let systemPrompt = 'You are Lumen, a helpful AI assistant running locally.';

  if (memory.facts.length > 0) {
    const factList = memory.facts.map(f => `- ${f.text}`).join('\n');
    systemPrompt += `\n\nThings you know about the user:\n${factList}`;
  }

  return [
    { role: 'system', content: systemPrompt },
    // ... your existing conversation history ...
    { role: 'user', content: userMessage }
  ];
}
```

---

### Step 4 — Add a "Remember this" button

In the chat UI, add a small button next to each AI message to save important info:

In `index.html` (inside your message template or where messages are rendered):
```html
<!-- Add this inside each message bubble -->
<button class="btn-remember" title="Remember this fact">📌</button>
```

In `app.js`:
```js
// When user clicks the pin button on a message
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('btn-remember')) {
    const messageText = e.target.closest('.message').querySelector('.message-text').textContent;
    const fact = prompt('What should Lumen remember?\n\n(You can edit this)', messageText.slice(0, 100));
    if (fact) {
      await window.electronAPI.invoke('add-memory-fact', fact);
      e.target.textContent = '✓';
    }
  }
});
```

---

### Step 5 — Add a Memory tab in Settings

In the Settings panel, add a section to view/delete memories:

```html
<!-- In index.html settings panel -->
<div class="settings-section">
  <div class="settings-section-title">Saved Memories</div>
  <div id="memory-list"><!-- populated by JS --></div>
  <button class="btn-secondary" id="btn-clear-memory">Clear All Memories</button>
</div>
```

```js
// In app.js — load memories into the settings panel
async function renderMemoryList() {
  const memory = await window.electronAPI.invoke('get-memory');
  const list = document.getElementById('memory-list');
  if (!list) return;

  if (memory.facts.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No memories saved yet.</p>';
    return;
  }

  list.innerHTML = memory.facts.map((f, i) => `
    <div class="memory-item">
      <span>${f.text}</span>
      <button class="btn-delete-memory" data-index="${i}">✕</button>
    </div>
  `).join('');
}

document.getElementById('btn-clear-memory')?.addEventListener('click', async () => {
  if (confirm('Delete all memories?')) {
    await window.electronAPI.invoke('save-memory', { facts: [], preferences: {} });
    renderMemoryList();
  }
});
```

---

---

## 🖼 Artifacts Panel

### What is this?
When the AI writes HTML, a React component, or some code — instead of just showing raw text, a live preview panel pops up on the right side so you can see it rendered in real-time. Like Claude.ai's Artifacts.

---

### Step 1 — Add the panel HTML

In `index.html`, find the main chat layout (probably a `#chat-area` div). Add a sidebar next to it:

```html
<!-- Add this NEXT TO your existing #chat-area, inside the same parent -->
<div id="artifact-panel" class="artifact-panel" style="display:none;">
  <div class="artifact-header">
    <span id="artifact-title">Preview</span>
    <div class="artifact-controls">
      <button id="btn-artifact-copy" title="Copy code">Copy</button>
      <button id="btn-artifact-close" title="Close">✕</button>
    </div>
  </div>
  <webview id="artifact-preview" src="about:blank" sandbox="allow-scripts"></webview>
</div>
```

> ⚠️ We use `<webview>` (not `<iframe>`) because Electron's webview is sandboxed and safe for running untrusted HTML.

---

### Step 2 — Add the CSS

In `style.css`, add:

```css
/* Artifacts Panel */
.artifact-panel {
  width: 45%;
  min-width: 300px;
  background: var(--bg-panel);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.artifact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-toolbar);
  font-size: 13px;
  color: var(--text-primary);
}
.artifact-controls {
  display: flex;
  gap: 6px;
}
#artifact-preview {
  flex: 1;
  border: none;
  background: white; /* always white inside the preview */
}
```

---

### Step 3 — Detect artifacts in AI responses

In `app.js`, after receiving the AI's response, scan it for code blocks. If one contains HTML, show the panel:

```js
function detectArtifact(responseText) {
  // Look for ```html ... ``` blocks
  const htmlMatch = responseText.match(/```html\n([\s\S]*?)```/);
  if (htmlMatch) {
    return { type: 'html', code: htmlMatch[1] };
  }

  // Look for ```jsx ... ``` blocks
  const jsxMatch = responseText.match(/```jsx\n([\s\S]*?)```/);
  if (jsxMatch) {
    return { type: 'jsx', code: jsxMatch[1] };
  }

  return null;
}

function showArtifact(artifact) {
  const panel = document.getElementById('artifact-panel');
  const preview = document.getElementById('artifact-preview');
  const title = document.getElementById('artifact-title');

  panel.style.display = 'flex';
  title.textContent = artifact.type === 'html' ? 'HTML Preview' : 'Code Preview';

  if (artifact.type === 'html') {
    // Write the HTML directly into the webview
    preview.srcdoc = artifact.code;
  }
}

// Call this after the AI responds:
// const artifact = detectArtifact(aiResponseText);
// if (artifact) showArtifact(artifact);
```

---

### Step 4 — Wire the close and copy buttons

```js
document.getElementById('btn-artifact-close')?.addEventListener('click', () => {
  document.getElementById('artifact-panel').style.display = 'none';
});

document.getElementById('btn-artifact-copy')?.addEventListener('click', () => {
  // Get the last artifact code that was shown
  const code = document.getElementById('artifact-preview').getAttribute('data-source') || '';
  navigator.clipboard.writeText(code);
  document.getElementById('btn-artifact-copy').textContent = 'Copied!';
  setTimeout(() => { document.getElementById('btn-artifact-copy').textContent = 'Copy'; }, 1500);
});
```

---

### Step 5 — Enable webview in main.js

Electron requires you to explicitly allow webviews. In `main.js`, when creating the BrowserWindow, make sure you have:

```js
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  webviewTag: true,        // ← ADD THIS
  preload: path.join(__dirname, 'preload.js')
}
```

---

---

## 🗂 Per-Project System Prompt

### What is this?
Right now Lumen has one personality for everything. Per-project system prompts let you create "projects" — like "Coding Helper" or "Recipe Assistant" — each with their own instructions to the AI. Switch projects and the AI instantly changes how it behaves.

---

### Step 1 — Add projects to your settings storage

In `main.js`, your settings are probably stored in a JSON file. Add a `projects` section:

```js
// In your existing getSettings / saveSettings logic, add projects support
function getDefaultSettings() {
  return {
    // ... your existing defaults ...
    projects: [
      {
        id: 'default',
        name: 'General',
        icon: '💬',
        systemPrompt: 'You are Lumen, a helpful AI assistant running locally on an Unraid server.',
        createdAt: new Date().toISOString()
      }
    ],
    activeProjectId: 'default'
  };
}
```

---

### Step 2 — Add IPC handlers

```js
ipcMain.handle('get-projects', () => {
  const settings = loadSettings(); // your existing settings loader
  return settings.projects || [];
});

ipcMain.handle('save-project', (event, project) => {
  const settings = loadSettings();
  const idx = settings.projects.findIndex(p => p.id === project.id);
  if (idx >= 0) {
    settings.projects[idx] = project;
  } else {
    settings.projects.push(project);
  }
  saveSettings(settings);
  return true;
});

ipcMain.handle('delete-project', (event, projectId) => {
  const settings = loadSettings();
  settings.projects = settings.projects.filter(p => p.id !== projectId);
  saveSettings(settings);
  return true;
});

ipcMain.handle('set-active-project', (event, projectId) => {
  const settings = loadSettings();
  settings.activeProjectId = projectId;
  saveSettings(settings);
  return true;
});
```

---

### Step 3 — Add a Projects section in the sidebar

In `index.html`, find your sidebar (`#sidebar`) and add a projects list above the conversations:

```html
<!-- Add near the top of your sidebar, below the New Chat button -->
<div id="project-switcher">
  <div class="sidebar-section-label">Project</div>
  <div id="project-list">
    <!-- Populated by JS -->
  </div>
  <button class="btn-new-project" id="btn-new-project">+ New Project</button>
</div>
```

---

### Step 4 — Render projects in the sidebar

```js
async function renderProjects() {
  const projects = await window.electronAPI.invoke('get-projects');
  const settings = await window.electronAPI.invoke('get-settings');
  const activeId = settings.activeProjectId;

  const list = document.getElementById('project-list');
  if (!list) return;

  list.innerHTML = projects.map(p => `
    <button class="project-item ${p.id === activeId ? 'active' : ''}" data-project-id="${p.id}">
      <span class="project-icon">${p.icon || '💬'}</span>
      <span class="project-name">${p.name}</span>
    </button>
  `).join('');

  // Click to switch
  list.querySelectorAll('.project-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.electronAPI.invoke('set-active-project', btn.dataset.projectId);
      renderProjects(); // re-render to update the active highlight
    });
  });
}
```

---

### Step 5 — Add a "New Project" modal

```js
document.getElementById('btn-new-project')?.addEventListener('click', () => {
  showProjectModal(null); // null = create new
});

function showProjectModal(existingProject) {
  const isNew = !existingProject;
  const name = prompt(isNew ? 'Project name:' : 'Edit name:', existingProject?.name || 'New Project');
  if (!name) return;

  const systemPrompt = prompt(
    'System prompt (instructions for the AI in this project):',
    existingProject?.systemPrompt || 'You are a helpful assistant.'
  );
  if (systemPrompt === null) return;

  const project = {
    id: existingProject?.id || `project_${Date.now()}`,
    name,
    icon: '📁',
    systemPrompt,
    createdAt: existingProject?.createdAt || new Date().toISOString()
  };

  window.electronAPI.invoke('save-project', project).then(() => {
    renderProjects();
  });
}
```

> 💡 The `prompt()` calls are just plain browser dialogs — they work fine in Electron for quick input. You can replace with a custom modal later when it feels too plain.

---

### Step 6 — Use the active project's system prompt in chat

In `app.js`, wherever you build the message array for Ollama, pull in the active project:

```js
async function getActiveSystemPrompt() {
  const [projects, settings] = await Promise.all([
    window.electronAPI.invoke('get-projects'),
    window.electronAPI.invoke('get-settings')
  ]);
  const active = projects.find(p => p.id === settings.activeProjectId);
  return active?.systemPrompt || 'You are Lumen, a helpful AI assistant.';
}

// Then in your message builder:
const systemPrompt = await getActiveSystemPrompt();
const messages = [
  { role: 'system', content: systemPrompt },
  ...conversationHistory,
  { role: 'user', content: userInput }
];
```

---

### Step 7 — Add CSS for projects

In `style.css`:

```css
#project-switcher {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.project-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 8px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background .15s, color .15s;
}
.project-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.project-item.active {
  background: var(--accent-dim);
  color: var(--accent);
}
.btn-new-project {
  width: 100%;
  margin-top: 4px;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px dashed var(--border-strong);
  background: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all .15s;
}
.btn-new-project:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}
```

---

## ✅ Done! What to tackle first

| Order | Feature | Why first |
|---|---|---|
| 1 | Per-project system prompt | Easiest, highest impact, no external dependencies |
| 2 | Memory wiring | Purely local, no accounts needed |
| 3 | Artifacts panel | Makes Lumen feel dramatically more capable |
| 4 | OAuth / Google | Needs a Google account setup, save for last |

Come back with any errors and paste the exact error message — we'll fix it together.
