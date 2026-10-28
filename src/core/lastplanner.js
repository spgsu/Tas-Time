// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Last Planner: lookahead readiness, the constraint log (ball in court) and Percent Plan Complete.
// Constraints, RFIs and submittals are log entries linked to tasks; an open entry blocks them.
import { addDays, diffDays, mondayOf } from './dates.js';
import { DEFAULT_CAPACITY, LOG_TYPES, newLogEntry } from './model.js';
import { activeItems, blockers, byUrgency, itemOf, jobOf, matchesFocus, matchesPerson, openLogFor } from './query.js';
import { assignmentCsvCell } from './assignments.js';

// ── Log entries ──

/** Next free number for this job and type: RFI-001, RFI-002… */
export function nextNumber(book, jobId, type) {
  const prefix = LOG_TYPES[type][1];
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const used = book.log.filter(e => e.jobId === jobId).map(e => Number(re.exec(e.number)?.[1] || 0));
  return `${prefix}-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
}

export function addLogEntry(book, fields) {
  const type = fields.type || 'constraint';
  const entry = newLogEntry({ ...fields, type, number: fields.number ?? nextNumber(book, fields.jobId, type) });
  book.log.push(entry);
  return entry;
}

export function logEntry(book, id) { return book.log.find(e => e.id === id); }

export function patchLogEntry(book, id, patch, today) {
  const e = logEntry(book, id);
  if (!e) throw new Error('That log entry no longer exists.');
  // A new type gets that type's next number, unless the number was typed in another form by hand.
  const automatic = new RegExp(`^${LOG_TYPES[e.type][1]}-\\d+$`).test(e.number) || !e.number;
  if (patch.type && patch.type !== e.type && !('number' in patch) && automatic) {
    patch = { ...patch, number: nextNumber(book, e.jobId, patch.type) };
  }
  Object.assign(e, patch);
  if ('status' in patch) e.clearedOn = e.status === 'cleared' ? (e.clearedOn || today) : '';
  return e;
}

export function deleteLogEntry(book, id) { book.log = book.log.filter(e => e.id !== id); }

export function linkLog(book, id, itemId) {
  const e = logEntry(book, id);
  if (!e.itemIds.includes(itemId)) e.itemIds.push(itemId);
}

export function unlinkLog(book, id, itemId) {
  const e = logEntry(book, id);
  e.itemIds = e.itemIds.filter(x => x !== itemId);
}

/** Organisations and people already used as ball in court, plus the book's people. */
export function parties(book) {
  return [...new Set([...book.log.map(e => e.ball.trim()), ...book.people.map(p => p.name)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function isOverdue(e, today) { return e.status === 'open' && !!e.due && e.due < today; }

/** The day a task needs its constraints cleared: when work is meant to begin. */
export function neededBy(t) { return t.start || t.plannedDay || t.finish || ''; }

/** Open entries grouped by who must act, most urgent group first. */
export function ballInCourt(book, today, { focus = '', showCleared = false } = {}) {
  const entries = book.log.filter(e => (showCleared || e.status === 'open') && (!focus || e.jobId === focus) && !jobOf(book, e.jobId)?.archived);
  const groups = new Map();
  for (const e of entries) {
    const key = e.ball.trim() || 'No one named';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const byDue = (a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || (a.due || '9999').localeCompare(b.due || '9999') || a.number.localeCompare(b.number);
  return [...groups.entries()].map(([party, list]) => ({ party, entries: list.sort(byDue), overdue: list.filter(e => isOverdue(e, today)).length }))
    .sort((a, b) => b.overdue - a.overdue || (a.entries[0].due || '9999').localeCompare(b.entries[0].due || '9999') || a.party.localeCompare(b.party));
}

export function logCsv(book, entries, today) {
  const rows = [['Number', 'Type', 'Job', 'Subject', 'Ball in court', 'Sent', 'Response due', 'Status', 'Cleared', 'Days overdue', 'Linked tasks', 'Notes']];
  for (const e of entries) rows.push([e.number, LOG_TYPES[e.type][0], jobOf(book, e.jobId)?.title, e.subject, e.ball, e.sent, e.due,
    e.status === 'open' ? 'Open' : 'Cleared', e.clearedOn, isOverdue(e, today) ? diffDays(e.due, today) : '',
    e.itemIds.map(id => itemOf(book, id)?.title).filter(Boolean).join('; '), e.notes]);
  return '﻿' + rows.map(row => row.map(assignmentCsvCell).join(',')).join('\r\n') + '\r\n';
}

// ── Lookahead ──

/**
 * Open tasks and milestones scheduled in the next `weeks` weeks, grouped by week. A task is placed by its
 * work day, else its forecast start, else its finish; anything earlier and still open counts in this week.
 * Ready means nothing stands in the way: no constraint text, open log entry or unfinished prerequisite.
 */
export function lookahead(book, today, weeks = 6, { focus = '', person = 'all' } = {}) {
  const first = mondayOf(today);
  const end = addDays(first, weeks * 7 - 1);
  const buckets = Array.from({ length: weeks }, (_, i) => ({ monday: addDays(first, i * 7), rows: [] }));
  for (const t of activeItems(book)) {
    if (t.status === 'done' || !matchesFocus(t, focus) || !matchesPerson(t, person)) continue;
    const day = t.plannedDay || t.start || t.finish;
    if (!day || day > end) continue;
    const index = day < first ? 0 : Math.floor(diffDays(first, day) / 7);
    const need = neededBy(t);
    const constraints = openLogFor(book, t).map(e => ({ entry: e, overdue: isOverdue(e, today), tooLate: !!e.due && !!need && e.due > need }));
    buckets[index].rows.push({ item: t, earlier: day < first, constraints, reasons: blockers(book, t), ready: !blockers(book, t).length });
  }
  for (const b of buckets) b.rows.sort((x, y) => Number(x.ready) - Number(y.ready) || byUrgency(x.item, y.item));
  return buckets;
}

// ── Weekly commitment and Percent Plan Complete ──

/** The tasks planned for the week, as a promise PPC is measured against. Replaces an earlier commitment. */
export function commitWeek(book, monday, today) {
  const end = addDays(monday, 6);
  const items = activeItems(book).filter(t => t.kind === 'task' && t.plannedDay >= monday && t.plannedDay <= end).map(t => t.id);
  const self = book.people.find(p => p.id === book.selfId);
  book.weeks[monday] = { capacity: self?.capacity ?? DEFAULT_CAPACITY, notes: '', ...book.weeks[monday], commitment: { at: today, items } };
  return items;
}

export function setMissReason(book, monday, itemId, reason) {
  const week = book.weeks[monday];
  const misses = { ...week.misses };
  if (reason) misses[itemId] = reason; else delete misses[itemId];
  week.misses = misses;
}

/**
 * PPC for one committed week: committed tasks completed by the week's Sunday, out of those still in the book.
 * Before the week ends the figure is provisional. Returns null for a week without a commitment.
 */
export function ppcWeek(book, monday, today, { person = 'all' } = {}) {
  const week = book.weeks[monday];
  if (!week?.commitment) return null;
  const end = addDays(monday, 6);
  const committed = week.commitment.items.map(id => itemOf(book, id)).filter(t => t && matchesPerson(t, person));
  const done = committed.filter(t => t.status === 'done' && t.doneOn && t.doneOn <= end);
  const missed = committed.filter(t => !done.includes(t));
  return {
    monday, committedOn: week.commitment.at, committed, done, missed, closed: today > end,
    ppc: committed.length ? Math.round((done.length / committed.length) * 100) : null,
    reasons: Object.fromEntries(missed.map(t => [t.id, week.misses?.[t.id] || ''])),
  };
}

/** Committed weeks up to this one, oldest first, with reason counts across closed weeks. */
export function ppcHistory(book, today, { person = 'all', limit = 12 } = {}) {
  const current = mondayOf(today);
  const weeks = Object.keys(book.weeks).filter(m => m <= current && book.weeks[m].commitment).sort().slice(-limit)
    .map(m => ppcWeek(book, m, today, { person }));
  const reasons = {};
  for (const w of weeks) if (w.closed) for (const r of Object.values(w.reasons)) reasons[r || 'unrecorded'] = (reasons[r || 'unrecorded'] || 0) + 1;
  const closed = weeks.filter(w => w.closed && w.ppc !== null);
  const average = closed.length ? Math.round(closed.reduce((n, w) => n + w.ppc, 0) / closed.length) : null;
  return { weeks, reasons, average };
}
