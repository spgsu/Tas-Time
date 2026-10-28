// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Two windows on one book share a recovery copy and race to save. Each window announces the book it
// shows through localStorage, whose storage event reaches the other windows of this browser, so both
// can warn. (The file itself is protected separately: a save never overwrites a file changed elsewhere.)
import { notify, store } from './state.js';

const KEY = 'tas-time:presence';
const me = globalThis.crypto?.randomUUID?.() || `w-${Date.now()}-${Math.random()}`;
let warnedFor = '';

function say(kind) {
  try { localStorage.setItem(KEY, JSON.stringify({ from: me, kind, bookId: store.book.id, at: Date.now() })); } catch { /* storage unavailable */ }
}

export function onPresence(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || msg.from === me || msg.bookId !== store.book.id) return;
  if (msg.kind === 'hello') say('here');
  if (warnedFor === store.book.id) return;
  warnedFor = store.book.id;
  notify('This book is also open in another Tas-Time window. Close one of them: edits made in both can conflict.', { kind: 'warn', timeout: 20000 });
}

export function initPresence(target = globalThis) {
  target.addEventListener('storage', e => { if (e.key === KEY && e.newValue) onPresence(e.newValue); });
  store.subscribe(reason => { if (reason === 'replace') say('hello'); });
  say('hello');
}
