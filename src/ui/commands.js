// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// User commands shared by menus, buttons and keyboard shortcuts.
import { act, notify, openDrawer, rerender, store, ui, today } from './state.js';
import { addItem, addJob, deleteItem, deleteJob, patchItem } from '../core/ops.js';
import { itemOf, jobOf, liveJobs } from '../core/query.js';
import { fmtRepeat, parseQuickAdd } from '../core/parse.js';
import { fmtDate } from '../core/dates.js';

export const STANDARD_PHASES = ['Scope', 'Plan', 'Execute', 'Review & accept'];

export function createJob(title = '') {
  const job = act('New job', d => addJob(d, { title: title || 'Untitled job' }));
  if (job) { ui.focus = job.id; ui.quickJob = job.id; ui.quickPhase = ''; openDrawer('job', job.id, 'title'); }
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
    jobId, phaseId: book.phases.some(p => p.id === defaults.phaseId && p.jobId === jobId) ? defaults.phaseId : '', title: q.title, kind: q.kind,
    effort: q.effort ?? 0, plannedDay: q.kind === 'milestone' ? '' : q.plannedDay || defaults.plannedDay || '', finish,
    start: defaults.start || '',
    assigneeId: defaults.assigneeId ?? book.selfId,
  }));
  if (item) {
    const job = jobOf(store.book, item.jobId);
    const phase = store.book.phases.find(p => p.id === item.phaseId);
    notify(`Added task “${item.title}” to ${job.title} / ${phase?.title || 'Tasks without a phase'}${item.plannedDay ? ` · Work on ${item.plannedDay}` : ' · No work day set'}`, { action: { label: 'Open', run: () => openDrawer('item', item.id) } });
  }
  return item;
}

/** Structured creation keeps destination and work day visible in the task editor. */
export function createTask(jobId = ui.focus || ui.quickJob || liveJobs(store.book)[0]?.id, phaseId = '', plannedDay = '', assigneeId = store.book.selfId) {
  if (!jobId) jobId = createJob('Inbox')?.id;
  if (!jobId) return;
  const item = act('New task', d => addItem(d, { jobId, phaseId, plannedDay, assigneeId, title: 'Untitled task' }));
  if (item) openDrawer('item', item.id, 'title');
  return item;
}

/** Every status change goes through here so completing a repeating task says where the next one went. */
export function setItemStatus(id, status, label = status === 'done' ? 'Complete' : 'Change status') {
  const before = itemOf(store.book, id);
  const repeat = before?.status !== 'done' && status === 'done' ? before.repeat : null;
  const done = act(label, d => patchItem(d, id, { status }, today()));
  if (!done || !repeat) return done;
  const list = store.book.items;
  const next = list[list.findIndex(t => t.id === id) + 1];
  const when = next?.plannedDay || next?.start || next?.finish;
  if (next) notify(`${fmtRepeat(repeat)}: next “${next.title}”${when ? ` ${next.plannedDay ? 'to work on' : 'from'} ${fmtDate(when)}` : ''}.`, { action: { label: 'Open', run: () => openDrawer('item', next.id) } });
  return done;
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
