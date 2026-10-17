# Tas-Time

An offline planning book for people who think in programmes: jobs broken into phases with dated tasks and prerequisites (construction-style), connected to a realistic week and a focused day.

One HTML file. No install, account, server or network access.

## Use it

1. Open **`dist/Tas-Time.html`** in Microsoft Edge or Google Chrome — or double-click **`dist/Open Tas-Time.cmd`** for a dedicated Edge app window (keep both files in the same folder).
2. Choose **Create your first job**, **Open a planning book**, or **Explore an example**.
3. Press **Ctrl+S** once to choose where your book (`.json`) lives. After that, every change is saved to that file automatically.

| View | What it is for |
| --- | --- |
| **Today** (1) | Today's planned work, anything carried over or past due, and a resume note per job. |
| **Week** (2) | The hours you really have this week vs. the effort you've planned. Drag tasks onto days. |
| **Plan** (3) | The programme: jobs → phases → tasks on a calendar-day Gantt with baselines, slippage and prerequisite links. Drag bars to re-forecast. |
| **Board** (4) | Status at a glance: To do, Doing, Blocked, Done. |
| **Notes** (5) | Per-job notebook: resume here, scope, decisions, working notes, references. |

**Appearance** (bottom of the sidebar): choose the **Fluent** style (Microsoft 365 look, default) or **Notebook** (warm paper look), and **Match Windows / Light / Dark**. The choice is remembered in this browser, not in the book. Requires Edge or Chrome 123 or newer (2024).

**Quick add** — press `N` anywhere and type, e.g. `Draft limitations #phd 2h @tue !fri`:
`#job` (code or name) · `2h` / `45m` / `1h30` effort · `@day` the day you'll work on it · `!day` due date · leading `*` makes a milestone. Press `?` in the app for all shortcuts.

### How the planning rules work

- **Dates are forecasts you control.** Nothing reschedules itself. Dragging a bar or editing a date is the re-forecast.
- **Effort is not duration.** A two-week external review may need 30 minutes of your time; effort is what the Week view adds up.
- **Blocked is derived, never set by hand.** A task is blocked when it has a written constraint, or when its prerequisites are unfinished once it is due to start (or in progress). Before then it is simply *waiting*, shown as "After …".
- **Done requires prerequisites done** (finish-to-start).
- **Baseline** freezes the current dates; the Plan then shows slippage (`+3d`) against it.
- **Planning a day** in Week/Today never changes programme dates.

### Your data

- The book is a single JSON file you choose. Keep backups by copying it, or with **Save as…**.
- After a relaunch the browser may ask you to **Reconnect** the file (one click) before autosave resumes.
- A **recovery copy** is kept in this browser's local storage so an accidental close loses nothing. Turn it off from the **⋯** menu on a shared computer.
- Books from earlier Tas-Time versions (format v1/v2) open and are upgraded; the original file is never overwritten — you choose where to save the upgraded copy.
- Keep work and personal books in their own environments. The app cannot enforce an employer's policy; check that local HTML is permitted at work.
- Browsers without the File System Access API (e.g. Firefox) fall back to downloading the file on Save, which the app cannot confirm.

## Develop

Requires **Node.js 22+** (uses built-in `fetch`, `WebSocket` and `node:test`). No npm packages.

```powershell
npm run build   # bundles src/ into dist/Tas-Time.html and dist/Open Tas-Time.cmd
npm test        # unit tests for the planning core (tests/*.test.js)
npm run e2e     # build, then drive the real app in headless Edge/Chrome (tests/e2e/)
npm run check   # all of the above
```

The e2e suite needs Edge or Chrome installed (or `BROWSER=<path to a Chromium executable>`). It writes screenshots of every view, at desktop and phone widths and in dark mode, to `.e2e/` for visual review.

### Layout

```
src/
  core/        Pure planning logic, no DOM: dates, model (schema, validation, migration),
               query (derived state), ops (mutations), parse (effort, quick add), store (undo/redo)
  ui/          DOM layer: dom.js (safe element builder), shell, drawer, files (save/open/recovery),
               overlay (toasts, menus), views/ (today, week, plan, board, notes, welcome)
  index.html   Page template;  styles.css  all styles (light/dark/print)
scripts/build.mjs   Zero-dependency bundler: one script scope, unique top-level names enforced
launcher/           Edge app-window launcher source
tests/              core.test.js (node:test) and e2e/ (headless browser over DevTools protocol)
```

Conventions: ES modules with named exports only; two-space indentation; user text is only ever inserted as DOM text (never `innerHTML`); every change goes through `store.commit()` so it is validated and undoable. The bundler fails the build on duplicate top-level names across modules, default exports or import aliases.

Copyright © 2026 Selami Pazarbasi. Released under the MIT License — see `LICENSE`.
