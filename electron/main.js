const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let tray = null;
let db = null;
let SQL = null;
let isRunning = false;

// ===== Database Setup =====
async function initDatabase() {
  SQL = await require('sql.js')();
  
  const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged;
  const dbName = isDev ? 'daily-tracker-dev.db' : 'daily-tracker.db';
  const dbPath = path.join(app.getPath('userData'), dbName);

  console.log('Database path:', dbPath);
  
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
  console.log('Database ready');
}

function saveDatabase() {
  if (!db) return;
  const dbPath = path.join(app.getPath('userData'), 'daily-tracker.db');
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

  // Tray: update running state from renderer
  ipcMain.handle('update-running-state', (event, running) => {
    isRunning = running;
    updateTrayMenu();
  });

  // Check if stopwatch is running (for close confirmation)
  ipcMain.handle('get-is-running', () => {
    return isRunning;
  });

  // Handle quit request from renderer after confirmation
  ipcMain.handle('confirm-quit', () => {
    app.isQuitting = true;
    app.quit();
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

  // Launch maximized
  mainWindow.maximize();

  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Close behavior: ask renderer if stopwatch is running
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