// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
import { addDays, mondayOf } from './dates.js';
import { blockers, boardColumn, byUrgency, isLate, jobOf, liveItems, matchesPerson, personName, phaseTitle } from './query.js';

/** A single selection drives the screen, printout and CSV. Paused jobs are opt-in. */
export function assignmentItems(book, today, { person = 'all', job = '', status = 'open', period = 'all', week = mondayOf(today), paused = false, search = '' } = {}) {
  const needle = search.trim().toLowerCase();
  return liveItems(book).filter(t => {
    const j = jobOf(book, t.jobId);
    if (!matchesPerson(t, person) || (job && t.jobId !== job) || (!paused && j.status !== 'active')) return false;
    if (status === 'open' && t.status === 'done') return false;
    if (status === 'late' && !isLate(t, today)) return false;
    if (['todo', 'doing', 'blocked', 'done'].includes(status) && boardColumn(book, t, today) !== status) return false;
    if (period === 'week' && (!t.plannedDay || t.plannedDay < week || t.plannedDay > addDays(week, 6))) return false;
    if (period === 'unscheduled' && t.plannedDay) return false;
    return !needle || [t.title, t.notes, j.title, phaseTitle(book, t.phaseId), personName(book, t.assigneeId)].join(' ').toLowerCase().includes(needle);
  }).sort(byUrgency);
}

export function assignmentGroups(book, items, group, today) {
  const groups = new Map();
  for (const t of items) {
    const label = group === 'status' ? ({ todo: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done' }[boardColumn(book, t, today)])
      : group === 'week' ? (t.plannedDay ? `Week of ${mondayOf(t.plannedDay)}` : 'No work day')
      : group === 'person' ? personName(book, t.assigneeId) : jobOf(book, t.jobId).title;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(t);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Neutralize spreadsheet formula prefixes as well as quoting commas/newlines. */
export function assignmentCsvCell(value) {
  let s = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

export function assignmentsCsv(book, items, today) {
  const rows = [['Assignee', 'Job', 'Job status', 'Phase', 'Task', 'Kind', 'Status', 'Work on', 'Forecast start', 'Forecast finish', 'Effort left (hours)', 'Blockers / prerequisites', 'Contacts', 'Notes']];
  for (const t of items) rows.push([personName(book, t.assigneeId), jobOf(book, t.jobId).title, jobOf(book, t.jobId).status,
    phaseTitle(book, t.phaseId), t.title, t.kind, boardColumn(book, t, today), t.plannedDay, t.start, t.finish,
    t.status === 'done' ? 0 : t.effort / 60, blockers(book, t).join('; '), t.owner, t.notes]);
  return '\uFEFF' + rows.map(row => row.map(assignmentCsvCell).join(',')).join('\r\n') + '\r\n';
}
