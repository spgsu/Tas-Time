// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Book state with undo/redo. Every change goes through commit(), which clones,
// applies the mutation, validates, and only then publishes the new book.
import { validate } from './model.js';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1500;

export function createStore(initial) {
  let book = validate(initial);
  let past = [];
  let future = [];
  let revision = 0;
  let savedRevision = 0;
  let lastKey = '';
  let lastAt = 0;
  const listeners = new Set();

  const emit = reason => { for (const fn of listeners) fn(reason); };

  return {
    get book() { return book; },
    get revision() { return revision; },
    get dirty() { return revision !== savedRevision; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /**
     * Applies fn to a draft. Typing into one field produces one undo step:
     * commits with the same key within COALESCE_MS replace the last snapshot.
     * Returns fn's result. Throws (leaving state untouched) when the change is invalid.
     */
    commit(label, fn, { key = '', quiet = false } = {}) {
      const draft = structuredClone(book);
      const result = fn(draft);
      validate(draft);
      const now = Date.now();
      const coalesce = key && key === lastKey && now - lastAt < COALESCE_MS;
      if (!coalesce) {
        past.push({ book, label });
        if (past.length > HISTORY_LIMIT) past.shift();
      }
      future = [];
      lastKey = key; lastAt = now;
      book = draft; revision++;
      emit(quiet ? 'quiet' : 'change');
      return result;
    },

    undo() {
      const step = past.pop();
      if (!step) return '';
      future.push({ book, label: step.label });
      book = step.book; revision++; lastKey = '';
      emit('change');
      return step.label;
    },

    redo() {
      const step = future.pop();
      if (!step) return '';
      past.push({ book, label: step.label });
      book = step.book; revision++; lastKey = '';
      emit('change');
      return step.label;
    },

    /** Replaces the whole book (open, new, example). Clears history. */
    replace(next, { dirty = false } = {}) {
      book = validate(next); past = []; future = []; lastKey = '';
      revision++; savedRevision = dirty ? -1 : revision;
      emit('replace');
    },

    markSaved(atRevision) { savedRevision = atRevision; emit('saved'); },
  };
}
