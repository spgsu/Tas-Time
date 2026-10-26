// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Shared UI state. The book itself lives in the store; this is view state only.
import { mondayOf, todayIso } from '../core/dates.js';
import { createStore } from '../core/store.js';
import { newBook } from '../core/model.js';

export const VIEWS = [
  { id: 'today', label: 'Today', key: '1', icon: 'today' },
  { id: 'week', label: 'Week', key: '2', icon: 'week' },
  { id: 'plan', label: 'Plan', key: '3', icon: 'plan' },
  { id: 'board', label: 'Board', key: '4', icon: 'board' },
  { id: 'notes', label: 'Notes', key: '5', icon: 'notes' },
  { id: 'assignments', label: 'Assignments', key: '6', icon: 'people' },
];

export const store = createStore(newBook());

export const ui = {
  view: 'today',
  focus: '',            // job id the views are narrowed to
  week: mondayOf(todayIso()),
  drawer: null,         // { type: 'item' | 'job', id }
  notesJob: '',
  notesPage: 'restart',
  planRange: '6w',      // '6w' | '3m' | 'all'
  planShowDone: true,
  planShowArchived: false,
  boardAllDone: false,
  addingIn: '',         // phase key with an open inline-add row in Plan
  collapsedPhases: new Set(),
  planMobileTimeline: false,
  quickJob: '',
  quickPhase: '',
  quickAssignee: '',
  workPerson: '',
  assignmentWeek: mondayOf(todayIso()),
  assignmentFiltersOpen: false,
  assignments: { person: 'all', status: 'open', period: 'all', group: 'job', paused: false, search: '' },
};

export function today() { return todayIso(); }

/** Commits a change and turns validation errors into a toast instead of an exception. */
export function act(label, fn, options) {
  try { return store.commit(label, fn, options); } catch (error) { notify(error.message, { kind: 'error' }); return undefined; }
}

const notifiers = [];
export function onNotify(fn) { notifiers.push(fn); }
export function notify(message, options = {}) { for (const fn of notifiers) fn(message, options); }

const renderers = [];
export function onRender(fn) { renderers.push(fn); }
export function rerender(scope = 'all') { for (const fn of renderers) fn(scope); }

export function setView(view) {
  ui.view = view;
  rerender();
  document.getElementById('main')?.focus({ preventScroll: true });
}

export function setFocus(jobId) {
  ui.focus = ui.focus === jobId ? '' : jobId;
  if (ui.focus) ui.notesJob = ui.focus;
  ui.quickJob = ui.focus;
  ui.quickPhase = '';
  rerender();
}

export function openDrawer(type, id, focusField = '') {
  if (type === 'job') { ui.quickJob = id; ui.quickPhase = ''; }
  ui.drawer = { type, id, focusField };
  rerender();
}

export function closeDrawer() {
  if (!ui.drawer) return;
  ui.drawer = null;
  rerender();
}

const PLATFORM = globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || '';
export const IS_MAC = /mac/i.test(PLATFORM);

/** Shortcut label in the platform's convention: keys('Shift+S') → "Ctrl+Shift+S" or "⇧⌘S". Both Ctrl and ⌘ work everywhere. */
export function keys(combo) {
  return IS_MAC ? `${combo.startsWith('Shift+') ? '⇧' : ''}⌘${combo.replace('Shift+', '')}` : `Ctrl+${combo}`;
}

/** Replaced with package.json's version by the build. */
export const APP_VERSION = '{{VERSION}}';
