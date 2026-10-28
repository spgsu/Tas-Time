// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Saving and opening planning books.
//
// Three layers, strongest first:
//  1. A linked file (File System Access API, Edge/Chrome): explicit save, then autosave.
//  2. A recovery copy in this browser's local storage, restored on next launch.
//  3. Download fallback where neither is available (cannot confirm the write).
import { decodeBook, encodeBook, newBook } from '../core/model.js';
import { debounce } from './dom.js';
import { notify, rerender, restoreView, sessionView, store } from './state.js';
import { exampleBook } from '../core/example.js';

const RECOVERY_KEY = 'tas-time:recovery:v3';
const PREF_KEY = 'tas-time:prefs';
const IDB_NAME = 'tas-time';
const PICKER_TYPES = [{ description: 'Tas-Time planning book', accept: { 'application/json': ['.json'] } }];

export const file = {
  handle: null,
  name: '',
  state: 'none',        // none | linked | saving | error | reconnect
  savedAt: null,
  lastError: '',
  restoredAt: null,     // set when unsaved work was restored on launch
};

export const canLinkFiles = typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

export function prefs() {
  try { return { recovery: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { recovery: true }; }
}

export function setPref(key, value) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs(), [key]: value })); } catch { /* storage unavailable */ }
  if (key === 'recovery' && !value) clearRecovery();
}

function suggestedName() {
  return `${store.book.name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'planning-book'}.json`;
}

let writing = Promise.resolve();

// Incremented whenever a different book replaces the open one. A save started in an
// earlier session writes only its own snapshot and never touches the current session's state.
let session = 0;
function beginSession() { session++; autosave.cancel(); }

/** What a save writes, fixed at the moment the save starts. */
function snapshot() { return { raw: encodeBook(store.book), rev: store.revision, session }; }

class StaleSave extends Error {
  constructor() { super('A different book was opened before this save finished. Nothing was written.'); this.name = 'StaleSave'; }
}

/** Saves to the linked file, asking for a location the first time (or always with saveAs). */
export async function save({ saveAs = false } = {}) {
  if (!canLinkFiles) return download();
  const snap = snapshot();
  try {
    let handle = !saveAs && file.handle;
    if (!handle) handle = await window.showSaveFilePicker({ suggestedName: file.name || suggestedName(), types: PICKER_TYPES });
    if (!(await ensurePermission(handle, true))) throw new Error('Permission to write the file was not granted.');
    if (snap.session !== session) throw new StaleSave();
    await queueWrite(handle, snap, { linkOnSuccess: true });
    if (snap.session !== session) return true; // written, but the user has moved on to another book
    if (store.dirty) autosave();
    notify(`Saved to ${handle.name}`);
    return true;
  } catch (error) {
    if (error.name === 'AbortError') return false;
    if (error.name === 'StaleSave') { notify(error.message, { kind: 'warn' }); return false; }
    if (snap.session === session) { file.state = 'error'; file.lastError = error.message; rerender('status'); }
    notify(`Save failed: ${error.message}`, { kind: 'error' });
    return false;
  }
}

/** Writes are serialised; each writes its own snapshot and only updates state for its own session. */
function queueWrite(handle, snap, { linkOnSuccess = false } = {}) {
  if (snap.session === session) { file.state = 'saving'; rerender('status'); }
  writing = writing.catch(() => {}).then(async () => {
    const writer = await handle.createWritable();
    await writer.write(snap.raw);
    await writer.close();
    if (snap.session !== session) return;
    if (linkOnSuccess) link(handle);
    // An autosave queued before Save as may still target the previous file.
    // Only a write to the current destination can mark this book as saved.
    if (handle !== file.handle) return;
    store.markSaved(snap.rev);
    file.savedAt = new Date(); file.state = 'linked'; file.lastError = '';
    writeRecovery.flush();
  });
  return writing;
}

function link(handle) {
  file.handle = handle; file.name = handle.name; file.state = 'linked';
  idbSet('lastFile', handle);
  rerender('status');
}

async function ensurePermission(handle, request) {
  if (!handle.queryPermission) return true;
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return request && (await handle.requestPermission(opts)) === 'granted';
}

/** Autosave after edits once a file is linked. Never prompts. */
export const autosave = debounce(() => { flushToFile(); }, 1200);

/** Writes pending changes to the linked file now. Resolves true when the file holds them. */
async function flushToFile() {
  autosave.cancel();
  const handle = file.handle;
  if (!handle || file.state === 'reconnect') return false;
  if (!store.dirty) { await writing.catch(() => {}); return file.state === 'linked'; }
  const snap = snapshot();
  try {
    if (!(await ensurePermission(handle, false))) {
      if (snap.session === session) { file.state = 'reconnect'; rerender('status'); }
      return false;
    }
    if (snap.session !== session) return false;
    await queueWrite(handle, snap);
    if (snap.session === session) rerender('status');
    return true;
  } catch (error) {
    if (snap.session === session) { file.state = 'error'; file.lastError = error.message; rerender('status'); }
    return false;
  }
}

/** Re-grants write access after a relaunch (needs a click, so it is a button). */
export async function reconnect() {
  if (!file.handle) return save();
  const mine = session;
  try {
    if (!(await ensurePermission(file.handle, true)) || mine !== session) return false;
    file.state = 'linked';
    if (store.dirty) await queueWrite(file.handle, snapshot());
    rerender('status');
    return true;
  } catch (error) { notify(error.message, { kind: 'error' }); return false; }
}

function download() {
  const url = URL.createObjectURL(new Blob([encodeBook(store.book)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name || suggestedName() });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  notify('Download started. This browser cannot confirm the file was saved — check your Downloads folder.', { kind: 'warn', timeout: 9000 });
  return true;
}

/**
 * Before another book replaces this one: finish writing pending changes to the linked file,
 * or ask before discarding them. Never drops edits silently.
 */
async function settleBeforeReplace() {
  if (!store.dirty) { await writing.catch(() => {}); return true; }
  if (file.handle && (file.state === 'linked' || file.state === 'saving') && await flushToFile() && !store.dirty) return true;
  return confirm(file.handle
    ? `Changes to this book could not be saved to ${file.name}. Discard them and continue?`
    : 'This book has changes that are not saved to a file. Discard them and continue?');
}

export async function openFile() {
  if (!(await settleBeforeReplace())) return;
  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
      const f = await handle.getFile();
      await loadText(await f.text(), f.name, handle);
      if (file.handle === handle) await grantWrite(handle);
    } catch (error) {
      if (error.name !== 'AbortError') notify(`Could not open: ${error.message}`, { kind: 'error' });
    }
    return;
  }
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    if (f) { try { await loadText(await f.text(), f.name, null); } catch (error) { notify(`Could not open: ${error.message}`, { kind: 'error' }); } }
  });
  input.click();
}

/**
 * The open picker grants read access only. Ask for write access while the click that opened
 * the file still counts, so autosave works at once instead of stopping at Reconnect.
 */
async function grantWrite(handle) {
  const mine = session;
  const granted = await ensurePermission(handle, true).catch(() => false);
  if (granted || mine !== session || file.handle !== handle) return;
  file.state = 'reconnect';
  rerender('status');
}

async function loadText(text, name, handle) {
  const { book, upgradedFrom } = decodeBook(text);
  beginSession();
  store.replace(book, { dirty: !!upgradedFrom });
  resetView();
  file.handle = null; file.name = name; file.state = 'none'; file.restoredAt = null;
  if (handle) {
    if (upgradedFrom) {
      // Never overwrite an older-format original silently.
      file.name = '';
      notify(`Upgraded from version ${upgradedFrom}. Use Save to choose where to keep the new version — the original file is untouched.`, { kind: 'warn', timeout: 12000 });
    } else link(handle);
  }
  writeRecovery.flush();
  rerender();
  if (!upgradedFrom) notify(`Opened ${name}`);
}

export async function newBlankBook() {
  if (!(await settleBeforeReplace())) return;
  beginSession();
  store.replace(newBook());
  unlink(); resetView(); rerender();
}

export async function loadExample(today) {
  if (!(await settleBeforeReplace())) return;
  beginSession();
  store.replace(exampleBook(today), { dirty: true });
  unlink(); resetView(); rerender();
  notify('Example loaded. It is synthetic — start your own with New book when ready.');
}

function unlink() { file.handle = null; file.name = ''; file.state = 'none'; file.restoredAt = null; }

function resetView() {
  restoreView(null);
}

// ── Recovery copy ──

let recoveryRevision = -1;
let recoveryFailed = false;

export const writeRecovery = debounce(() => {
  if (!prefs().recovery) return;
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ at: new Date().toISOString(), fileName: file.name, dirty: store.dirty, book: store.book, view: sessionView() }));
    recoveryRevision = store.revision;
    recoveryFailed = false;
  } catch {
    recoveryRevision = -1;
    if (!recoveryFailed) notify('Recovery copy could not be saved. Save your book to a file before closing.', { kind: 'warn' });
    recoveryFailed = true;
  }
}, 400);

function clearRecovery() {
  recoveryRevision = -1;
  try { localStorage.removeItem(RECOVERY_KEY); } catch { /* ignore */ }
}

/**
 * Closing is safe only when the current edits reached a file or recovery storage.
 * A linked file that is behind (e.g. waiting on Reconnect) also warns, so it never goes stale unnoticed.
 */
export function beforeUnload(event) {
  writeRecovery.flush();
  if (store.dirty && (file.handle || !prefs().recovery || recoveryRevision !== store.revision)) {
    event.preventDefault(); event.returnValue = '';
  }
}

/** On launch: restore the last session (and its file link, pending permission). */
export async function restoreSession() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(RECOVERY_KEY) || 'null'); } catch { saved = null; }
  if (!saved?.book) return false;
  let book; let upgradedFrom;
  try { ({ book, upgradedFrom } = decodeBook(JSON.stringify(saved.book))); } catch { return false; }
  store.replace(book, { dirty: !!saved.dirty || !!upgradedFrom });
  restoreView(saved.view);
  file.name = saved.fileName || '';
  if (saved.dirty) file.restoredAt = new Date(saved.at);
  if (upgradedFrom) {
    file.name = ''; file.handle = null; file.state = 'none';
    notify(`Recovered a version ${upgradedFrom} book and upgraded it for assignments. Save a new copy; the original file is untouched.`, { kind: 'warn', timeout: 12000 });
    return true;
  }
  const handle = await idbGet('lastFile');
  if (handle && handle.name === saved.fileName) {
    file.handle = handle;
    file.state = (await ensurePermission(handle, false).catch(() => false)) ? 'linked' : 'reconnect';
  }
  return true;
}

// ── IndexedDB holds the file handle (handles cannot go in localStorage) ──

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  try {
    const db = await idb();
    db.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
  } catch { /* storage blocked: linking still works for this session */ }
}

async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise(resolve => {
      const req = db.transaction('kv').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}
