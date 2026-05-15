const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => '1.0.0',
  getPlatform: () => process.platform,

  // Global shortcuts
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

  // Tray state (takes running + optional elapsedMs)
    updateRunningState: (running, elapsedMs, isDistracted, distractionName, distractionElapsed) => ipcRenderer.invoke('update-running-state', running, elapsedMs, isDistracted, distractionName, distractionElapsed),

  // Close confirmation
  onBeforeClose: (callback) => {
    ipcRenderer.on('before-close', () => callback());
  },

  removeBeforeCloseListener: () => {
    ipcRenderer.removeAllListeners('before-close');
  },

  confirmQuit: () => {
    return ipcRenderer.invoke('confirm-quit');
  },

  getIsRunning: () => {
    return ipcRenderer.invoke('get-is-running');
  },

  // Main window: respond when mini window requests current stopwatch state
  onGetStopwatchState: (callback) => {
    ipcRenderer.on('get-stopwatch-state', () => callback());
  },

  removeGetStopwatchStateListener: () => {
    ipcRenderer.removeAllListeners('get-stopwatch-state');
  },

  // Mini window: receive stopwatch state updates from main process
  onStopwatchStateUpdate: (callback) => {
    ipcRenderer.on('stopwatch-state-update', (event, data) => callback(data));
  },
  
  removeStopwatchStateListener: () => {
    ipcRenderer.removeAllListeners('stopwatch-state-update');
  },

  // Mini window: restore main window (close mini, show main)
  restoreMainWindow: () => {
    ipcRenderer.invoke('restore-main-window');
  },

  // Mini window: send stopwatch command to main window (toggle, lap, flag)
  sendStopwatchCommand: (command) => {
    ipcRenderer.send('mini-command', command);
  },

  // Mini window: minimize to tray (close mini, main stays hidden)
  minimizeToTray: () => {
    ipcRenderer.invoke('minimize-to-tray');
  },

  // Mini window: send current elapsed time to main window before restoring
  sendElapsedToMain: (elapsedMs) => {
    ipcRenderer.send('sync-elapsed-to-main', elapsedMs);
  },

  // Main window: receive synced elapsed time from mini window
  onSyncElapsedFromMini: (callback) => {
    ipcRenderer.on('sync-elapsed-from-mini', (event, elapsedMs) => callback(elapsedMs));
  },

  removeSyncElapsedFromMiniListener: () => {
    ipcRenderer.removeAllListeners('sync-elapsed-from-mini');
  },

  // Mini window: restore main window and trigger close confirmation
  restoreMainWindowAndClose: () => {
    ipcRenderer.invoke('restore-main-window-and-close');
  },

  resizeMiniWindow: (width, height) => {
    ipcRenderer.invoke('resize-mini-window', width, height);
  },

  // Mini window: send distraction name + stop command together
  sendDistractionWithName: (name) => {
    ipcRenderer.send('distraction-stop-with-name', name);
  },

  // Main window: receive distraction name + auto-stop
  onDistractionStopWithName: (callback) => {
    ipcRenderer.on('distraction-stop-with-name', (event, name) => callback(name));
  },

  removeDistractionStopWithNameListener: () => {
    ipcRenderer.removeAllListeners('distraction-stop-with-name');
  },

  // Mini window: focus/blur translucency
  onWindowBlur: (callback) => {
    ipcRenderer.on('window-blur', () => callback());
  },
  removeWindowBlurListener: () => {
    ipcRenderer.removeAllListeners('window-blur');
  },
  onWindowFocus: (callback) => {
    ipcRenderer.on('window-focus', () => callback());
  },
  removeWindowFocusListener: () => {
    ipcRenderer.removeAllListeners('window-focus');
  },

  focusMiniWindow: () => {
    ipcRenderer.send('focus-mini-window');
  },
  
  setMiniMaxSize: (width, height) => {
    ipcRenderer.invoke('set-mini-max-size', width, height);
  },

  setMiniMinSize: (width, height) => {
    ipcRenderer.invoke('set-mini-min-size', width, height);
  },
  
});