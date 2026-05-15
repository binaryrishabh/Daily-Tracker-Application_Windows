const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Disable DevTools in development too
app.on('web-contents-created', (event, contents) => {
  contents.on('before-input-event', (event, input) => {
    // Block F12, Ctrl+Shift+I, etc.
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      event.preventDefault();
    }
  });
});

let mainWindow = null;
let miniWindow = null;
let tray = null;
let db = null;
let SQL = null;
let isRunning = false;
let isMinimizingFromMini = false;  // ADD THIS LINE

async function initDatabase() {
  SQL = await require('sql.js')();
  
  const dbPath = getDbPath();
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run('PRAGMA foreign_keys = ON');
  
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      total_ms INTEGER NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS laps (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      lap_time_ms INTEGER NOT NULL,
      split_ms INTEGER NOT NULL,
      note TEXT DEFAULT '',
      flagged INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS distractions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT DEFAULT '',
      start_ms INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      timestamp TEXT NOT NULL
    )
  `);
  
  saveDatabase();
}

function countSessions() {
  try {
    const stmt = db.prepare('SELECT COUNT(*) as c FROM sessions');
    stmt.step();
    const count = stmt.getAsObject().c;
    stmt.free();
    return count;
  } catch (e) {
    return '?';
  }
}

function getDbPath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'daily-tracker.db');
  } else {
    return path.join(app.getPath('userData'), 'daily-tracker-dev.db');
  }
}

function saveDatabase() {
  if (!db) return;
  const dbPath = getDbPath();
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// ===== Tray Setup =====
function createTray() {
  const { nativeImage } = require('electron');
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  updateTrayMenu();
  
  tray.setToolTip('Daily Tracker');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: isRunning ? '⏸ Stop Stopwatch' : '▶ Start Stopwatch', 
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('global-shortcut', 'space');
        }
      }
    },
    { 
      label: '🏁 Add Lap', 
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('global-shortcut', 'l');
        }
      }
    },
    { type: 'separator' },
    { 
      label: 'Show Window', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

// ===== Database IPC Handlers =====
function setupIpcHandlers() {
  ipcMain.handle('db:save-session', (event, session) => {
    try {
      db.run('DELETE FROM laps WHERE session_id = ?', [session.id]);
      db.run('DELETE FROM distractions WHERE session_id = ?', [session.id]);
      
      db.run(`
        INSERT OR REPLACE INTO sessions (id, name, date, total_ms, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        session.id, session.name, session.date,
        session.totalMs, session.note || '',
        session.createdAt, new Date().toISOString()
      ]);
      
      for (const lap of session.laps) {
        db.run(`
          INSERT OR REPLACE INTO laps (id, session_id, number, lap_time_ms, split_ms, note, flagged, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          lap.id, session.id, lap.number,
          Math.round(lap.time), Math.round(lap.split),
          lap.note || '', lap.flagged ? 1 : 0, lap.timestamp
        ]);
      }

      for (const d of session.distractions || []) {
        db.run(`
          INSERT OR REPLACE INTO distractions (id, session_id, name, start_ms, duration_ms, note, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          d.id, session.id, d.name || '',
          Math.round(d.startMs), Math.round(d.durationMs),
          d.note || '', d.timestamp
        ]);
      }
      
      saveDatabase();
      return { success: true };
    } catch (error) {
      console.error('Save error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('restore-main-window', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.close();
    }
    if (mainWindow) {
      mainWindow.show();
      mainWindow.maximize();
      mainWindow.focus();
    }
  });

  // Mini window: restore main window, then trigger close confirmation
  ipcMain.handle('restore-main-window-and-close', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.close();
    }
    if (mainWindow) {
      mainWindow.show();
      mainWindow.maximize();
      mainWindow.focus();
      // Small delay then trigger the close dialog
      setTimeout(() => {
        mainWindow.webContents.send('before-close');
      }, 300);
    }
  });
  
  ipcMain.handle('db:get-sessions', () => {
    try {
      const sessions = [];
      let stmt = db.prepare('SELECT * FROM sessions ORDER BY date DESC');
      while (stmt.step()) {
        const s = stmt.getAsObject();
        const session = { ...s, totalMs: s.total_ms, laps: [] };
        
        let lstmt = db.prepare('SELECT * FROM laps WHERE session_id = ? ORDER BY number ASC');
        lstmt.bind([session.id]);
        while (lstmt.step()) {
          const l = lstmt.getAsObject();
          session.laps.push({ ...l, time: l.lap_time_ms, split: l.split_ms, flagged: l.flagged === 1 });
        }
        lstmt.free();

        session.distractions = [];
        let dstmt = db.prepare('SELECT * FROM distractions WHERE session_id = ? ORDER BY start_ms ASC');
        dstmt.bind([session.id]);
        while (dstmt.step()) {
          const d = dstmt.getAsObject();
          session.distractions.push({
            ...d,
            startMs: d.start_ms,
            durationMs: d.duration_ms,
          });
        }
        dstmt.free();
        
        sessions.push(session);
      }
      stmt.free();
      return sessions;
    } catch (e) {
      console.error(e);
      return [];
    }
  });
  
  ipcMain.handle('db:delete-session', (event, id) => {
    try {
      db.run('DELETE FROM laps WHERE session_id = ?', [id]);
      db.run('DELETE FROM distractions WHERE session_id = ?', [id]);
      db.run('DELETE FROM sessions WHERE id = ?', [id]);
      saveDatabase();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  
  ipcMain.handle('db:get-sessions-by-date', (event, date) => {
    try {
      const sessions = [];
      let stmt = db.prepare("SELECT * FROM sessions WHERE date LIKE ? ORDER BY created_at ASC");
      stmt.bind([`${date}%`]);
      while (stmt.step()) {
        const s = stmt.getAsObject();
        sessions.push({ ...s, totalMs: s.total_ms, laps: [] });
      }
      stmt.free();
      return sessions;
    } catch (e) {
      return [];
    }
  });

  // Tray + Mini window: update running state and forward to mini window
  ipcMain.handle('update-running-state', (event, running, elapsedMs, isDistracted, distractionName, distractionElapsed) => {
    isRunning = running;
    updateTrayMenu();
    
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('stopwatch-state-update', {
        isRunning: running,
        elapsedMs: elapsedMs || 0,
        isDistracted: isDistracted || false,
        distractionName: distractionName || '',
        distractionElapsed: distractionElapsed || 0,
      });
    }
  });

  ipcMain.handle('get-is-running', () => {
    return isRunning;
  });

  ipcMain.handle('confirm-quit', () => {
    app.isQuitting = true;
    app.quit();
  });

  // Mini window sends stopwatch commands → forward to main window
    ipcMain.on('mini-command', (event, command) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    
    // Map mini window commands to the shortcuts the main window understands
    switch (command) {
      case 'toggle':
        mainWindow.webContents.send('global-shortcut', 'space');
        break;
      case 'd':
        mainWindow.webContents.send('global-shortcut', 'd');
        break;
      case 'reset':
        mainWindow.webContents.send('global-shortcut', 'ctrl+r');
        break;
      case 'save':
        mainWindow.webContents.send('global-shortcut', 'ctrl+s');
        break;
      default:
        mainWindow.webContents.send('global-shortcut', command);
    }
  });

  // Mini window: close mini window, keep main hidden (true minimize)
  ipcMain.handle('minimize-to-tray', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.close();
    }
    if (mainWindow) {
      isMinimizingFromMini = true;  // Set flag to skip interceptor
      mainWindow.show();
      mainWindow.minimize();
    }
  });

  // Mini window syncs its elapsed time back to main window before restoring
  ipcMain.on('sync-elapsed-to-main', (event, elapsedMs) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync-elapsed-from-mini', elapsedMs);
    }
  });

  ipcMain.handle('resize-mini-window', (event, width, height) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      const [currentX, currentY] = miniWindow.getPosition();
      
      miniWindow.hide();
      miniWindow.setBounds({ x: currentX, y: currentY, width, height });
      miniWindow.show();
    }
  });

  // Mini window: stop distraction with name
  ipcMain.on('distraction-stop-with-name', (event, name) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Set the name first, then trigger distraction toggle
      mainWindow.webContents.send('distraction-stop-with-name', name);
    }
  });

  ipcMain.on('focus-mini-window', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.focus();
    }
  });

  ipcMain.handle('set-mini-max-size', (event, width, height) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.setMaximumSize(width, height);
    }
  });

  ipcMain.handle('set-mini-min-size', (event, width, height) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.setMinimumSize(width, height);
    }
  });

}

// ===== Mini Window (floating overlay) =====
function createMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.focus();
    return;
  }

  miniWindow = new BrowserWindow({
    width: 220,
    height: 200,
    minWidth: 100,
    minHeight: 22,
    maxWidth: 320,
    maxHeight: 350,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    miniWindow.loadURL('http://localhost:5173/mini.html');
  } else {
    miniWindow.loadFile(path.join(__dirname, '..', 'dist', 'mini.html'));
  }

  miniWindow.once('ready-to-show', () => {
    miniWindow.show();
    miniWindow.focus();  // ADD THIS - grab focus immediately
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    miniWindow.setPosition(width - 300, height - 260);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('get-stopwatch-state');
    }
  });

  miniWindow.on('blur', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('window-blur');
    }
  });

  miniWindow.on('focus', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('window-focus');
    }
  });

  miniWindow.on('closed', () => {
    miniWindow = null;
  });
}

// ===== Window Creation =====
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Daily Tracker',
    show: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.maximize();

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize → show floating mini window
  mainWindow.on('minimize', (event) => {
    if (isMinimizingFromMini) {
      isMinimizingFromMini = false;
      return;
    }
    event.preventDefault();
    createMiniWindow();
    mainWindow.hide();
  });

  // Always maximize when shown (restore from taskbar or mini window)
  mainWindow.on('show', () => {
    mainWindow.maximize();
  });

  // Close behavior
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.webContents.send('before-close');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ===== App Lifecycle =====
app.whenReady().then(async () => {
  await initDatabase();
  setupIpcHandlers();
  createWindow();
  createTray();
  
  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3 * 60 * 60 * 1000);
});

app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.close();
  }
  if (db) db.close();
});

app.on('window-all-closed', () => {
  // Don't quit on window close — dialog or tray handles it
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});