// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// ⋯ action menus for jobs and tasks. Every change here is also available in the editor panel,
// so each action has at least two ways in, both usable by keyboard and screen reader.
import { h, icon } from './dom.js';
import { JOB_STATUS } from '../core/model.js';
import { blockers, itemOf, jobOf } from '../core/query.js';
import { patchItem } from '../core/ops.js';
import { act, openDrawer, setFocus, setView, store, today, ui } from './state.js';
import { showMenu } from './overlay.js';
import { createTask, duplicateTask, removeItem, removeJob, renameJob, renameTask, setItemStatus, setJobArchived, setJobStatus } from './commands.js';

/** The ⋯ button. `extra` items (e.g. day planning in Week) are shown above the standard ones. */
export function taskMenuButton(t, { extra = () => [], className = '' } = {}) {
  return menuButton(`Actions for task “${t.title}”`, ['task-menu', className], () => [...extra(), ...taskActions(t.id)]);
}

export function jobMenuButton(job, { className = '' } = {}) {
  return menuButton(`Actions for job “${job.title || 'Untitled job'}”`, ['job-menu', className], () => jobActions(job.id));
}

function menuButton(label, classes, items) {
  return h('button', {
    class: ['icon-btn', 'sm', 'actions-btn', ...classes], 'aria-label': label, title: label, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: e => { e.stopPropagation(); showMenu(e.currentTarget, items()); },
  }, icon('more', 18));
}

export function taskActions(id) {
  const t = itemOf(store.book, id);
  if (!t) return [];
  const reasons = t.status === 'done' ? [] : blockers(store.book, t);
  const planned = t.plannedDay === today();
  return [
    { heading: 'Task' },
    { label: 'Edit task…', icon: 'open', run: () => openDrawer('item', id) },
    { label: 'Rename…', icon: 'pencil', run: () => renameTask(id) },
    t.status === 'done'
      ? { label: 'Reopen', icon: 'undo', run: () => setItemStatus(id, 'todo', 'Reopen') }
      : { label: reasons.length ? `Mark done (blocked: ${reasons[0]})` : 'Mark done', icon: 'check', disabled: !!reasons.length, run: () => setItemStatus(id, 'done', 'Complete') },
    t.status === 'todo' ? { label: 'Mark doing', icon: 'clock', run: () => setItemStatus(id, 'doing') } : null,
    t.status === 'doing' ? { label: 'Back to to do', icon: 'left', run: () => setItemStatus(id, 'todo') } : null,
    t.kind !== 'milestone' && t.status !== 'done'
      ? planned
        ? { label: 'Remove work day', icon: 'x', run: () => act('Unplan', d => patchItem(d, id, { plannedDay: '' }, today())) }
        : { label: 'Work on it today', icon: 'today', run: () => act('Plan for today', d => patchItem(d, id, { plannedDay: today() }, today())) }
      : null,
    { label: 'Duplicate', icon: 'copy', run: () => duplicateTask(id) },
    'separator',
    { label: t.archived ? 'Restore from archive' : 'Archive', icon: 'archive', run: () => act(t.archived ? 'Restore' : 'Archive', d => patchItem(d, id, { archived: !t.archived }, today())) },
    { label: 'Delete task', icon: 'trash', danger: true, run: () => removeItem(id) },
  ].filter(Boolean);
}

export function jobActions(id) {
  const job = jobOf(store.book, id);
  if (!job) return [];
  return [
    { heading: 'Job' },
    { label: 'Edit job…', icon: 'open', run: () => openDrawer('job', id) },
    { label: 'Rename…', icon: 'pencil', run: () => renameJob(id) },
    { label: ui.focus === id ? 'Show all jobs' : 'Show only this job', icon: 'focus', run: () => setFocus(id) },
    !job.archived ? { label: 'Add task', icon: 'plus', run: () => createTask(id) } : null,
    { label: 'Open notebook', icon: 'notes', run: () => { ui.notesJob = id; ui.drawer = null; setView('notes'); } },
    { heading: 'Status' },
    ...Object.entries(JOB_STATUS).map(([key, label]) => ({
      label: job.status === key ? `${label} (current)` : `Mark ${label.toLowerCase()}`,
      icon: job.status === key ? 'check' : null, disabled: job.status === key, run: () => setJobStatus(id, key),
    })),
    'separator',
    { label: job.archived ? 'Restore job' : 'Archive job', icon: 'archive', run: () => setJobArchived(id, !job.archived) },
    { label: 'Delete job…', icon: 'trash', danger: true, run: () => removeJob(id) },
  ].filter(Boolean);
}
