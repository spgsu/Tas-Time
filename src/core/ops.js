// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Mutations. Each takes a draft book (already cloned by the store) and edits it in place.
import { addDays, addMonths, diffDays } from './dates.js';
import { DEFAULT_CAPACITY, newItem, newJob, newPhase, nextColor, uid } from './model.js';
import { blockers, itemOf, jobOf, phasesOf } from './query.js';

export function addJob(book, fields = {}, phaseTitles = []) {
  const job = newJob({ color: nextColor(book), ...fields });
  book.jobs.push(job);
  phaseTitles.forEach((title, order) => book.phases.push(newPhase(job.id, title, order)));
  return job;
}

export function addItem(book, fields) {
  const item = newItem({ assigneeId: book.selfId, ...fields });
  if (item.kind === 'milestone') item.start = item.finish;
  book.items.push(item);
  return item;
}

export function patchItem(book, id, patch, today) {
  const t = itemOf(book, id);
  if (!t) throw new Error('That item no longer exists.');
  const next = { ...t, ...patch };
  if (patch.jobId && patch.jobId !== t.jobId && !('phaseId' in patch)) next.phaseId = '';
  if (next.kind === 'milestone') {
    if (!('finish' in patch)) next.finish = next.finish || next.start;
    next.start = next.finish;
  }
  if ('start' in patch && next.kind === 'task' && next.start && next.finish && next.finish < next.start) {
    // Moving the start past the finish keeps the duration rather than failing.
    next.finish = t.start && t.finish ? addDays(next.start, diffDays(t.start, t.finish)) : next.start;
  }
  if ('status' in patch) applyStatus(book, next, t.status, today);
  Object.assign(t, next);
  return t;
}

function applyStatus(book, next, previous, today) {
  if (next.status === previous) return;
  if (next.status === 'done') {
    const reasons = blockers(book, { ...next, status: 'todo' });
    if (reasons.length) throw new Error(`Can’t complete yet: ${reasons.join('; ')}.`);
    next.doneOn = today;
    if (next.repeat) {
      // The series moves to the new occurrence, so reopening and re-completing this one never repeats twice.
      book.items.splice(book.items.findIndex(x => x.id === next.id) + 1, 0, nextOccurrence(next, today));
      next.repeat = null;
    }
  } else next.doneOn = '';
}

function step(iso, { every, unit }) {
  return unit === 'month' ? addMonths(iso, every) : addDays(iso, unit === 'week' ? every * 7 : every);
}

/**
 * The next open copy of a repeating item. Its dates move on by the interval from the item's own
 * schedule (not from the completion day), skipping occurrences already in the past.
 * An item with no dates gets a work day one interval after today.
 */
export function nextOccurrence(t, today) {
  const anchor = t.plannedDay || t.start || t.finish;
  const copy = {
    ...structuredClone(t), id: uid(), status: 'todo', doneOn: '', baseline: null,
    checklist: t.checklist.map(c => ({ ...c, id: uid(), done: false })),
  };
  if (!anchor) { copy.plannedDay = step(today, t.repeat); return copy; }
  let n = 0; let day = anchor;
  do { n++; day = step(anchor, { ...t.repeat, every: t.repeat.every * n }); } while (day <= today && n < 10000);
  // Each date moves by the same number of steps so months stay on their day (31st → 30th → 31st).
  for (const k of ['plannedDay', 'start', 'finish']) if (t[k]) copy[k] = step(t[k], { ...t.repeat, every: t.repeat.every * n });
  return copy;
}

export function addStep(book, id, text) {
  const t = itemOf(book, id);
  const s = { id: uid(), text: text.trim().slice(0, 500), done: false };
  t.checklist.push(s);
  return s;
}

export function patchStep(book, id, stepId, patch) {
  const s = itemOf(book, id).checklist.find(c => c.id === stepId);
  if (!s) throw new Error('That checklist step no longer exists.');
  Object.assign(s, patch);
}

export function removeStep(book, id, stepId) {
  const t = itemOf(book, id);
  t.checklist = t.checklist.filter(c => c.id !== stepId);
}

export function moveStep(book, id, stepId, delta) {
  const list = itemOf(book, id).checklist;
  const i = list.findIndex(c => c.id === stepId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

export function setStatus(book, id, status, today) { return patchItem(book, id, { status }, today); }

/** Moves a bar on the programme, keeping its duration. */
export function shiftItem(book, id, days) {
  const t = itemOf(book, id);
  if (!days) return;
  if (t.start) t.start = addDays(t.start, days);
  if (t.finish) t.finish = addDays(t.finish, days);
}

export function deleteItem(book, id) {
  book.items = book.items.filter(t => t.id !== id);
  for (const t of book.items) t.deps = t.deps.filter(d => d !== id);
}

export function duplicateItem(book, id) {
  const t = itemOf(book, id);
  const copy = { ...structuredClone(t), id: uid(), title: `${t.title} (copy)`, status: 'todo', doneOn: '', baseline: null };
  book.items.splice(book.items.indexOf(t) + 1, 0, copy);
  return copy;
}

export function patchJob(book, id, patch) {
  const j = jobOf(book, id);
  if (!j) throw new Error('That job no longer exists.');
  Object.assign(j, patch);
  return j;
}

export function setNote(book, jobId, page, value) { jobOf(book, jobId).notes[page] = value; }

export function addPhase(book, jobId, title) {
  const order = phasesOf(book, jobId).reduce((n, p) => Math.max(n, p.order + 1), 0);
  const p = newPhase(jobId, title, order);
  book.phases.push(p);
  return p;
}

export function renamePhase(book, id, title) { book.phases.find(p => p.id === id).title = title; }

export function movePhase(book, id, delta) {
  const p = book.phases.find(x => x.id === id);
  const list = phasesOf(book, p.jobId);
  const i = list.indexOf(p);
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((x, order) => { x.order = order; });
}

/** Removes a phase; its items stay in the job, unphased. */
export function deletePhase(book, id) {
  for (const t of book.items) if (t.phaseId === id) t.phaseId = '';
  book.phases = book.phases.filter(p => p.id !== id);
}

/** Completely removes a job with its phases and items (undoable from the store). */
export function deleteJob(book, id) {
  const gone = new Set(book.items.filter(t => t.jobId === id).map(t => t.id));
  book.items = book.items.filter(t => !gone.has(t.id));
  for (const t of book.items) t.deps = t.deps.filter(d => !gone.has(d));
  book.phases = book.phases.filter(p => p.jobId !== id);
  book.jobs = book.jobs.filter(j => j.id !== id);
}

export function captureBaseline(book, today) {
  book.baselineDate = today;
  for (const t of book.items) if (!t.archived) t.baseline = t.start || t.finish ? { start: t.start, finish: t.finish } : null;
}

export function setCapacity(book, monday, minutes, personId = book.selfId) {
  if (!book.people.some(p => p.id === personId)) throw new Error('Choose a person before setting capacity.');
  const week = { notes: '', capacity: book.people.find(p => p.id === book.selfId).capacity, ...book.weeks[monday] };
  week.people = { ...week.people, [personId]: minutes };
  if (personId === book.selfId) week.capacity = minutes;
  book.weeks[monday] = week;
}

export function addPerson(book, name) {
  const person = { id: uid(), name: name.trim(), capacity: DEFAULT_CAPACITY };
  book.people.push(person);
  return person;
}

export function patchPerson(book, id, patch) {
  const person = book.people.find(p => p.id === id);
  if (!person) throw new Error('That person no longer exists.');
  Object.assign(person, patch);
}

export function setWeekNotes(book, monday, notes, defaultCapacity) {
  book.weeks[monday] = { capacity: defaultCapacity, ...book.weeks[monday], notes };
}

export function addDep(book, id, depId) {
  const t = itemOf(book, id);
  if (!t.deps.includes(depId)) t.deps.push(depId);
}

export function removeDep(book, id, depId) {
  const t = itemOf(book, id);
  t.deps = t.deps.filter(d => d !== depId);
}
