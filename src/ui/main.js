// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Entry point.
import { notify, onRender, rerender, store, today, ui } from './state.js';
import { mondayOf } from '../core/dates.js';
import { initKeys, initQuickAdd, renderShell, renderStatus } from './shell.js';
import { initToasts } from './overlay.js';
import { initPresence } from './presence.js';
import { applyAppearance } from './appearance.js';
import { autosave, beforeUnload, checkLinkedFile, restoreSession, writeRecovery } from './files.js';

async function start() {
  applyAppearance();
  initToasts();
  initQuickAdd();
  initKeys();
  onRender(scope => { renderShell(scope); writeRecovery(); });
  store.subscribe(reason => {
    // Quiet commits come from text fields being typed in: refresh only the chrome so the caret stays put.
    if (reason === 'quiet' || reason === 'saved') renderStatus(); else renderShell();
    if (reason !== 'saved') { writeRecovery(); autosave(); }
  });
  await restoreSession();
  initPresence();
  renderShell();
  document.documentElement.classList.add('ready');
  // Left open overnight, Today, Week and the lookahead would still show yesterday: redraw when the date changes.
  let shownDay = today();
  setInterval(() => {
    if (today() === shownDay) return;
    // Someone looking at "this week" on Sunday night should see the new week on Monday.
    if (ui.week === mondayOf(shownDay)) ui.week = mondayOf(today());
    shownDay = today();
    rerender();
  }, 60000);
}

window.addEventListener('beforeunload', beforeUnload);
// Errors outside rendering (event handlers, async saves) get a visible message instead of failing silently.
window.addEventListener('error', event => notify(`Unexpected error: ${event.message}. Your work is kept in the recovery copy.`, { kind: 'error' }));
window.addEventListener('unhandledrejection', event => notify(`Unexpected error: ${event.reason?.message || event.reason}. Your work is kept in the recovery copy.`, { kind: 'error' }));
window.addEventListener('pagehide', () => writeRecovery.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') writeRecovery.flush();
  // Coming back to the window: pick up a version of the file saved elsewhere meanwhile.
  else checkLinkedFile();
});

start();
