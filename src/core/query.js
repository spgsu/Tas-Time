// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Read-only derivations used by the views. None of these mutate the book.
import { addDays, diffDays, weekDays } from './dates.js';

export function jobOf(book, id) { return book.jobs.find(j => j.id === id); }
export function itemOf(book, id) { return book.items.find(t => t.id === id); }
export function liveJobs(book) { return book.jobs.filter(j => !j.archived); }
export function isHidden(book, t) { return t.archived || !!jobOf(book, t.jobId)?.archived; }
export function liveItems(book) { return book.items.filter(t => !isHidden(book, t)); }
export function activeItems(book) { return liveItems(book).filter(t => jobOf(book, t.jobId)?.status === 'active'); }

export function phasesOf(book, jobId) {
  return book.phases.filter(p => p.jobId === jobId).sort((a, b) => a.order - b.order);
}

export function phaseTitle(book, id) { return book.phases.find(p => p.id === id)?.title || ''; }

/** Reasons an item cannot progress: a recorded constraint or unfinished prerequisites. */
export function blockers(book, t) {
  if (t.status === 'done') return [];
  const out = [];
  if (t.blocker.trim()) out.push(t.blocker.trim());
  for (const id of t.deps) {
    const d = itemOf(book, id);
    if (d && d.status !== 'done') out.push(`Waiting for “${d.title}”`);
  }
  return out;
}

/** Prerequisites that are not finished yet. */
export function waitingOn(book, t) {
  return t.status === 'done' ? [] : t.deps.map(id => itemOf(book, id)).filter(d => d && d.status !== 'done');
}

/**
 * Blocked means "should be moving but can't": a written constraint, or unfinished
 * prerequisites once the task is due to start, planned for today or earlier, or in progress.
 * A future task whose prerequisite is still open is just waiting its turn.
 */
export function isBlocked(book, t, today) {
  if (t.status === 'done') return false;
  if (t.blocker.trim()) return true;
  if (!waitingOn(book, t).length) return false;
  return t.status === 'doing' || (!!t.start && t.start <= today) || (!!t.plannedDay && t.plannedDay <= today);
}
export function isLate(t, today) { return t.status !== 'done' && !!t.finish && t.finish < today; }

/** Days the forecast finish has moved since the baseline (positive = later). */
export function slip(t) {
  return t.baseline?.finish && t.finish ? diffDays(t.baseline.finish, t.finish) : null;
}

/** Prerequisites forecast to finish after this item is forecast to start. */
export function dateConflicts(book, t) {
  if (!t.start || t.status === 'done') return [];
  return t.deps.map(id => itemOf(book, id)).filter(d => d?.finish && d.finish > t.start);
}

export function boardColumn(book, t, today) {
  if (t.status === 'done') return 'done';
  return isBlocked(book, t, today) ? 'blocked' : t.status;
}

export function matchesFocus(t, focus) { return !focus || t.jobId === focus; }

export function openEffort(list) { return list.reduce((n, t) => n + (t.status === 'done' ? 0 : t.effort), 0); }

export function weekLoad(book, monday, focus = '') {
  const days = weekDays(monday);
  const end = days[6];
  const items = activeItems(book).filter(t => t.plannedDay >= monday && t.plannedDay <= end);
  const byDay = Object.fromEntries(days.map(d => [d, []]));
  for (const t of items) byDay[t.plannedDay].push(t);
  const shown = items.filter(t => matchesFocus(t, focus));
  return {
    days, byDay, items,
    shown,
    planned: openEffort(items),
    done: items.filter(t => t.status === 'done').length,
    unestimated: items.filter(t => t.status !== 'done' && t.kind === 'task' && !t.effort).length,
  };
}

/** Active open work with no planned day, or carried from before this week. Includes blocked tasks with their explanations. */
export function readyToPlan(book, monday, focus = '') {
  return activeItems(book)
    .filter(t => t.status !== 'done' && t.kind === 'task' && matchesFocus(t, focus))
    .filter(t => !t.plannedDay || t.plannedDay < monday)
    .sort(byUrgency);
}

export function byUrgency(a, b) {
  return (a.finish || '9999').localeCompare(b.finish || '9999') || (a.start || '9999').localeCompare(b.start || '9999') || a.title.localeCompare(b.title);
}

export function todayList(book, today, focus = '') {
  const live = activeItems(book).filter(t => matchesFocus(t, focus));
  const planned = live.filter(t => t.plannedDay === today);
  const carried = live.filter(t => t.status !== 'done' && t.plannedDay && t.plannedDay < today).sort(byUrgency);
  const overdue = live.filter(t => isLate(t, today) && t.plannedDay !== today && !carried.includes(t)).sort(byUrgency);
  return { planned, carried, overdue };
}

/** The live job touched most recently: latest completion or planned day up to today. */
export function lastWorkedJob(book, today) {
  let best = null; let bestDay = '';
  for (const t of activeItems(book)) {
    const day = [t.doneOn, t.plannedDay <= today ? t.plannedDay : ''].filter(Boolean).sort().at(-1) || '';
    if (day > bestDay) { bestDay = day; best = t.jobId; }
  }
  return jobOf(book, best) || liveJobs(book).find(j => j.status === 'active' && j.notes.restart.trim()) || null;
}

export function upcomingMilestones(book, today, days = 21, focus = '') {
  const end = addDays(today, days);
  return activeItems(book)
    .filter(t => t.kind === 'milestone' && t.status !== 'done' && t.finish && t.finish <= end && matchesFocus(t, focus))
    .sort(byUrgency);
}

export function jobSummary(book, job, today) {
  const items = book.items.filter(t => t.jobId === job.id && !t.archived);
  const open = items.filter(t => t.status !== 'done');
  const phases = phasesOf(book, job.id);
  const current = phases.find(p => open.some(t => t.phaseId === p.id));
  const nextMilestone = open.filter(t => t.kind === 'milestone').sort(byUrgency)[0];
  const finish = items.map(t => t.finish).filter(Boolean).sort().at(-1) || '';
  return {
    total: items.length, done: items.length - open.length, open: open.length, effort: openEffort(items),
    late: open.filter(t => isLate(t, today)).length, blocked: open.filter(t => isBlocked(book, t, today)).length,
    currentPhase: current?.title || '', nextMilestone, finish,
  };
}

/** Rows for the Plan view: job headers, phase headers and items in programme order. */
export function planRows(book, { focus = '', showDone = true, showArchived = false } = {}) {
  const rows = [];
  const jobs = book.jobs.filter(j => (showArchived || !j.archived) && (!focus || j.id === focus));
  for (const job of jobs) {
    rows.push({ type: 'job', job });
    const items = book.items.filter(t => t.jobId === job.id && (showArchived || !t.archived) && (showDone || t.status !== 'done'));
    const groups = [...phasesOf(book, job.id).map(p => [p, items.filter(t => t.phaseId === p.id)]), [null, items.filter(t => !t.phaseId)]];
    for (const [phase, list] of groups) {
      if (!phase && !list.length) continue;
      rows.push({ type: 'phase', phase, job });
      for (const item of [...list].sort(bySchedule)) rows.push({ type: 'item', item, job });
    }
  }
  return rows;
}

export function bySchedule(a, b) {
  return (a.start || a.finish || '9999').localeCompare(b.start || b.finish || '9999') || (a.finish || '9999').localeCompare(b.finish || '9999') || a.title.localeCompare(b.title);
}

/** Every item that (transitively) depends on id, used to refuse dependency loops in pickers. */
export function dependents(book, id) {
  const out = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const t of book.items) if (t.deps.includes(cur) && !out.has(t.id)) { out.add(t.id); stack.push(t.id); }
  }
  return out;
}

