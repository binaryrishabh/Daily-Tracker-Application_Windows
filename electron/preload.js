const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => '1.0.0',
  getPlatform: () => process.platform,

  onGlobalShortcut: (callback) => {
    ipcRenderer.on('global-shortcut', (event, key) => callback(key));
  },

  removeGlobalShortcutListener: () => {
    ipcRenderer.removeAllListeners('global-shortcut');
  },

  // Database
  saveSession: (session) => ipcRenderer.invoke('db:save-session', session),
  getSessions: () => ipcRenderer.invoke('db:get-sessions'),
  deleteSession: (id) => ipcRenderer.invoke('db:delete-session', id),
  getSessionsByDate: (date) => ipcRenderer.invoke('db:get-sessions-by-date', date),

  // Tray state
  updateRunningState: (running) => ipcRenderer.invoke('update-running-state', running),
});