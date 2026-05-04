const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('lumenShell', {
  isElectron: true,
  minimize: () => ipcRenderer.send('lumen:window-minimize'),
  toggleMaximize: () => ipcRenderer.send('lumen:window-toggle-maximize'),
  close: () => ipcRenderer.send('lumen:window-close'),
})
