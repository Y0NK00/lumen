const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

let mainWindow;
const userDataPath = app.getPath('userData');
const conversationsFile = path.join(userDataPath, 'conversations.json');
const settingsFile      = path.join(userDataPath, 'settings.json');
const connectorsFile    = path.join(userDataPath, 'connectors.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
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
