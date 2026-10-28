// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Entry point.
import { onRender, store } from './state.js';
import { initKeys, initQuickAdd, renderShell, renderStatus } from './shell.js';
import { initToasts } from './overlay.js';
import { applyAppearance } from './appearance.js';
import { autosave, beforeUnload, restoreSession, writeRecovery } from './files.js';

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
  renderShell();
  document.documentElement.classList.add('ready');
}

window.addEventListener('beforeunload', beforeUnload);
window.addEventListener('pagehide', () => writeRecovery.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') writeRecovery.flush();
});

start();
