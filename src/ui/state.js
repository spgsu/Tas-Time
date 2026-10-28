// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Shared UI state. The book itself lives in the store; this is view state only.
import { isIsoDate, mondayOf, todayIso } from '../core/dates.js';
import { createStore } from '../core/store.js';
import { newBook, NOTE_PAGES } from '../core/model.js';

export const VIEWS = [
  { id: 'today', label: 'Today', key: '1', icon: 'today' },
  { id: 'week', label: 'Week', key: '2', icon: 'week' },
  { id: 'plan', label: 'Plan', key: '3', icon: 'plan' },
  { id: 'board', label: 'Board', key: '4', icon: 'board' },
  { id: 'notes', label: 'Notes', key: '5', icon: 'notes' },
  { id: 'assignments', label: 'Assignments', key: '6', icon: 'people' },
  { id: 'lookahead', label: 'Lookahead', key: '7', icon: 'flag' },
];

export const store = createStore(newBook());

function defaultUi() { return {
  view: 'today',
  focus: '',            // job id the views are narrowed to
  week: mondayOf(todayIso()),
  drawer: null,         // { type: 'item' | 'job' | 'log', id }
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
  lookaheadTab: 'lookahead', // 'lookahead' | 'ball' | 'ppc'
  lookaheadWeeks: 6,
  logShowCleared: false,
}; }

export const ui = defaultUi();

/** JSON-safe view state, stored alongside the book so selections never cross books. */
export function sessionView() {
  const { addingIn, drawer, collapsedPhases, ...view } = ui;
  return { ...view, drawer: drawer ? { type: drawer.type, id: drawer.id } : null, collapsedPhases: [...collapsedPhases] };
}

/** Old or damaged recovery records fall back to valid defaults. */
export function restoreView(saved) {
  Object.assign(ui, defaultUi());
  if (!saved || typeof saved !== 'object') return;
  const choose = (key, choices) => { if (choices.includes(saved[key])) ui[key] = saved[key]; };
  choose('view', VIEWS.map(v => v.id));
  choose('notesPage', NOTE_PAGES.map(p => p[0]));
  choose('planRange', ['6w', '3m', 'all']);
  choose('lookaheadTab', ['lookahead', 'ball', 'ppc']);
  choose('lookaheadWeeks', [3, 4, 6]);
  for (const key of ['planShowDone', 'planShowArchived', 'boardAllDone', 'planMobileTimeline', 'assignmentFiltersOpen', 'logShowCleared']) {
    if (typeof saved[key] === 'boolean') ui[key] = saved[key];
  }
  for (const key of ['week', 'assignmentWeek']) if (isIsoDate(saved[key])) ui[key] = mondayOf(saved[key]);
  const jobIds = store.book.jobs.map(j => j.id);
  for (const key of ['focus', 'notesJob', 'quickJob']) choose(key, jobIds);
  const peopleIds = store.book.people.map(p => p.id);
  choose('workPerson', [...peopleIds, 'all', 'unassigned']);
  choose('quickAssignee', [...peopleIds, 'unassigned']);
  choose('quickPhase', store.book.phases.filter(p => p.jobId === ui.quickJob).map(p => p.id));
  if (Array.isArray(saved.collapsedPhases)) ui.collapsedPhases = new Set(saved.collapsedPhases.filter(k => typeof k === 'string'));
  const drawer = saved.drawer;
  const exists = { job: id => jobIds.includes(id), item: id => store.book.items.some(t => t.id === id), log: id => store.book.log.some(e => e.id === id) };
  if (drawer && Object.hasOwn(exists, drawer.type) && exists[drawer.type](drawer.id)) {
    ui.drawer = { type: drawer.type, id: drawer.id };
  }
  const filters = saved.assignments;
  if (filters && typeof filters === 'object') {
    const choices = { person: ['all', 'unassigned', ...peopleIds], status: ['all', 'open', 'todo', 'doing', 'blocked', 'done', 'late'], period: ['all', 'week', 'unscheduled'], group: ['job', 'person', 'status', 'week'] };
    for (const [key, values] of Object.entries(choices)) if (values.includes(filters[key])) ui.assignments[key] = filters[key];
    if (typeof filters.paused === 'boolean') ui.assignments.paused = filters.paused;
    if (typeof filters.search === 'string') ui.assignments.search = filters.search;
  }
}

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
