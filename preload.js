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
});
