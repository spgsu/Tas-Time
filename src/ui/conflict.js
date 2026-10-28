// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// The linked file changed outside this window: choose which version to keep. Neither is lost —
// the version not chosen goes into Backups.
import { h } from './dom.js';
import { notify } from './state.js';
import { btn } from './components.js';
import { showModal } from './overlay.js';
import { file, keepThisVersion, save, setConflictHandler, useFileVersion } from './files.js';

export function showConflict() {
  const run = fn => async () => {
    dialog.close();
    try { await fn(); } catch (error) { notify(`Could not finish: ${error.message}`, { kind: 'error' }); }
  };
  const dialog = showModal(`${file.name} changed elsewhere`, [
    h('p', null, `Since this window last read or saved ${file.name}, it was saved from somewhere else — another computer, another Tas-Time window, or a sync client. Autosave has stopped so neither version is overwritten.`),
    h('div', { class: 'conflict-choices' },
      h('div', null, btn('Show the file’s version', run(useFileVersion), { kind: 'primary', attrs: { id: 'conflict-file' } }),
        h('p', { class: 'field-hint' }, 'Recommended when the other edit is the one you want. Your version here is kept in ⋯ → Backups.')),
      h('div', null, btn('Keep this window’s version', run(keepThisVersion), { attrs: { id: 'conflict-mine' } }),
        h('p', { class: 'field-hint' }, 'Overwrites the file. The version saved elsewhere is kept in ⋯ → Backups.')),
      h('div', null, btn('Save this version as a new file…', run(() => save({ saveAs: true })), { kind: 'ghost' }),
        h('p', { class: 'field-hint' }, 'Keeps both files; compare them and merge by hand.'))),
  ]);
  return dialog;
}

setConflictHandler(showConflict);
