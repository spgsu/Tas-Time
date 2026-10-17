// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// User commands shared by menus, buttons and keyboard shortcuts.
import { act, notify, openDrawer, rerender, store, ui, today } from './state.js';
import { addItem, addJob, deleteItem, deleteJob } from '../core/ops.js';
import { itemOf, jobOf, liveJobs } from '../core/query.js';
import { parseQuickAdd } from '../core/parse.js';

export const STANDARD_PHASES = ['Scope', 'Plan', 'Execute', 'Review & accept'];

export function createJob(title = '') {
  const job = act('New job', d => addJob(d, { title: title || 'Untitled job' }));
  if (job) { ui.focus = ''; openDrawer('job', job.id, 'title'); }
  return job;
}

export function undo() {
  const label = store.undo();
  if (label) notify(`Undid: ${label}`, { action: { label: 'Redo', run: redo } });
}

export function redo() {
  const label = store.redo();
  if (label) notify(`Redid: ${label}`);
}

/** Creates an item from quick-add text. Falls back to the focused job, then the first job. */
export function quickAdd(text, defaults = {}) {
  const book = store.book;
  const q = parseQuickAdd(text, book.jobs, today());
  // Refuse rather than guess: a mistyped #job or !date would otherwise land silently in the wrong place.
  if (q.errors.length) { notify(`Not added — ${q.errors.join('; ')}. Fix it and press Enter again.`, { kind: 'warn' }); return null; }
  if (!q.title) { notify('Type a title for the task.', { kind: 'warn' }); return null; }
  let jobId = q.jobId || defaults.jobId || ui.focus || liveJobs(book)[0]?.id;
  if (!jobId) jobId = act('New job', d => addJob(d, { title: 'Inbox', code: 'INBOX' }))?.id;
  const finish = q.finish || (q.kind === 'milestone' ? q.plannedDay || today() : '');
  const item = act('Add task', d => addItem(d, {
    jobId, phaseId: defaults.phaseId && !q.jobId ? defaults.phaseId : '', title: q.title, kind: q.kind,
    effort: q.effort ?? 0, plannedDay: q.kind === 'milestone' ? '' : q.plannedDay || defaults.plannedDay || '', finish,
    start: defaults.start || '',
  }));
  if (item) {
    const job = jobOf(store.book, item.jobId);
    notify(`Added “${item.title}” to ${job.code || job.title}`, { action: { label: 'Open', run: () => openDrawer('item', item.id) } });
  }
  return item;
}

export function removeItem(id) {
  const t = itemOf(store.book, id);
  if (!t) return;
  act('Delete', d => deleteItem(d, id));
  if (itemOf(store.book, id)) return;
  if (ui.drawer?.id === id) ui.drawer = null;
  rerender();
  notify(`Deleted “${t.title}”`, { action: { label: 'Undo', run: undo } });
}

export function removeJob(id) {
  const j = jobOf(store.book, id);
  const count = store.book.items.filter(t => t.jobId === id).length;
  if (!confirm(`Delete “${j.title}” and its ${count} item${count === 1 ? '' : 's'}? You can undo this until you close the app. Archive keeps it instead.`)) return;
  act('Delete job', d => deleteJob(d, id));
  if (ui.focus === id) ui.focus = '';
  ui.drawer = null;
  rerender();
  notify(`Deleted job “${j.title}”`, { action: { label: 'Undo', run: undo } });
}
