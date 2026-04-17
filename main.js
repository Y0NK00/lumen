const { app, BrowserWindow, BrowserView, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { google } = require('googleapis');

let mainWindow;
let driverView = null;
let driverViewAttached = false;
let codeView = null;
let codeViewAttached = false;
const userDataPath = app.getPath('userData');
const conversationsFile = path.join(userDataPath, 'conversations.json');
const settingsFile      = path.join(userDataPath, 'settings.json');
const connectorsFile    = path.join(userDataPath, 'connectors.json');
const TOKEN_PATH        = path.join(userDataPath, 'google_token.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// OAuth credentials â€” loaded from oauth.config.json (gitignored, never committed)
// Copy oauth.config.example.json â†’ oauth.config.json and fill in your credentials.
let OAUTH_CONFIG = {
  google: {
    clientId: '',
    clientSecret: '',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/calendar.readonly'
    ]
  }
};
try {
  const cfgPath = path.join(__dirname, 'oauth.config.json');
  const loaded = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  if (loaded.google) OAUTH_CONFIG.google = { ...OAUTH_CONFIG.google, ...loaded.google };
} catch {
  // oauth.config.json not present â€” Google OAuth will be disabled until configured
}

// â”€â”€ Google OAuth helpers â”€â”€
const OAUTH_PORT = 9741; // Local callback port â€” must be in your Google Cloud Console authorized redirect URIs

async function connectGoogle(mainWin) {
  const http = require('http');
  const redirectUri = `http://localhost:${OAUTH_PORT}`;

  const oAuth2Client = new google.auth.OAuth2(
    OAUTH_CONFIG.google.clientId,
    OAUTH_CONFIG.google.clientSecret,
    redirectUri
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: OAUTH_CONFIG.google.scopes,
    prompt: 'consent',
  });

  return new Promise((resolve, reject) => {
    let server;
    const cleanup = () => { try { server.close(); } catch {} };

    server = http.createServer(async (req, res) => {
      try {
        const code = new URL(req.url, redirectUri).searchParams.get('code');
        if (!code) { res.end('Missing code'); return; }

        // Show a friendly success page in the browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f0f0f;color:#fff">
          <div style="text-align:center"><div style="font-size:48px">âœ…</div><h2>Connected to Google!</h2><p style="color:#888">You can close this tab and return to Lumen.</p></div>
        </body></html>`);

        cleanup();
        const { tokens } = await oAuth2Client.getToken(code);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        mainWin.webContents.send('google-connected', true);
        resolve();
      } catch (e) {
        cleanup();
        mainWin.webContents.send('google-error', e.message);
        reject(e);
      }
    });

    server.on('error', (e) => reject(new Error(`Port ${OAUTH_PORT} busy: ${e.message}`)));

    server.listen(OAUTH_PORT, 'localhost', () => {
      // Open in the user's default browser â€” avoids Electron webview quirks
      shell.openExternal(authUrl);
    });

    // Timeout after 5 minutes
    setTimeout(() => { cleanup(); reject(new Error('Google auth timed out.')); }, 300000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      webSecurity: false,
    },
  });

  const IS_V2 = process.env.LUMEN_V2 === 'true';

  const IS_DEV = !app.isPackaged;

  

  if (IS_V2 && IS_DEV) {

    mainWindow.loadURL('http://localhost:5173');

    mainWindow.webContents.openDevTools();

  } else if (IS_V2) {

    mainWindow.loadFile(path.join(__dirname, 'dist', 'renderer', 'index.html'));

  } else {

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 ADDITIONS — paste these into your existing main.js / main.ts
//
// Where to add them:
//   1. At the top of the file, add the require/import:
//      const { ipcMain } = require('electron')
//      (it's probably already imported — just add ipcMain to the destructure)
//
//   2. Paste the block below BEFORE the `app.whenReady()` call, but AFTER
//      all your `require()` / `import` statements.
// ─────────────────────────────────────────────────────────────────────────────

// Keep AbortControllers so the renderer can cancel mid-stream.
const claudeStreams = new Map()

ipcMain.on('claude-stream-start', async (event, { requestId, messages, model, apiKey }) => {
  const controller = new AbortController()
  claudeStreams.set(requestId, controller)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required when streaming
        'accept': 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 4096,
        stream: true,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      event.sender.send('claude-error', {
        requestId,
        message: `Claude API ${response.status}: ${errorText}`,
      })
      return
    }

    if (!response.body) {
      event.sender.send('claude-error', { requestId, message: 'No response body' })
      return
    }

    // ── Read the SSE stream ──────────────────────────────────────────────────
    // Claude sends Server-Sent Events (SSE), NOT plain NDJSON like Ollama.
    // Each event looks like:
    //   event: content_block_delta
    //   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
    //
    // We only care about text_delta events. Everything else we skip.

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Split on double-newline — SSE events are separated by blank lines.
      // But also handle single-newline data lines within events.
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()

        // Skip blank lines and "event:" type lines — we only care about "data:"
        if (!trimmed || trimmed.startsWith('event:')) continue

        // Skip the stream terminator
        if (trimmed === 'data: [DONE]') continue

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6))

            if (
              data.type === 'content_block_delta' &&
              data.delta?.type === 'text_delta'
            ) {
              event.sender.send('claude-chunk', {
                requestId,
                text: data.delta.text,
              })
            }

            if (data.type === 'message_stop') {
              event.sender.send('claude-done', { requestId })
              claudeStreams.delete(requestId)
              return
            }

            // Surface API-level errors embedded in the stream
            if (data.type === 'error') {
              event.sender.send('claude-error', {
                requestId,
                message: data.error?.message ?? 'Unknown API error',
              })
              claudeStreams.delete(requestId)
              return
            }
          } catch {
            // Malformed JSON in stream line — skip and continue
          }
        }
      }
    }

    // Stream ended without message_stop — treat as done
    event.sender.send('claude-done', { requestId })
  } catch (err) {
    if (err.name === 'AbortError') {
      // User deliberately cancelled — send done so renderer cleans up
      event.sender.send('claude-done', { requestId })
    } else {
      event.sender.send('claude-error', {
        requestId,
        message: err.message ?? 'Unknown error',
      })
    }
  } finally {
    claudeStreams.delete(requestId)
  }
})

ipcMain.on('claude-stream-abort', (event, { requestId }) => {
  const controller = claudeStreams.get(requestId)
  if (controller) {
    controller.abort()
    claudeStreams.delete(requestId)
  }
})

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// â”€â”€ Window controls â”€â”€
ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('win:close',    () => mainWindow?.close());

// â”€â”€ Data persistence â”€â”€
ipcMain.handle('data:loadConversations', () => readJSON(conversationsFile, []));
ipcMain.handle('data:saveConversations', (_, v) => { writeJSON(conversationsFile, v); return true; });
ipcMain.handle('data:loadSettings',      () => readJSON(settingsFile, null));
ipcMain.handle('data:saveSettings',      (_, v) => { writeJSON(settingsFile, v); return true; });
ipcMain.handle('data:loadConnectors',    () => readJSON(connectorsFile, {}));
ipcMain.handle('data:saveConnectors',    (_, v) => { writeJSON(connectorsFile, v); return true; });

// â”€â”€ Google OAuth â”€â”€
ipcMain.handle('connect-google', async () => {
  await connectGoogle(mainWindow);
  return { success: true };
});

// â”€â”€ Terminal command execution â”€â”€
ipcMain.handle('terminal:run', async (_, cmd) => {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 60000, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: err?.code ?? 0, error: err?.message });
    });
  });
});

// â”€â”€ File system helpers for Code Bot â”€â”€
ipcMain.handle('fs:readFile',  (_, filePath) => {
  try { return { content: fs.readFileSync(filePath, 'utf8'), error: null }; }
  catch (e) { return { content: null, error: e.message }; }
});
ipcMain.handle('fs:writeFile', (_, filePath, content) => {
  try { fs.writeFileSync(filePath, content, 'utf8'); return { error: null }; }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('fs:listDir', (_, dirPath) => {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    return { items: items.map(i => ({ name: i.name, isDir: i.isDirectory() })), error: null };
  } catch (e) { return { items: [], error: e.message }; }
});

// â”€â”€ AI Driver BrowserView â”€â”€
// BrowserView is main-process managed with explicit pixel bounds, avoiding the
// <webview> guest renderer viewport bug where 0px at first-load permanently
// freezes the viewport at ~150px regardless of later CSS changes.

function driverBounds({ x, y, width, height }) {
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

ipcMain.handle('driver:init', (_, { url }) => {
  if (!driverView) {
    driverView = new BrowserView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: false },
    });
    driverView.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('driver:loaded');
    });
    driverView.webContents.on('did-fail-load', (_, errCode) => {
      if (errCode !== -3) mainWindow?.webContents.send('driver:failed');
    });
  }
  driverView.webContents.loadURL(url);
  return true;
});

ipcMain.handle('driver:show', (_, bounds) => {
  if (!driverView) return;
  if (!driverViewAttached) {
    mainWindow.addBrowserView(driverView);
    driverViewAttached = true;
  }
  driverView.setBounds(driverBounds(bounds));
});

ipcMain.handle('driver:hide', () => {
  if (driverView && driverViewAttached) {
    mainWindow.removeBrowserView(driverView);
    driverViewAttached = false;
  }
});

ipcMain.handle('driver:setBounds', (_, bounds) => {
  if (driverView && driverViewAttached) driverView.setBounds(driverBounds(bounds));
});

ipcMain.handle('driver:reload', () => { driverView?.webContents.reload(); });
ipcMain.handle('driver:navigate', (_, url) => { driverView?.webContents.loadURL(url); });

// â”€â”€ OpenHands (Code Bot) BrowserView â”€â”€
ipcMain.handle('code:init', (_, { url }) => {
  if (!codeView) {
    codeView = new BrowserView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: false },
    });
    codeView.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('code:loaded');
    });
    codeView.webContents.on('did-fail-load', (_, errCode) => {
      if (errCode !== -3) mainWindow?.webContents.send('code:failed');
    });
  }
  codeView.webContents.loadURL(url);
  return true;
});

ipcMain.handle('code:show', (_, bounds) => {
  if (!codeView) return;
  if (!codeViewAttached) {
    mainWindow.addBrowserView(codeView);
    codeViewAttached = true;
  }
  codeView.setBounds(driverBounds(bounds));
});

ipcMain.handle('code:hide', () => {
  if (codeView && codeViewAttached) {
    mainWindow.removeBrowserView(codeView);
    codeViewAttached = false;
  }
});

ipcMain.handle('code:setBounds', (_, bounds) => {
  if (codeView && codeViewAttached) codeView.setBounds(driverBounds(bounds));
});

ipcMain.handle('code:reload', () => { codeView?.webContents.reload(); });
