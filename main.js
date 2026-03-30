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

// OAuth credentials — loaded from oauth.config.json (gitignored, never committed)
// Copy oauth.config.example.json → oauth.config.json and fill in your credentials.
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
  // oauth.config.json not present — Google OAuth will be disabled until configured
}

// ── Google OAuth helpers ──
const OAUTH_PORT = 9741; // Local callback port — must be in your Google Cloud Console authorized redirect URIs

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
          <div style="text-align:center"><div style="font-size:48px">✅</div><h2>Connected to Google!</h2><p style="color:#888">You can close this tab and return to Lumen.</p></div>
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
      // Open in the user's default browser — avoids Electron webview quirks
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

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── Window controls ──
ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('win:close',    () => mainWindow?.close());

// ── Data persistence ──
ipcMain.handle('data:loadConversations', () => readJSON(conversationsFile, []));
ipcMain.handle('data:saveConversations', (_, v) => { writeJSON(conversationsFile, v); return true; });
ipcMain.handle('data:loadSettings',      () => readJSON(settingsFile, null));
ipcMain.handle('data:saveSettings',      (_, v) => { writeJSON(settingsFile, v); return true; });
ipcMain.handle('data:loadConnectors',    () => readJSON(connectorsFile, {}));
ipcMain.handle('data:saveConnectors',    (_, v) => { writeJSON(connectorsFile, v); return true; });

// ── Google OAuth ──
ipcMain.handle('connect-google', async () => {
  await connectGoogle(mainWindow);
  return { success: true };
});

// ── Terminal command execution ──
ipcMain.handle('terminal:run', async (_, cmd) => {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 60000, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: err?.code ?? 0, error: err?.message });
    });
  });
});

// ── File system helpers for Code Bot ──
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

// ── AI Driver BrowserView ──
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

// ── OpenHands (Code Bot) BrowserView ──
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
