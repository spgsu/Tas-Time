// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Backups dialog: earlier versions of the open book kept in this browser, to restore or download.
import { h } from './dom.js';
import { BACKUP_GAP_MS, BACKUP_KEEP } from '../core/backups.js';
import { notify, rerender, store } from './state.js';
import { btn } from './components.js';
import { undo } from './commands.js';
import { showModal } from './overlay.js';
import { downloadBackup, listBackups, prefs, restoreBackup } from './files.js';

function ago(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

export async function showBackups() {
  const list = h('div', { 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Loading…'));
  const dialog = showModal('Backups', [
    h('p', { class: 'muted' }, `Tas-Time keeps the last ${BACKUP_KEEP} versions of this book in this browser: when you open it, and then at most every ${BACKUP_GAP_MS / 60000} minutes while you work. They are not files and are lost if the browser’s data is cleared, so keep your own copies of important books.`),
    list,
  ]);
  if (!prefs().recovery) { list.replaceChildren(h('p', null, 'Backups are off because the recovery copy is off (⋯ menu). Turn it on to keep backups in this browser.')); return dialog; }
  const entries = await listBackups();
  if (!entries.length) { list.replaceChildren(h('p', null, 'No backups of this book yet. The first is kept when you open it or after a few minutes of work.')); return dialog; }
  list.replaceChildren(h('ul', { class: 'backup-list' }, entries.map(entry => h('li', null,
    h('div', null, h('strong', null, `${new Date(entry.at).toLocaleString()}`),
      h('span', { class: 'muted' }, `${ago(entry.at)} · ${entry.tasks} task${entry.tasks === 1 ? '' : 's'}${entry.fileName ? ` · ${entry.fileName}` : ''}`)),
    btn('Download', () => downloadBackup(entry), { kind: 'sm', iconName: 'save' }),
    btn('Restore', async () => {
      if (!confirm(`Replace the open book with the version from ${new Date(entry.at).toLocaleString()}? You can undo this, and the current version is backed up first.`)) return;
      try {
        await restoreBackup(entry);
        dialog.close();
        rerender();
        notify(`Restored the version from ${new Date(entry.at).toLocaleString()}.`, { action: { label: 'Undo', run: undo } });
      } catch (error) { notify(`Could not restore: ${error.message}`, { kind: 'error' }); }
    }, { kind: 'sm primary' })))));
  return dialog;
}
