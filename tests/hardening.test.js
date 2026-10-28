// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// A linked file changed outside this window (another PC, another window, a sync client) is never overwritten silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newBook } from '../src/core/model.js';
import { addJob } from '../src/core/ops.js';
import { store } from '../src/ui/state.js';

const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };
let picked;
globalThis.window = { showSaveFilePicker: async () => picked };
const { autosave, checkLinkedFile, file, keepThisVersion, save, setConflictHandler, useFileVersion } = await import('../src/ui/files.js');
const settle = () => new Promise(r => setTimeout(r, 20));

/** A file on a shared disk: every write bumps lastModified, as a real file system does. */
function sharedFile(name) {
  const disk = { raw: '', lastModified: 1000 };
  const handle = {
    name,
    async getFile() { return { name, lastModified: disk.lastModified, text: async () => disk.raw }; },
    async createWritable() { let buf = ''; return { write: async s => { buf = s; }, close: async () => { disk.raw = buf; disk.lastModified += 10; } }; },
  };
  return { disk, handle };
}

/** Someone else saves the file: here, renaming the first job. */
function editElsewhere(disk, title) {
  const theirs = JSON.parse(disk.raw);
  theirs.jobs[0].title = title;
  disk.raw = JSON.stringify(theirs, null, 2);
  disk.lastModified += 1000;
}

async function linkedBook() {
  const book = newBook('Shared'); addJob(book, { title: 'Ours' });
  store.replace(book, { dirty: true });
  Object.assign(file, { handle: null, name: '', state: 'none', disk: null });
  const shared = sharedFile('shared.json');
  picked = shared.handle;
  assert.equal(await save(), true);
  return shared;
}

test('an edit saved elsewhere stops autosave instead of being overwritten', async () => {
  let asked = 0; setConflictHandler(() => { asked++; });
  const { disk } = await linkedBook();
  editElsewhere(disk, 'Edited on the other PC');
  store.commit('Our edit', d => { d.name = 'Renamed here'; });
  autosave.flush(); await settle();
  assert.equal(JSON.parse(disk.raw).jobs[0].title, 'Edited on the other PC');
  assert.equal(file.state, 'conflict');
  assert.equal(store.dirty, true, 'our edit is still unsaved, not lost');
  store.commit('Another edit', d => { d.name = 'Again'; });
  autosave.flush(); await settle();
  assert.equal(JSON.parse(disk.raw).name, 'Shared', 'autosave stays stopped while the conflict is open');
  assert.equal(await save(), false, 'Save also refuses to overwrite');
  assert.equal(asked, 0, 'the dialog opens only when the user chooses');
});

test('a touched timestamp with the same content is not a conflict', async () => {
  const { disk } = await linkedBook();
  disk.lastModified += 5000;
  store.commit('Edit', d => { d.name = 'After touch'; });
  autosave.flush(); await settle();
  assert.equal(file.state, 'linked');
  assert.equal(JSON.parse(disk.raw).name, 'After touch');
});

test('keep this version overwrites on purpose; use file version shows theirs', async () => {
  let shared = await linkedBook();
  editElsewhere(shared.disk, 'Theirs');
  store.commit('Ours', d => { d.name = 'Mine'; });
  autosave.flush(); await settle();
  await keepThisVersion();
  assert.deepEqual([file.state, JSON.parse(shared.disk.raw).name, JSON.parse(shared.disk.raw).jobs[0].title, store.dirty], ['linked', 'Mine', 'Ours', false]);

  shared = await linkedBook();
  editElsewhere(shared.disk, 'Theirs');
  store.commit('Ours', d => { d.name = 'Mine'; });
  autosave.flush(); await settle();
  await useFileVersion();
  assert.deepEqual([file.state, store.book.jobs[0].title, store.book.name, store.dirty], ['linked', 'Theirs', 'Shared', false]);
  store.commit('Continue', d => { d.name = 'Continued'; });
  autosave.flush(); await settle();
  assert.equal(JSON.parse(shared.disk.raw).name, 'Continued', 'autosave resumes on the adopted version');
  assert.equal(JSON.parse(shared.disk.raw).jobs[0].title, 'Theirs');
});

test('coming back to the window loads a newer file when there is nothing unsaved, and flags a conflict otherwise', async () => {
  let shared = await linkedBook();
  editElsewhere(shared.disk, 'Newer elsewhere');
  await checkLinkedFile();
  assert.deepEqual([store.book.jobs[0].title, file.state, store.dirty], ['Newer elsewhere', 'linked', false]);
  await checkLinkedFile();
  assert.equal(store.book.jobs[0].title, 'Newer elsewhere', 'checking again changes nothing');

  shared = await linkedBook();
  store.commit('Unsaved here', d => { d.name = 'Unsaved'; });
  autosave.cancel();
  editElsewhere(shared.disk, 'Newer elsewhere');
  await checkLinkedFile();
  assert.deepEqual([store.book.name, store.book.jobs[0].title, file.state], ['Unsaved', 'Ours', 'conflict']);
});

test('a second window on the same book is warned about, once; other books are ignored', async () => {
  const { onPresence, initPresence } = await import('../src/ui/presence.js');
  const { onNotify } = await import('../src/ui/state.js');
  const warnings = []; onNotify(m => warnings.push(m));
  const handlers = []; initPresence({ addEventListener: (type, fn) => handlers.push([type, fn]) });
  assert.deepEqual(handlers.map(([type]) => type), ['storage']);
  const said = () => JSON.parse(storage.get('tas-time:presence'));
  assert.equal(said().kind, 'hello');
  onPresence(JSON.stringify({ from: 'other', kind: 'hello', bookId: 'another-book' }));
  assert.equal(warnings.filter(m => m.includes('another Tas-Time window')).length, 0);
  onPresence(JSON.stringify({ from: 'other', kind: 'hello', bookId: store.book.id }));
  assert.equal(said().kind, 'here', 'answers so the other window warns too');
  onPresence(JSON.stringify({ from: 'other', kind: 'here', bookId: store.book.id }));
  onPresence('not json');
  assert.equal(warnings.filter(m => m.includes('another Tas-Time window')).length, 1);
});

test('undo history shrinks for big books but always keeps 20 steps', async () => {
  const { createStore, historyLimit } = await import('../src/core/store.js');
  assert.equal(historyLimit(50_000), 200);
  assert.equal(historyLimit(1_000_000), 80);
  assert.equal(historyLimit(15_000_000), 20);
  const s = createStore(newBook());
  for (let i = 0; i < 250; i++) s.commit('Edit', d => { d.name = `v${i}`; });
  let undone = 0; while (s.undo()) undone++;
  assert.equal(undone, 200);
  assert.equal(s.book.name, 'v49', 'the oldest 50 steps were dropped');
});

test('damaged and hostile book files are refused with a readable message, never a crash', async () => {
  const { decodeBook, encodeBook: encode } = await import('../src/core/model.js');
  const { exampleBook } = await import('../src/core/example.js');
  const good = JSON.parse(encode(exampleBook('2026-10-28')));
  const cases = {
    'not JSON': '{"format":',
    'null': 'null',
    'array': '[]',
    'string': '"tas-time-planning-book"',
    'wrong format': { ...good, format: 'other' },
    'future version': { ...good, version: 99 },
    'jobs not a list': { ...good, jobs: {} },
    'item is null': { ...good, items: [null] },
    'item is a number': { ...good, items: [7] },
    'title is an object': { ...good, items: [{ ...good.items[0], title: { toString: 'x' } }] },
    'negative effort': { ...good, items: [{ ...good.items[0], effort: -5 }] },
    'effort is Infinity-like': { ...good, items: [{ ...good.items[0], effort: 1e309 }] },
    'deps not a list': { ...good, items: [{ ...good.items[0], deps: 'all' }] },
    'checklist is null': { ...good, items: [{ ...good.items[0], checklist: null }] },
    'repeat is a string': { ...good, items: [{ ...good.items[0], repeat: 'weekly' }] },
    'weeks is a list': { ...good, weeks: [] },
    'week key not a Monday': { ...good, weeks: { '2026-10-28': { capacity: 600, notes: '' } } },
    '__proto__ week key': JSON.parse(JSON.stringify(good).replace('"weeks":{', '"weeks":{"__proto__":{"capacity":1,"notes":""},')),
    'log is a string': { ...good, log: 'none' },
    'log entry is null': { ...good, log: [null] },
    'log itemIds null': { ...good, log: [{ ...good.log[0], itemIds: null }] },
    'people empty': { ...good, people: [] },
    'person capacity huge': { ...good, people: [{ ...good.people[0], capacity: 1e12 }] },
    'dependency loop': (() => { const b = structuredClone(good); b.items[0].deps = [b.items[1].id]; b.items[1].deps = [b.items[0].id]; return b; })(),
    'duplicate ids': { ...good, items: [good.items[0], good.items[0]] },
    'oversized file': 'x'.repeat(15_000_001),
  };
  let refused = 0;
  const crashes = [];
  for (const [name, value] of Object.entries(cases)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    try { decodeBook(text); crashes.push(`${name}: accepted`); } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError) crashes.push(`${name}: ${error.constructor.name} ${error.message}`);
      else refused++;
    }
  }
  assert.deepEqual(crashes, []);
  assert.equal(refused, Object.keys(cases).length);
  assert.equal(Object.prototype.capacity, undefined, 'nothing reached Object.prototype');
});
