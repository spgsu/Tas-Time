// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Planning-book schema: factories, validation and migration from older files.
import { isIsoDate, mondayOf } from './dates.js';

export const FORMAT = 'tas-time-planning-book';
export const VERSION = 4;
export const MAX_FILE_BYTES = 15_000_000;

export const STATUS = { todo: 'To do', doing: 'Doing', done: 'Done' };
export const JOB_STATUS = { active: 'Active', hold: 'On hold', done: 'Complete' };
export const NOTE_PAGES = [
  ['restart', 'Resume here'],
  ['scope', 'Scope & outcome'],
  ['decisions', 'Decisions'],
  ['working', 'Working notes'],
  ['references', 'References'],
  ['lessons', 'Lessons learned'],
];
export const COLORS = {
  forest: { label: 'Forest', hex: '#2f6b4f' },
  blue: { label: 'Blue', hex: '#2f62a3' },
  plum: { label: 'Plum', hex: '#7d4f8a' },
  amber: { label: 'Amber', hex: '#a66a12' },
  teal: { label: 'Teal', hex: '#1f7a80' },
  rose: { label: 'Rose', hex: '#a8455f' },
  slate: { label: 'Slate', hex: '#56657a' },
  olive: { label: 'Olive', hex: '#6b7a2a' },
};
export const DEFAULT_CAPACITY = 10 * 60;
export const REPEAT_UNITS = { day: 'day', week: 'week', month: 'month' };
export const MAX_CHECKLIST = 100;

export function uid() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newBook(name = 'My planning book') {
  const self = { id: uid(), name: 'Me', capacity: DEFAULT_CAPACITY };
  return { format: FORMAT, version: VERSION, id: uid(), name, people: [self], selfId: self.id, jobs: [], phases: [], items: [], weeks: {}, baselineDate: '' };
}

export function newJob(fields = {}) {
  return {
    id: uid(), title: '', code: '', outcome: '', color: 'forest', status: 'active', archived: false,
    notes: Object.fromEntries(NOTE_PAGES.map(([k]) => [k, ''])), ...fields,
  };
}

export function newPhase(jobId, title, order) { return { id: uid(), jobId, title, order }; }

export function newItem(fields = {}) {
  return {
    id: uid(), jobId: '', phaseId: '', title: '', kind: 'task', status: 'todo',
    start: '', finish: '', effort: 0, plannedDay: '', assigneeId: '', owner: '', blocker: '', deps: [],
    baseline: null, doneOn: '', notes: '', archived: false, repeat: null, checklist: [], ...fields,
  };
}

/** Picks the first unused colour so new jobs are distinguishable by default. */
export function nextColor(book) {
  const used = new Set(book.jobs.filter(j => !j.archived).map(j => j.color));
  return Object.keys(COLORS).find(c => !used.has(c)) || 'forest';
}

function fail(message) { throw new Error(message); }
function text(v, label, max = 100000) { if (typeof v !== 'string' || v.length > max) fail(`${label} must be text (max ${max.toLocaleString()} characters).`); }
function date(v, label) { if (v !== '' && !isIsoDate(v)) fail(`${label} must be a real date.`); }
function whole(v, label, max) { if (!Number.isInteger(v) || v < 0 || v > max) fail(`${label} must be a whole number from 0 to ${max.toLocaleString()}.`); }

/** Throws a readable error for the first problem found; returns the book otherwise. */
export function validate(book) {
  if (!book || book.format !== FORMAT) fail('This file is not a Tas-Time planning book.');
  if (book.version !== VERSION) fail(`Unsupported planning-book version ${book.version}.`);
  text(book.name, 'Book name', 200);
  if (!Array.isArray(book.people) || !book.people.length || book.people.length > 2000) fail('The people list is invalid.');
  const people = new Map(); const names = new Set();
  for (const p of book.people) {
    if (!p || typeof p !== 'object') fail('A person is malformed.');
    text(p.id, 'Person identifier', 200); text(p.name, 'Person name', 200);
    const name = p.name.trim().toLowerCase();
    if (!p.id || people.has(p.id) || !name || names.has(name)) fail('People need unique identifiers and names.');
    whole(p.capacity, 'Default weekly capacity', 7 * 24 * 60);
    people.set(p.id, p); names.add(name);
  }
  if (!people.has(book.selfId)) fail('Choose a person for My work.');
  for (const k of ['jobs', 'phases', 'items']) if (!Array.isArray(book[k]) || book[k].length > 20000) fail(`The ${k} list is invalid.`);
  const ids = new Set();
  for (const row of [...book.jobs, ...book.phases, ...book.items]) {
    if (!row || typeof row !== 'object') fail('A record is malformed.');
    text(row.id, 'Identifier', 200);
    if (!row.id || ids.has(row.id)) fail('Record identifiers must be unique.');
    ids.add(row.id);
    text(row.title, 'Title', 500);
  }
  const jobs = new Map(book.jobs.map(j => [j.id, j]));
  const phases = new Map(book.phases.map(p => [p.id, p]));
  const items = new Map(book.items.map(t => [t.id, t]));
  for (const j of book.jobs) {
    text(j.code, 'Job code', 40); text(j.outcome, 'Outcome');
    if (!JOB_STATUS[j.status]) fail('Invalid job status.');
    if (!COLORS[j.color]) fail('Invalid job colour.');
    if (typeof j.archived !== 'boolean') fail('Invalid job archive flag.');
    if (!j.notes || typeof j.notes !== 'object') fail('Invalid job notebook.');
    for (const [k] of NOTE_PAGES) text(j.notes[k], 'Notebook page');
  }
  for (const p of book.phases) {
    if (!jobs.has(p.jobId)) fail('A phase belongs to a missing job.');
    whole(p.order, 'Phase order', 1e6);
  }
  for (const t of book.items) {
    if (!jobs.has(t.jobId)) fail(`"${t.title}" belongs to a missing job.`);
    if (typeof t.assigneeId !== 'string' || (t.assigneeId && !people.has(t.assigneeId))) fail(`"${t.title}" has a missing assignee.`);
    if (t.phaseId && phases.get(t.phaseId)?.jobId !== t.jobId) fail(`"${t.title}" refers to a phase from another job.`);
    if (!['task', 'milestone'].includes(t.kind)) fail('Invalid item kind.');
    if (!STATUS[t.status]) fail('Invalid item status.');
    if (typeof t.archived !== 'boolean') fail('Invalid item archive flag.');
    for (const k of ['owner', 'blocker', 'notes']) text(t[k], k);
    date(t.start, 'Start'); date(t.finish, 'Finish'); date(t.plannedDay, 'Planned day'); date(t.doneOn, 'Done date');
    if (t.start && t.finish && t.finish < t.start) fail(`"${t.title}" finishes before it starts.`);
    if (t.kind === 'milestone' && t.start !== t.finish) fail(`Milestone "${t.title}" needs a single date.`);
    whole(t.effort, 'Effort (minutes)', 1e6);
    if (t.baseline !== null) {
      if (typeof t.baseline !== 'object') fail('Invalid baseline.');
      date(t.baseline.start, 'Baseline start'); date(t.baseline.finish, 'Baseline finish');
    }
    if (t.repeat !== null) {
      if (!t.repeat || typeof t.repeat !== 'object' || !REPEAT_UNITS[t.repeat.unit]) fail(`"${t.title}" has an invalid repeat.`);
      if (!Number.isInteger(t.repeat.every) || t.repeat.every < 1 || t.repeat.every > 99) fail(`"${t.title}" must repeat every 1 to 99 ${t.repeat.unit}s.`);
    }
    if (!Array.isArray(t.checklist) || t.checklist.length > MAX_CHECKLIST) fail(`"${t.title}" has an invalid checklist (max ${MAX_CHECKLIST} steps).`);
    const steps = new Set();
    for (const c of t.checklist) {
      if (!c || typeof c !== 'object' || typeof c.done !== 'boolean') fail(`A checklist step in "${t.title}" is malformed.`);
      text(c.id, 'Checklist step identifier', 200); text(c.text, 'Checklist step', 500);
      if (!c.id || steps.has(c.id)) fail(`Checklist steps in "${t.title}" need unique identifiers.`);
      steps.add(c.id);
    }
    if (!Array.isArray(t.deps) || new Set(t.deps).size !== t.deps.length) fail('Invalid dependency list.');
    for (const d of t.deps) if (!items.has(d) || d === t.id) fail(`"${t.title}" depends on a missing item.`);
  }
  if (findCycle(book.items)) fail('These dependencies form a loop. Remove one of the links.');
  if (!book.weeks || typeof book.weeks !== 'object' || Array.isArray(book.weeks)) fail('Invalid weekly plans.');
  for (const [key, w] of Object.entries(book.weeks)) {
    if (!isIsoDate(key) || mondayOf(key) !== key) fail('Weekly plans must start on a Monday.');
    whole(w.capacity, 'Weekly capacity', 7 * 24 * 60); text(w.notes, 'Week notes');
    if (w.people !== undefined) {
      if (!w.people || typeof w.people !== 'object' || Array.isArray(w.people)) fail('Invalid weekly person capacities.');
      for (const [id, minutes] of Object.entries(w.people)) {
        if (!people.has(id)) fail('A weekly capacity refers to a missing person.');
        whole(minutes, 'Person weekly capacity', 7 * 24 * 60);
      }
    }
  }
  date(book.baselineDate, 'Baseline date');
  return book;
}

/** Iterative topological check (Kahn) so large imports cannot overflow the stack. */
export function findCycle(items) {
  const incoming = new Map(items.map(t => [t.id, t.deps.length]));
  const children = new Map(items.map(t => [t.id, []]));
  for (const t of items) for (const d of t.deps) children.get(d)?.push(t.id);
  const queue = items.filter(t => !t.deps.length).map(t => t.id);
  let seen = 0;
  while (queue.length) {
    const id = queue.pop(); seen++;
    for (const c of children.get(id)) { incoming.set(c, incoming.get(c) - 1); if (!incoming.get(c)) queue.push(c); }
  }
  return seen !== items.length;
}

/**
 * Fields added after a book was saved start empty instead of failing validation:
 * notebook pages, and task repeats and checklists (3.3). Older 3.x apps ignore these fields.
 */
function addMissingFields(book) {
  for (const j of Array.isArray(book.jobs) ? book.jobs : []) {
    if (j && j.notes && typeof j.notes === 'object') for (const [k] of NOTE_PAGES) if (j.notes[k] === undefined) j.notes[k] = '';
  }
  for (const t of Array.isArray(book.items) ? book.items : []) {
    if (!t || typeof t !== 'object') continue;
    if (t.repeat === undefined) t.repeat = null;
    if (t.checklist === undefined) t.checklist = [];
  }
  return book;
}

const V2_STATUS = { 'Not started': 'todo', 'In progress': 'doing', Done: 'done' };
const V2_JOB_STATUS = { Active: 'active', 'On hold': 'hold', Complete: 'done' };

/** Upgrades version 1 and 2 books to the current schema without dropping data. */
export function migrate(raw) {
  if (!raw || raw.format !== FORMAT) fail('This file is not a Tas-Time planning book.');
  if (raw.version === VERSION) return addMissingFields(raw);
  if (raw.version === 3) {
    const b = newBook();
    return addMissingFields({ ...raw, version: VERSION, people: b.people, selfId: b.selfId,
      weeks: Object.fromEntries(Object.entries(raw.weeks || {}).map(([day, week]) => [day, { ...week, people: { [b.selfId]: week.capacity } }])),
      items: raw.items.map(t => ({ ...t, assigneeId: b.selfId })) });
  }
  if (raw.version !== 1 && raw.version !== 2) fail(`Unsupported planning-book version ${raw.version}.`);
  const book = newBook(String(raw.name || 'Imported planning book'));
  book.baselineDate = raw.baselineDate || '';
  book.weeks = structuredClone(raw.weeks || {});
  for (const week of Object.values(book.weeks)) week.people = { [book.selfId]: week.capacity };
  for (const j of raw.jobs || []) {
    const notes = { ...newJob().notes, ...(j.notes || {}) };
    const color = COLORS[j.color] ? j.color : 'forest';
    book.jobs.push({ id: j.id, title: j.title, code: String(j.code || '').slice(0, 40), outcome: j.outcome || '', color,
      status: V2_JOB_STATUS[j.status] || 'active', archived: !!j.archived, notes });
  }
  book.phases = (raw.phases || []).map(p => ({ id: p.id, jobId: p.jobId, title: p.title, order: p.order }));
  for (const t of raw.items || []) {
    const hasBaseline = t.baselineStart || t.baselineFinish;
    book.items.push(newItem({
      id: t.id, jobId: t.jobId, phaseId: t.phaseId || '', title: t.title, kind: t.kind === 'Milestone' ? 'milestone' : 'task',
      assigneeId: book.selfId,
      status: V2_STATUS[t.status] || 'todo', start: t.start || '', finish: t.finish || '', effort: t.remaining || 0,
      plannedDay: t.plannedDay || '', owner: t.owner || '', blocker: t.blocker || '', deps: [...(t.predecessors || [])],
      baseline: hasBaseline ? { start: t.baselineStart || '', finish: t.baselineFinish || '' } : null,
      doneOn: t.acceptedOn || '', notes: t.notes || '', archived: !!t.archived,
    }));
  }
  return book;
}

/** Parses file text into a validated current-version book. */
export function decodeBook(textValue) {
  if (textValue.length > MAX_FILE_BYTES) fail('This file is larger than the 15 MB limit.');
  let raw;
  try { raw = JSON.parse(textValue); } catch { fail('This file is not valid JSON.'); }
  const upgraded = raw?.version !== VERSION;
  return { book: validate(migrate(raw)), upgradedFrom: upgraded ? raw.version : null };
}

export function encodeBook(book) { return JSON.stringify(validate(book), null, 2); }

