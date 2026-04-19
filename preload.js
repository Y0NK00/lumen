const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tower', {
  // Window
  minimize:  () => ipcRenderer.send('win:minimize'),
  maximize:  () => ipcRenderer.send('win:maximize'),
  close:     () => ipcRenderer.send('win:close'),

  // Open a conversation in its own window
  openConversationWindow: (conversationId) => {
    ipcRenderer.send('win:openConversation', { conversationId })
  },

  // Maximize state sync
  onWindowMaximized: (cb) => ipcRenderer.on('win:maximized', cb),
  offWindowMaximized: (cb) => ipcRenderer.removeListener('win:maximized', cb),

  // Folder picker dialog (used by Helm Working Folders widget)
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),

  // Data
  loadConversations: ()  => ipcRenderer.invoke('data:loadConversations'),
  saveConversations: (v) => ipcRenderer.invoke('data:saveConversations', v),
  loadSettings:      ()  => ipcRenderer.invoke('data:loadSettings'),
  saveSettings:      (v) => ipcRenderer.invoke('data:saveSettings', v),
  loadConnectors:    ()  => ipcRenderer.invoke('data:loadConnectors'),
  saveConnectors:    (v) => ipcRenderer.invoke('data:saveConnectors', v),

  // Terminal
  runCommand: (cmd)           => ipcRenderer.invoke('terminal:run', cmd),

  // File system
  readFile:   (path)          => ipcRenderer.invoke('fs:readFile', path),
  writeFile:  (path, content) => ipcRenderer.invoke('fs:writeFile', path, content),
  listDir:    (path)          => ipcRenderer.invoke('fs:listDir', path),

  // Google OAuth
  connectGoogle:     () => ipcRenderer.invoke('connect-google'),
  onGoogleConnected: (cb) => ipcRenderer.on('google-connected', cb),
  onGoogleError:     (cb) => ipcRenderer.on('google-error', cb),

  // ── Claude API streaming ───────────────────────────────────────────────────
  startClaudeStream: (requestId, messages, model, apiKey) => {
    ipcRenderer.send('claude-stream-start', { requestId, messages, model, apiKey })
  },

  abortClaudeStream: (requestId) => {
    ipcRenderer.send('claude-stream-abort', { requestId })
  },

  onClaudeChunk: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('claude-chunk', handler)
    return () => ipcRenderer.removeListener('claude-chunk', handler)
  },

  onClaudeDone: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('claude-done', handler)
    return () => ipcRenderer.removeListener('claude-done', handler)
  },

  onClaudeError: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('claude-error', handler)
    return () => ipcRenderer.removeListener('claude-error', handler)
  },
    onClaudeToolStart: (callback) => {
    // Payload: { requestId: string, toolId: string, toolName: string }
    const handler = (_, data) => callback(data)
    ipcRenderer.on('claude-tool-start', handler)
    return () => ipcRenderer.removeListener('claude-tool-start', handler)
  },

  onClaudeToolResult: (callback) => {
    // Payload: { requestId, toolId, toolName, input, result, success }
    const handler = (_, data) => callback(data)
    ipcRenderer.on('claude-tool-result', handler)
    return () => ipcRenderer.removeListener('claude-tool-result', handler)
  },


  // ── AI Driver BrowserView ──────────────────────────────────────────────────
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

  // ── OpenHands (Code Bot) BrowserView ──────────────────────────────────────
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
