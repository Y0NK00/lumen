/**
 * Electron shell: frameless window, custom title bar controls, resizable PWA.
 * Dev: start Vite (`npm run dev`), then: npm run electron:dev
 * Prod: set LUMEN_APP_URL to your deployed origin (default dev: http://localhost:5173).
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

const startUrl = process.env.LUMEN_APP_URL || 'http://localhost:5173'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 480,
    minHeight: 400,
    title: 'Lumen',
    show: false,
    frame: false,
    backgroundColor: '#080810',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.cjs'),
    },
  })

  win.once('ready-to-show', () => win.show())
  win.loadURL(startUrl).catch((err) => {
    console.error('[lumen-electron] Failed to load URL', startUrl, err)
  })
}

ipcMain.on('lumen:window-minimize', (event) => {
  const w = BrowserWindow.fromWebContents(event.sender)
  w?.minimize()
})

ipcMain.on('lumen:window-toggle-maximize', (event) => {
  const w = BrowserWindow.fromWebContents(event.sender)
  if (!w) return
  if (w.isMaximized()) w.unmaximize()
  else w.maximize()
})

ipcMain.on('lumen:window-close', (event) => {
  const w = BrowserWindow.fromWebContents(event.sender)
  w?.close()
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
