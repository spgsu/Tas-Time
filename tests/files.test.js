// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { newBook } from '../src/core/model.js';
import { onNotify, restoreView, sessionView, store, ui } from '../src/ui/state.js';

globalThis.window = { showSaveFilePicker: async () => pickedHandle };
const storage = new Map();
let storageBlocked = false;
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem(key, value) {
    if (storageBlocked) throw new Error('Storage quota exceeded');
    storage.set(key, value);
  },
  removeItem: key => storage.delete(key),
};
const { autosave, beforeUnload, file, restoreSession, save, setPref, writeRecovery } = await import('../src/ui/files.js');
let pickedHandle;
const tick = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function diskHandle(name, { started, gate, fail = false } = {}) {
  return {
    name, book: null,
    async createWritable() {
      started?.resolve();
      let raw;
      return {
        write: async text => { raw = text; if (gate) await gate.promise; },
        close: async () => {
          if (fail) throw new Error('Disk write failed');
          this.book = JSON.parse(raw);
        },
      };
    },
  };
}

test.beforeEach(() => {
  autosave.cancel(); writeRecovery.cancel();
  storage.clear(); storageBlocked = false;
  store.replace(newBook());
  restoreView(null);
  Object.assign(file, { handle: null, name: '', state: 'none' });
});
test.afterEach(() => { autosave.cancel(); writeRecovery.cancel(); });

test('recovering a version 3 book upgrades without reconnecting or overwriting its original', async () => {
  const legacy = newBook('Legacy');
  legacy.version = 3;
  delete legacy.people; delete legacy.selfId;
  storage.set('tas-time:recovery:v3', JSON.stringify({ at: new Date().toISOString(), dirty: false, fileName: 'original.json', book: legacy }));
  assert.equal(await restoreSession(), true);
  assert.equal(store.book.version, 4);
  assert.equal(store.dirty, true);
  assert.equal(file.handle, null);
  assert.equal(file.name, '');
});

test('Save as keeps newer edits dirty until they reach the new destination', async () => {
  const old = diskHandle('old.json');
  const started = deferred(); const gate = deferred();
  pickedHandle = diskHandle('new.json', { started, gate });
  Object.assign(file, { handle: old, name: old.name, state: 'linked' });
  store.commit('First edit', b => { b.name = 'Before'; });
  const saving = save({ saveAs: true });
  await started.promise;
  store.commit('Edit during write', b => { b.name = 'After'; });
  autosave.flush();
  await tick(); // queue the autosave to old.json behind the Save as write
  gate.resolve();
  assert.equal(await saving, true);
  await tick();
  assert.equal(file.handle, pickedHandle);
  assert.equal(pickedHandle.book.name, 'Before');
  assert.equal(old.book.name, 'After');
  assert.equal(store.dirty, true, 'writing the old destination cannot mark the new one clean');
  await new Promise(resolve => setTimeout(resolve, 1300));
  assert.equal(pickedHandle.book.name, 'After');
  assert.equal(store.dirty, false);
});

test('a failed Save as keeps the original destination and unsaved edits', async () => {
  const old = diskHandle('old.json');
  Object.assign(file, { handle: old, name: old.name, state: 'linked' });
  pickedHandle = diskHandle('failed.json', { fail: true });
  store.commit('Edit', b => { b.name = 'Unsaved'; });
  assert.equal(await save({ saveAs: true }), false);
  assert.equal(file.handle, old);
  assert.equal(store.dirty, true);
});

function closeAttempt() {
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  beforeUnload(event);
  return event;
}

test('closing warns when recovery fails, including after an earlier successful copy', () => {
  const warnings = [];
  onNotify(message => warnings.push(message));
  store.commit('First edit', b => { b.name = 'Recovered'; });
  assert.equal(closeAttempt().prevented, false);
  store.commit('New edit', b => { b.name = 'Not recovered'; });
  storageBlocked = true;
  const event = closeAttempt();
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, '');
  assert.equal(JSON.parse(storage.get('tas-time:recovery:v3')).book.name, 'Recovered');
  assert.ok(warnings.some(message => message.includes('Recovery copy could not be saved')));
  storageBlocked = false;
  assert.equal(closeAttempt().prevented, false, 'a successful retry protects the latest edits');
});

test('disabled recovery warns only for unsaved edits', () => {
  setPref('recovery', false);
  store.commit('Edit', b => { b.name = 'Unsaved'; });
  assert.equal(closeAttempt().prevented, true);
  store.markSaved(store.revision);
  assert.equal(closeAttempt().prevented, false);
});

test('closing warns while a linked file is behind, even with a recovery copy', () => {
  Object.assign(file, { handle: diskHandle('book.json'), name: 'book.json', state: 'reconnect' });
  store.commit('Edit', b => { b.name = 'Only in recovery'; });
  assert.equal(closeAttempt().prevented, true);
  assert.equal(JSON.parse(storage.get('tas-time:recovery:v3')).book.name, 'Only in recovery');
  store.markSaved(store.revision);
  assert.equal(closeAttempt().prevented, false, 'an up-to-date file closes quietly');
});

test('closing and reopening restores the file, job, view and planning context without edits', async () => {
  const book = newBook('Session book');
  // Use the real example schema for jobs, phases and tasks.
  const { exampleBook } = await import('../src/core/example.js');
  store.replace(exampleBook('2026-10-27'));
  const job = store.book.jobs[0];
  const task = store.book.items.find(t => t.jobId === job.id);
  Object.assign(file, { name: 'my-book.json' });
  Object.assign(ui, { view: 'notes', focus: job.id, notesJob: job.id, notesPage: 'working', week: '2026-11-02',
    drawer: { type: 'item', id: task.id, focusField: 'd-title' }, planRange: '3m', planShowDone: false,
    collapsedPhases: new Set(['collapsed-phase']), assignmentWeek: '2026-11-09' });
  ui.assignments = { person: store.book.selfId, status: 'doing', period: 'week', group: 'status', paused: true, search: 'draft' };
  const expected = sessionView();
  closeAttempt();
  restoreView(null);
  store.replace(book);
  file.name = '';
  assert.equal(await restoreSession(), true);
  assert.equal(file.name, 'my-book.json');
  assert.deepEqual(sessionView(), expected);
  assert.equal(store.dirty, false, 'view changes do not dirty the planning book');
});

test('old and invalid session views fall back safely and cannot reopen missing records', () => {
  restoreView({ view: 'missing', notesPage: 'missing', week: '2026-02-30', focus: 'deleted-job',
    drawer: { type: 'item', id: 'deleted-task' }, assignments: { person: 'deleted-person', search: 123 },
    collapsedPhases: {}, planShowDone: 'false', addingIn: 'unsaved-inline-form' });
  assert.equal(ui.view, 'today');
  assert.equal(ui.notesPage, 'restart');
  assert.equal(ui.focus, '');
  assert.equal(ui.drawer, null);
  assert.equal(ui.assignments.person, 'all');
  assert.equal(ui.assignments.search, '');
  assert.equal(ui.planShowDone, true);
  assert.equal(ui.addingIn, '');
  assert.ok(ui.collapsedPhases instanceof Set);
  restoreView();
  assert.equal(ui.view, 'today');
});
