# Daily Tracker

A beautiful, keyboard-driven desktop productivity tracker with stopwatch, distraction monitoring, rich analytics, and a powerful archive system. Built for deep workers who want to understand where their time goes.

---

## Features

### ⏱ Smart Stopwatch
- Start/Stop with **Spacebar** (works even when minimized)
- **Laps** with `L` key and **Flagged laps** with `F` key
- Inline lap notes and flag toggling
- Session notes for context
- **Distraction tracker** — mark interruptions without stopping the main timer
- Productive time automatically calculated (total minus distractions)
- `Ctrl+S` to save, `Ctrl+R` to reset

### 📋 History
- **Today's sessions** displayed chronologically (newest first)
- Expand any session to see notes, laps with split times, and distraction details
- Delete sessions with confirmation
- **Contribution graph** — GitHub-style heatmap of the past 52 weeks
- **Day streak** — current consecutive days tracked
- **Max streak** — your all-time best streak
- **Active days** — total unique days with activity

### 📦 Archive
- Drill down: **Year → Month → Day → Sessions**
- Current year shows months expanded (Dec → Jan)
- Past years as clickable buttons (Jan → Dec chronological)
- Days sorted intuitively (current month: today → 1st, other months: 1st → 31st)
- Only periods with activity appear — no empty clutter
- Full session details, notes, laps, and distractions preserved

### 📈 Stats & Analytics
- **Stats cards** — Total Time, Avg Session, Focus Rate with reactive emoji
- **Bar chart** — Week / Month / Year toggle with hover tooltips
- **Distraction Breakdown** — Donut chart with Today / This Week toggle
- Ranked distraction categories with time and percentage
- Productive ratio bar
- Tooltips (`?` icons) explain every metric

### 🛠 Dev Panel
- Press `Ctrl+Shift+D` to open
- Generate test data for any number of past days
- Clear all sessions
- View database contents at a glance
- Perfect for testing streaks, archives, and analytics

### 🖥 System Tray
- Minimize to tray — app keeps running in background
- Tray menu: Start/Stop, Add Lap, Show Window, Quit
- Global shortcuts work from tray

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Start / Stop stopwatch |
| `L` | Add lap |
| `F` | Add flagged lap |
| `D` | Start / Stop distraction timer |
| `Ctrl+S` | Save session |
| `Ctrl+R` | Reset stopwatch |
| `Ctrl+Shift+D` | Toggle Dev Panel |

---

## Installation

### Download (Windows)
Download the latest installer from [Releases](https://github.com/YOUR-USERNAME/daily-tracker/releases).

Run `Daily Tracker Setup x.x.x.exe` and follow the installer.

### Run from Source
```bash
git clone https://github.com/YOUR-USERNAME/daily-tracker.git
cd daily-tracker
npm install
npm run dev