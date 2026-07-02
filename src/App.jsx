import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import Stopwatch from './Stopwatch';
import History from './History';
import Stats from './Stats';
import './App.css';
import ToastContainer from './components/Toast';
import { showToast } from './components/Toast';

{/* Uncomment this while in development for devPanel */}
import DevPanel from './components/DevPanel';

// Helper: returns ISO string in local time (not UTC)
function getLocalISOString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [laps, setLaps] = useState([]);
  const [currentNote, setCurrentNote] = useState('');
  const [sessionStart, setSessionStart] = useState(null);
  const [sessionName, setSessionName] = useState('');
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Distraction state
  const [isDistracted, setIsDistracted] = useState(false);
  const [distractionElapsed, setDistractionElapsed] = useState(0);
  const [distractions, setDistractions] = useState([]);
  const [currentDistractionName, setCurrentDistractionName] = useState('');
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  const startTimeRef = useRef(null);
  const accumulatedRef = useRef(0);
  const animationFrameRef = useRef(null);
  const isRunningRef = useRef(false);

  const distractionStartRef = useRef(null);
  const distractionAccumulatedRef = useRef(0);
  const distractionFrameRef = useRef(null);
  const currentDistractionStartMs = useRef(0);

  const elapsedMsRef = useRef(0);
  const isRunningRefForClose = useRef(false);

  useEffect(() => {
    const realElapsed = startTimeRef.current 
      ? accumulatedRef.current + (performance.now() - startTimeRef.current)
      : accumulatedRef.current;
    
    const realDistractionElapsed = distractionStartRef.current
      ? distractionAccumulatedRef.current + (performance.now() - distractionStartRef.current)
      : distractionAccumulatedRef.current;
    
    if (window.electronAPI) {
      window.electronAPI.updateRunningState(
        isRunning, 
        Math.round(realElapsed), 
        isDistracted, 
        currentDistractionName,
        Math.round(realDistractionElapsed)
      );
    }
  }, [isRunning, elapsedMs, isDistracted, distractionElapsed]);


  // Handle close confirmation
  useEffect(() => {
    elapsedMsRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    isRunningRefForClose.current = isRunning;
  }, [isRunning]);

    // Handle close confirmation
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onBeforeClose(async () => {
        // Use refs to get current values, not stale closure values
        const running = isRunningRefForClose.current;
        const time = elapsedMsRef.current;
        
        if (running || time > 0) {
          setShowCloseDialog(true);
        } else {
          window.electronAPI.confirmQuit();
        }
      });
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeBeforeCloseListener();
      }
    };
  }, []); // Empty dependency array — refs give us fresh values

  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  const updateDisplay = useCallback(() => {
    if (startTimeRef.current) {
      const now = performance.now();
      setElapsedMs(accumulatedRef.current + (now - startTimeRef.current));
      animationFrameRef.current = requestAnimationFrame(updateDisplay);
    }
  }, []);

  const updateDistractionDisplay = useCallback(() => {
    if (distractionStartRef.current) {
      const now = performance.now();
      setDistractionElapsed(distractionAccumulatedRef.current + (now - distractionStartRef.current));
      distractionFrameRef.current = requestAnimationFrame(updateDistractionDisplay);
    }
  }, []);

  const startStopwatch = useCallback(() => {
    if (!isRunningRef.current) {
      startTimeRef.current = performance.now();
      if (!sessionStart) setSessionStart(getLocalISOString());
      setIsRunning(true);
      isRunningRef.current = true;
      animationFrameRef.current = requestAnimationFrame(updateDisplay);
    }
  }, [sessionStart, updateDisplay]);

  const stopStopwatch = useCallback(() => {
    if (isRunningRef.current) {
      accumulatedRef.current += performance.now() - startTimeRef.current;
      startTimeRef.current = null;
      setIsRunning(false);
      isRunningRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  const toggleStopwatch = useCallback(() => {
    if (isRunningRef.current) stopStopwatch();
    else startStopwatch();
  }, [startStopwatch, stopStopwatch]);

  const startDistraction = useCallback(() => {
    if (!isDistracted && isRunning) {
      distractionStartRef.current = performance.now();
      currentDistractionStartMs.current = elapsedMs;
      setIsDistracted(true);
      distractionFrameRef.current = requestAnimationFrame(updateDistractionDisplay);
    }
  }, [isDistracted, isRunning, elapsedMs, updateDistractionDisplay]);

  const stopDistraction = useCallback((distractionNameOverride) => {
    if (isDistracted) {
      distractionAccumulatedRef.current += performance.now() - distractionStartRef.current;
      const totalDistractionMs = distractionAccumulatedRef.current;
      
      const nameToUse = distractionNameOverride || currentDistractionName || 'Distraction';
      
      const newDistraction = {
        id: uuidv4(),
        name: nameToUse,
        startMs: currentDistractionStartMs.current,
        durationMs: Math.round(totalDistractionMs),
        note: '',
        timestamp: getLocalISOString(),
      };
      
      setDistractions(prev => [...prev, newDistraction]);
      distractionStartRef.current = null;
      distractionAccumulatedRef.current = 0;
      setDistractionElapsed(0);
      setCurrentDistractionName('');
      setIsDistracted(false);
      if (distractionFrameRef.current) cancelAnimationFrame(distractionFrameRef.current);
    }
  }, [isDistracted, currentDistractionName, elapsedMs, updateDistractionDisplay]);

  const toggleDistraction = useCallback((distractionNameOverride) => {
    if (isDistracted) stopDistraction(distractionNameOverride);
    else startDistraction();
  }, [isDistracted, startDistraction, stopDistraction]);


  // Listen for distraction stop with name from mini window
  useEffect(() => {
    const handleDistractionStopWithName = (name) => {
      toggleDistraction(name);
    };

    if (window.electronAPI) {
      window.electronAPI.onDistractionStopWithName(handleDistractionStopWithName);
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeDistractionStopWithNameListener();
      }
    };
  }, [toggleDistraction]);

  const addLap = useCallback((flagged = false) => {
    const lapTime = startTimeRef.current
      ? accumulatedRef.current + (performance.now() - startTimeRef.current)
      : accumulatedRef.current;
    setLaps(prev => {
      const newLap = {
        id: uuidv4(),
        number: prev.length + 1,
        time: lapTime,
        split: prev.length > 0 ? lapTime - prev[prev.length - 1].time : lapTime,
        note: '',
        flagged,
        timestamp: getLocalISOString(),
      };
      return [...prev, newLap];
    });
  }, []);

  const toggleFlag = useCallback((lapId) => {
    setLaps(prev => prev.map(lap => lap.id === lapId ? { ...lap, flagged: !lap.flagged } : lap));
  }, []);

  const updateLapNote = useCallback((lapId, note) => {
    setLaps(prev => prev.map(lap => lap.id === lapId ? { ...lap, note } : lap));
  }, []);

  const removeDistraction = useCallback((id) => {
    setDistractions(prev => prev.filter(d => d.id !== id));
  }, []);

  const resetStopwatch = useCallback(() => {
    if (isRunningRef.current) stopStopwatch();
    if (isDistracted) {
      if (distractionFrameRef.current) cancelAnimationFrame(distractionFrameRef.current);
      distractionStartRef.current = null;
      distractionAccumulatedRef.current = 0;
      setDistractionElapsed(0);
      setIsDistracted(false);
    }
    accumulatedRef.current = 0;
    setElapsedMs(0);
    setLaps([]);
    setCurrentNote('');
    setSessionStart(null);
    setSessionName('');
    setDistractions([]);
    setCurrentDistractionName('');
  }, [stopStopwatch, isDistracted]);

  const getProductiveMs = useCallback(() => {
    const totalDistracted = distractions.reduce((sum, d) => sum + d.durationMs, 0);
    const currentDistractionMs = isDistracted ? distractionElapsed : 0;
    return Math.max(0, elapsedMs - totalDistracted - currentDistractionMs);
  }, [elapsedMs, distractions, isDistracted, distractionElapsed]);

  const saveSession = useCallback(async () => {
    // Use real elapsed time from refs (not React state)
    const realElapsed = startTimeRef.current
      ? accumulatedRef.current + (performance.now() - startTimeRef.current)
      : accumulatedRef.current;
    
    if (realElapsed < 30000) {
      showToast('Track at least 30 seconds before saving.', 'error');
      return;
    }
    const sessionId = uuidv4();
    
    // If currently distracted, auto-stop it before saving
    let finalDistractions = [...distractions];
    if (isDistracted) {
      const totalMs = distractionAccumulatedRef.current + (performance.now() - distractionStartRef.current);
      finalDistractions = [...distractions, {
        id: uuidv4(),
        name: currentDistractionName || 'Distraction',
        startMs: currentDistractionStartMs.current,
        durationMs: Math.round(totalMs),
        note: '',
        timestamp: new Date().toISOString(),
      }];
    }

    const totalDistractedMs = finalDistractions.reduce((sum, d) => sum + d.durationMs, 0);
    const productiveMs = Math.max(0, realElapsed - totalDistractedMs);

    const session = {
      id: sessionId,
      name: sessionName || 'Untitled Session',
      date: sessionStart || getLocalISOString(),
      totalMs: Math.round(productiveMs), // Save productive time only
      laps: laps.map(lap => ({ ...lap })),
      note: currentNote,
      distractions: finalDistractions,
      createdAt: new Date().toISOString(),
    };

    try {
      const result = await window.electronAPI.saveSession(session);
      if (result.success) {
        showToast(`${session.name || 'Session'} saved!`, 'success');
        resetStopwatch();
        setHistoryRefreshKey(prev => prev + 1);
        
        // Force-send reset state to mini window
        setTimeout(() => {
          if (window.electronAPI) {
            window.electronAPI.updateRunningState(false, 0, false, '');
          }
        }, 100);
      } else {
        showToast('Failed to save: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Error saving session: ' + error.message);
    }
  }, [sessionName, sessionStart, elapsedMs, laps, currentNote, distractions, isDistracted, currentDistractionName, distractionAccumulatedRef, resetStopwatch]);



  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onGlobalShortcut((key) => {
        switch (key) {
          case 'space': toggleStopwatch(); break;
          case 'l': if (isRunningRef.current) addLap(false); break;
          case 'f': if (isRunningRef.current) addLap(true); break;
          case 'd': toggleDistraction(); break;
          case 'ctrl+r': resetStopwatch(); break;
          case 'ctrl+s': saveSession(); break;
          default: break;
        }
      });
    }
    return () => { if (window.electronAPI) window.electronAPI.removeGlobalShortcutListener(); };
  }, [toggleStopwatch, addLap, toggleDistraction, resetStopwatch, saveSession]);

  // Respond to mini window's request for current stopwatch state
  useEffect(() => {
    const handleStateRequest = () => {
      const realElapsed = startTimeRef.current 
        ? accumulatedRef.current + (performance.now() - startTimeRef.current)
        : accumulatedRef.current;
      
      const realDistractionElapsed = distractionStartRef.current
        ? distractionAccumulatedRef.current + (performance.now() - distractionStartRef.current)
        : distractionAccumulatedRef.current;
      
      if (window.electronAPI) {
        window.electronAPI.updateRunningState(
          isRunning, 
          Math.round(realElapsed), 
          isDistracted, 
          currentDistractionName,
          Math.round(realDistractionElapsed)
        );
      }
    };

    if (window.electronAPI) {
      window.electronAPI.onGetStopwatchState(handleStateRequest);
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeGetStopwatchStateListener();
      }
    };
  }, [isRunning, elapsedMs]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.code) {
        case 'Space': e.preventDefault(); toggleStopwatch(); break;
        case 'KeyL': if (isRunningRef.current) addLap(false); break;
        case 'KeyF': if (isRunningRef.current) addLap(true); break;
        case 'KeyD': toggleDistraction(); break;
        case 'KeyR': if (e.ctrlKey) { e.preventDefault(); resetStopwatch(); } break;
        case 'KeyS': if (e.ctrlKey) { e.preventDefault(); saveSession(); } break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleStopwatch, addLap, resetStopwatch, saveSession, toggleDistraction]);

  // Listen for elapsed time sync from mini window
  useEffect(() => {
    const handleSyncElapsed = (syncedMs) => {
      
      // Cancel any existing animation loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Update the main window's accumulated ref to match mini window
      accumulatedRef.current = syncedMs;
      startTimeRef.current = null; // Don't continue from mini's startTime
      setElapsedMs(syncedMs);
      
      // If the mini window was running, auto-start the main window's timer
      // But use a fresh startTime to avoid double-counting
      if (isRunningRef.current) {
        startTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(updateDisplay);
      }
    };

    if (window.electronAPI) {
      window.electronAPI.onSyncElapsedFromMini(handleSyncElapsed);
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeSyncElapsedFromMiniListener();
      }
    };
  }, [updateDisplay]);

  const productiveMs = getProductiveMs();

  const stopwatchProps = {
    isRunning, elapsedMs, laps, currentNote, sessionName,
    setCurrentNote, setSessionName,
    toggleStopwatch, addLap, toggleFlag, updateLapNote, resetStopwatch, saveSession,
    // Distraction props
    isDistracted, distractionElapsed, distractions, currentDistractionName,
    setCurrentDistractionName,
    toggleDistraction, removeDistraction,
    productiveMs,
  };

  return (
    <div className="app-container">
      <header className="app-header compact"><h1>DailyTracker</h1></header>
      <nav className="nav-tabs">
        <NavLink to="/stopwatch" className={({ isActive }) => isActive ? 'nav-tab active' : 'nav-tab'}>⏱ Stopwatch</NavLink>
        <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-tab active' : 'nav-tab'}>📋 History</NavLink>
        <NavLink to="/stats" className={({ isActive }) => isActive ? 'nav-tab active' : 'nav-tab'}>📈 Stats</NavLink>
      </nav>
      <main className="app-main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/stopwatch" replace />} />
          <Route path="/stopwatch" element={<Stopwatch {...stopwatchProps} />} />
          <Route path="/history" element={<History key={historyRefreshKey} />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </main>
      <ToastContainer />
      {/* Close Confirmation Dialog */}
            {/* Close Confirmation Dialog */}
      {showCloseDialog && (
        <div className="dialog-overlay" onClick={() => setShowCloseDialog(false)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-icon">⚠️</div>
            <h2 className="dialog-title">Stopwatch is running</h2>
            <p className="dialog-message">
              You have an active session with tracked time. What would you like to do?
            </p>

            {/* Minimum 30s warning */}
            {elapsedMs < 30000 && (
              <div className="dialog-warning">
                ⏱ Session is less than 30 seconds — Save & Quit is disabled.
              </div>
            )}

            <div className="dialog-actions">
              <button
                className={`btn dialog-btn-save ${elapsedMs < 30000 ? 'disabled' : ''}`}
                disabled={elapsedMs < 30000}
                title={elapsedMs < 30000 ? 'Track at least 30 seconds before saving' : ''}
                onClick={async () => {
                  if (elapsedMs < 30000) return;
                  
                  setShowCloseDialog(false);
                  
                  let finalDistractions = [...distractions];
                  if (isDistracted) {
                    const totalMs = distractionAccumulatedRef.current + (performance.now() - distractionStartRef.current);
                    finalDistractions = [...distractions, {
                      id: uuidv4(),
                      name: currentDistractionName || 'Distraction',
                      startMs: currentDistractionStartMs.current,
                      durationMs: Math.round(totalMs),
                      note: '',
                      timestamp: new Date().toISOString(),
                    }];
                  }

                  const totalDistractedMs = finalDistractions.reduce((sum, d) => sum + d.durationMs, 0);
                  const productiveMs = Math.max(0, elapsedMs - totalDistractedMs);

                  const session = {
                    id: uuidv4(),
                    name: sessionName || 'Untitled Session',
                    date: sessionStart || getLocalISOString(),
                    totalMs: Math.round(productiveMs),
                    laps: laps.map(lap => ({ ...lap })),
                    note: currentNote,
                    distractions: finalDistractions,
                    createdAt: new Date().toISOString(),
                  };

                  try {
                    const result = await window.electronAPI.saveSession(session);
                    if (result.success) {
                      // console.log('Session saved on quit:', session.name);
                    } else {
                      console.error('Save on quit failed:', result.error);
                    }
                  } catch (e) {
                    console.error('Save on quit error:', e);
                  }
                  
                  setTimeout(() => {
                    window.electronAPI.confirmQuit();
                  }, 200);
                }}
              >
                💾 Save & Quit
              </button>
              <button
                className="btn dialog-btn-discard"
                onClick={() => {
                  setShowCloseDialog(false);
                  window.electronAPI.confirmQuit();
                }}
              >
                🗑 Don't Save
              </button>
              <button
                className="btn dialog-btn-cancel"
                onClick={() => setShowCloseDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Uncomment this while in development for devPanel */}
      {import.meta.env.DEV && (
        <DevPanel onSessionsChanged={() => setHistoryRefreshKey(prev => prev + 1)} />
      )}
    </div>
  );
}

export default App;