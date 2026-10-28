// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Saving and opening planning books.
//
// Three layers, strongest first:
//  1. A linked file (File System Access API, Edge/Chrome): explicit save, then autosave.
//  2. A recovery copy in this browser's local storage, restored on next launch.
//  3. Download fallback where neither is available (cannot confirm the write).
// Separately, rolling backups of each book are kept in this browser's IndexedDB.
import { decodeBook, encodeBook, newBook } from '../core/model.js';
import { BACKUP_GAP_MS, withBackup } from '../core/backups.js';
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
  state: 'none',        // none | linked | saving | error | reconnect | conflict
  disk: null,           // { modified, raw } of the linked file as this window last read or wrote it
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

class FileChanged extends Error {
  constructor() { super('The file was changed outside this window since Tas-Time last read or saved it. Nothing was written.'); this.name = 'FileChanged'; }
}

/** What the linked file holds now, or null where this browser cannot tell. */
async function readDisk(handle) {
  if (typeof handle?.getFile !== 'function') return null;
  const f = await handle.getFile();
  if (typeof f.lastModified !== 'number') return null;
  return { modified: f.lastModified, text: () => f.text() };
}

/** True when the linked file still holds what this window last read or wrote. */
async function diskUnchanged(handle) {
  if (!file.disk || handle !== file.handle) return true;
  const now = await readDisk(handle);
  if (!now || now.modified === file.disk.modified) return true;
  // Sync clients sometimes touch the timestamp without changing the content: not a conflict.
  if (file.disk.raw !== null && await now.text() === file.disk.raw) { file.disk.modified = now.modified; return true; }
  return false;
}

/** Stops autosave until the user chooses which version to keep. */
function markConflict() {
  autosave.cancel();
  file.state = 'conflict';
  rerender('status');
  notify(`${file.name} was changed outside this window. Nothing was overwritten — choose which version to keep.`, { kind: 'warn', timeout: 15000, action: { label: 'Choose', run: () => onConflict() } });
}

let onConflict = () => {};
/** The UI registers the dialog that resolves a conflict, keeping dialogs out of this module. */
export function setConflictHandler(fn) { onConflict = fn; }

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
    if (error.name === 'FileChanged') { if (snap.session === session) markConflict(); return false; }
    if (snap.session === session) { file.state = 'error'; file.lastError = error.message; rerender('status'); }
    notify(`Save failed: ${error.message}`, { kind: 'error' });
    return false;
  }
}

/** Writes are serialised; each writes its own snapshot and only updates state for its own session. */
function queueWrite(handle, snap, { linkOnSuccess = false } = {}) {
  if (snap.session === session) { file.state = 'saving'; rerender('status'); }
  writing = writing.catch(() => {}).then(async () => {
    if (snap.session === session && !(await diskUnchanged(handle))) throw new FileChanged();
    const writer = await handle.createWritable();
    await writer.write(snap.raw);
    await writer.close();
    if (snap.session !== session) return;
    if (linkOnSuccess) link(handle);
    // An autosave queued before Save as may still target the previous file.
    // Only a write to the current destination can mark this book as saved.
    if (handle !== file.handle) return;
    const after = await readDisk(handle).catch(() => null);
    file.disk = after ? { modified: after.modified, raw: snap.raw } : null;
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
  if (!handle || file.state === 'reconnect' || file.state === 'conflict') return false;
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
    if (snap.session !== session) return false;
    if (error.name === 'FileChanged') markConflict();
    else { file.state = 'error'; file.lastError = error.message; rerender('status'); }
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
    await checkLinkedFile();
    if (file.state !== 'linked' || mine !== session) return false;
    if (store.dirty) await queueWrite(file.handle, snapshot());
    rerender('status');
    return true;
  } catch (error) {
    if (error.name === 'FileChanged') { markConflict(); return false; }
    notify(error.message, { kind: 'error' });
    return false;
  }
}

/**
 * Picks up a version of the linked file saved elsewhere (another PC, another window): loads it when
 * this window has no unsaved edits, otherwise flags a conflict. Runs on launch, Reconnect and when
 * the window becomes visible again.
 */
export async function checkLinkedFile() {
  const handle = file.handle;
  if (!handle || file.state !== 'linked') return;
  const mine = session;
  let now;
  try { now = await readDisk(handle); } catch { return; }
  if (!now || mine !== session || handle !== file.handle) return;
  if (file.disk && now.modified === file.disk.modified) return;
  const text = await now.text();
  if (mine !== session || handle !== file.handle) return;
  if (text === encodeBook(store.book) || (file.disk && file.disk.raw === text)) { file.disk = { modified: now.modified, raw: text }; return; }
  if (store.dirty) { markConflict(); return; }
  try { adoptDisk(handle, text, now.modified); } catch (error) { file.state = 'error'; file.lastError = error.message; rerender('status'); return; }
  notify(`Loaded the newer version of ${handle.name} saved elsewhere.`);
}

/** Shows the linked file's own content, keeping the view where it can. */
function adoptDisk(handle, text, modified) {
  const { book, upgradedFrom } = decodeBook(text);
  if (upgradedFrom) throw new Error(`${handle.name} now holds a version ${upgradedFrom} book. Use Open… to upgrade it.`);
  const view = sessionView();
  beginSession();
  store.replace(book);
  restoreView(view);
  file.handle = handle; file.name = handle.name; file.state = 'linked'; file.restoredAt = null;
  file.disk = { modified, raw: text };
  writeRecovery.flush();
  backup({ force: true });
  rerender();
}

/** Conflict choice: show the file's version. This window's version is kept as a backup first. */
export async function useFileVersion() {
  const handle = file.handle;
  const now = await readDisk(handle);
  await backup({ force: true });
  adoptDisk(handle, await now.text(), now.modified);
  notify(`Showing ${handle.name} as saved elsewhere. Your version is in Backups.`, { kind: 'warn', timeout: 9000 });
}

/** Conflict choice: overwrite the file with this window's version. The file's version is kept as a backup first. */
export async function keepThisVersion() {
  const handle = file.handle;
  const now = await readDisk(handle);
  if (now) await backupRaw(await now.text());
  file.disk = null;
  file.state = 'linked';
  await queueWrite(handle, snapshot());
  rerender('status');
  notify(`Saved your version to ${handle.name}. The version saved elsewhere is in Backups.`, { kind: 'warn', timeout: 9000 });
}

function download(raw = encodeBook(store.book), name = file.name || suggestedName()) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
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
      await loadText(await f.text(), f.name, handle, f.lastModified);
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

async function loadText(text, name, handle, modified) {
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
    } else {
      link(handle);
      file.disk = typeof modified === 'number' ? { modified, raw: text } : null;
    }
  }
  writeRecovery.flush();
  backup({ force: true });
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

function unlink() { file.handle = null; file.name = ''; file.state = 'none'; file.restoredAt = null; file.disk = null; }

function resetView() {
  restoreView(null);
}

// ── Recovery copy ──

let recoveryRevision = -1;
let recoveryFailed = false;

export const writeRecovery = debounce(() => {
  if (!prefs().recovery) return;
  try {
    maybeBackup();
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ at: new Date().toISOString(), fileName: file.name, fileModified: file.disk?.modified ?? null, dirty: store.dirty, book: store.book, view: sessionView() }));
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
  backups = backups.catch(() => {}).then(() => idbDeleteWhere(key => typeof key === 'string' && (key.startsWith('backups:') || key === 'backups-index')));
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
  backup({ force: true });
  const handle = await idbGet('lastFile');
  if (handle && handle.name === saved.fileName) {
    file.handle = handle;
    // Without unsaved edits the recovery copy is what was last saved, so a newer file is detectable by content too.
    file.disk = typeof saved.fileModified === 'number' ? { modified: saved.fileModified, raw: saved.dirty ? null : encodeBook(book) } : null;
    file.state = (await ensurePermission(handle, false).catch(() => false)) ? 'linked' : 'reconnect';
    await checkLinkedFile();
  }
  return true;
}

// ── Rolling backups: up to BACKUP_KEEP versions per book, at least BACKUP_GAP_MS apart ──

const backupKey = id => `backups:${id}`;
const BACKUP_BOOKS = 20;

/** Saves a book's backups and forgets the least recently backed-up books beyond BACKUP_BOOKS. */
async function storeBackups(bookId, list) {
  await idbSet(backupKey(bookId), list);
  const index = { ...(await idbGet('backups-index')), [bookId]: list[0].at };
  const stale = Object.keys(index).sort((x, y) => index[y].localeCompare(index[x])).slice(BACKUP_BOOKS);
  for (const id of stale) { delete index[id]; await idbDelete(backupKey(id)); }
  await idbSet('backups-index', index);
}
let backups = Promise.resolve();
let lastBackupTry = { id: '', at: 0 };

/** Newest first: [{ at, name, fileName, tasks, raw }]. Empty when browser storage is unavailable. */
export async function listBackups(bookId = store.book.id) {
  await backups.catch(() => {});
  return readBackups(bookId);
}

async function readBackups(bookId) {
  const list = await idbGet(backupKey(bookId));
  return Array.isArray(list) ? list : [];
}

/** Keeps a copy of the open book. force: also within BACKUP_GAP_MS (on open, before a restore). */
export function backup({ force = false } = {}) {
  const book = store.book;
  // Backups follow the recovery setting: off on a shared computer means nothing stays in this browser.
  if (!book.jobs.length || !prefs().recovery) return backups;
  const entry = { at: new Date().toISOString(), name: book.name, fileName: file.name, tasks: book.items.length, raw: encodeBook(book) };
  lastBackupTry = { id: book.id, at: Date.now() };
  backups = backups.catch(() => {}).then(async () => {
    const next = withBackup(await readBackups(book.id), entry, { force }); // not listBackups: it would wait for this very step
    if (next) await storeBackups(book.id, next);
  });
  return backups;
}

/** Cheap enough to call on every recovery write: storage is only read once per gap. */
function maybeBackup() {
  if (lastBackupTry.id === store.book.id && Date.now() - lastBackupTry.at < BACKUP_GAP_MS) return;
  backup();
}

/** Keeps another version of the open book (the file's, before overwriting it) as a backup. */
async function backupRaw(raw) {
  let book;
  try { ({ book } = decodeBook(raw)); } catch { return; }
  if (book.id !== store.book.id || !prefs().recovery) return;
  const entry = { at: new Date().toISOString(), name: book.name, fileName: file.name, tasks: book.items.length, raw: encodeBook(book) };
  backups = backups.catch(() => {}).then(async () => {
    const next = withBackup(await readBackups(book.id), entry, { force: true });
    if (next) await storeBackups(book.id, next);
  });
  await backups;
}

/** Replaces the open book's content with a backup as one undoable step; the file link stays. */
export async function restoreBackup(entry) {
  const { book } = decodeBook(entry.raw);
  if (book.id !== store.book.id) throw new Error('That backup belongs to a different book.');
  await backup({ force: true });
  return store.commit(`Restore backup from ${new Date(entry.at).toLocaleString()}`, draft => {
    for (const k of Object.keys(draft)) delete draft[k];
    Object.assign(draft, book);
  });
}

export function downloadBackup(entry) {
  const stamp = entry.at.slice(0, 16).replace('T', '-').replace(':', '');
  return download(entry.raw, `${(entry.fileName || suggestedName()).replace(/\.json$/i, '')}-backup-${stamp}.json`);
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
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } catch { /* storage blocked: linking still works for this session */ }
}

async function idbDelete(key) {
  try {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  } catch { /* storage blocked: nothing stored */ }
}

async function idbDeleteWhere(match) {
  try {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      const req = tx.objectStore('kv').getAllKeys();
      req.onsuccess = () => { for (const key of req.result) if (match(key)) tx.objectStore('kv').delete(key); };
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  } catch { /* storage blocked: nothing stored */ }
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
