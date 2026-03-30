const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tower', {
  // Window
  minimize:  () => ipcRenderer.send('win:minimize'),
  maximize:  () => ipcRenderer.send('win:maximize'),
  close:     () => ipcRenderer.send('win:close'),

  // Data
  loadConversations: ()  => ipcRenderer.invoke('data:loadConversations'),
  saveConversations: (v) => ipcRenderer.invoke('data:saveConversations', v),
  loadSettings:      ()  => ipcRenderer.invoke('data:loadSettings'),
  saveSettings:      (v) => ipcRenderer.invoke('data:saveSettings', v),
  loadConnectors:    ()  => ipcRenderer.invoke('data:loadConnectors'),
  saveConnectors:    (v) => ipcRenderer.invoke('data:saveConnectors', v),

  // Terminal
  runCommand: (cmd)              => ipcRenderer.invoke('terminal:run', cmd),

  // File system
  readFile:   (path)             => ipcRenderer.invoke('fs:readFile', path),
  writeFile:  (path, content)    => ipcRenderer.invoke('fs:writeFile', path, content),
  listDir:    (path)             => ipcRenderer.invoke('fs:listDir', path),

  // Google OAuth
  connectGoogle:     ()          => ipcRenderer.invoke('connect-google'),
  onGoogleConnected: (cb)        => ipcRenderer.on('google-connected', cb),
  onGoogleError:     (cb)        => ipcRenderer.on('google-error', cb),

  // AI Driver BrowserView
  driver: {
    init:      (url)    => ipcRenderer.invoke('driver:init', { url }),
    show:      (bounds) => ipcRenderer.invoke('driver:show', bounds),
    hide:      ()       => ipcRenderer.invoke('driver:hide'),
    setBounds: (bounds) => ipcRenderer.invoke('driver:setBounds', bounds),
    reload:    ()       => ipcRenderer.invoke('driver:reload'),
    navigate:  (url)    => ipcRenderer.invoke('driver:navigate', url),
    onLoaded:  (cb)     => ipcRenderer.on('driver:loaded', cb),
    onFailed:  (cb)     => ipcRenderer.on('driver:failed', cb),
  },

  // OpenHands (Code Bot) BrowserView
  code: {
    init:      (url)    => ipcRenderer.invoke('code:init', { url }),
    show:      (bounds) => ipcRenderer.invoke('code:show', bounds),
    hide:      ()       => ipcRenderer.invoke('code:hide'),
    setBounds: (bounds) => ipcRenderer.invoke('code:setBounds', bounds),
    reload:    ()       => ipcRenderer.invoke('code:reload'),
    onLoaded:  (cb)     => ipcRenderer.on('code:loaded', cb),
    onFailed:  (cb)     => ipcRenderer.on('code:failed', cb),
  },
});
