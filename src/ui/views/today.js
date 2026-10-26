// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Today: what to do now, what slipped, and where each job left off.
import { h, autosize } from '../dom.js';
import { addDays, fmtDate, fmtLong, mondayOf, relDay } from '../../core/dates.js';
import { fmtEffort, fmtHours } from '../../core/parse.js';
import { jobOf, lastWorkedJob, liveJobs, openEffort, readyToPlan, todayList, upcomingMilestones, weekLoad } from '../../core/query.js';
import { patchItem, setNote } from '../../core/ops.js';
import { DEFAULT_CAPACITY } from '../../core/model.js';
import { act, notify, setView, store, today, ui } from '../state.js';
import { createTask, undo } from '../commands.js';
import { btn, emptyState, itemRow, jobColor, jobTag, meter } from '../components.js';
import { welcome } from './welcome.js';

function planFor(id, day, label) {
  return act(label, d => patchItem(d, id, { plannedDay: day }, today()));
}

export function renderToday() {
  const book = store.book;
  if (!liveJobs(book).length) return welcome();
  const day = today();
  const { planned, carried, overdue } = todayList(book, day, ui.focus);
  const open = planned.filter(t => t.status !== 'done');
  const load = weekLoad(book, mondayOf(day));
  const capacity = book.weeks[mondayOf(day)]?.capacity ?? DEFAULT_CAPACITY;

  const sub = open.length
    ? `${open.length} to do · ${fmtHours(openEffort(open))} of work${planned.length - open.length ? ` · ${planned.length - open.length} done` : ''}`
    : planned.length ? 'Everything planned for today is done.' : 'Nothing planned yet.';

  const later = t => [
    btn('Tomorrow', () => {
      if (planFor(t.id, addDays(day, 1), 'Move to tomorrow')) {
        ui.week = mondayOf(addDays(day, 1));
        notify('Moved to tomorrow. See it in Week.', { action: { label: 'Undo', run: undo } });
      }
    }, { title: 'Move to tomorrow (shown in Week)', kind: 'ghost sm' }),
  ];
  const bringIn = t => [btn('Today', () => planFor(t.id, day, 'Plan for today'), { kind: 'sm', iconName: 'plus', title: 'Plan for today' })];

  const main = h('div', { class: 'today-main' },
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'Planned for today'), btn('Add task for today', () => createTask(undefined, '', day), { kind: 'sm', iconName: 'plus' })),
      planned.length
        ? h('div', { class: 'list' }, [...open, ...planned.filter(t => t.status === 'done')].map(t => itemRow(t, { actions: t.status === 'done' ? null : later(t), showPhase: true })))
        : suggestions(book, day)),
    carried.length ? h('section', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('h2', null, 'Carried over'),
        h('span', { class: 'muted' }, 'Planned for an earlier day, not finished'),
        btn('Move all to today', () => act('Carry over', d => { for (const t of carried) patchItem(d, t.id, { plannedDay: day }, day); }), { kind: 'sm' })),
      h('div', { class: 'list' }, carried.map(t => itemRow(t, { actions: bringIn(t), showPhase: true })))) : null,
    overdue.length ? h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'Past forecast finish'), h('span', { class: 'muted' }, 'Expected finish has passed — finish or update the forecast')),
      h('div', { class: 'list' }, overdue.map(t => itemRow(t, { actions: bringIn(t), showPhase: true })))) : null);

  const side = h('aside', { class: 'today-side' },
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'This week'), btn('Open week', () => setView('week'), { kind: 'ghost sm' })),
      meter(load.planned, capacity)),
    resumeNotes(book, planned, carried, day),
    milestones(book, day));

  return h('div', { class: 'view today' },
    h('header', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow' }, 'Today'), h('h1', null, fmtLong(day)), h('p', { class: 'sub' }, sub))),
    h('div', { class: 'today-grid' }, main, side));
}

function suggestions(book, day) {
  const ready = readyToPlan(book, mondayOf(day), ui.focus).filter(t => !t.blocker && t.deps.every(id => book.items.find(x => x.id === id)?.status === 'done')).slice(0, 5);
  if (!ready.length) return emptyState('Nothing planned for today', 'Add a task above, or plan work from the Week view.');
  return h('div', null,
    h('p', { class: 'hint' }, 'Nothing planned for today. Ready to start, most urgent first:'),
    h('div', { class: 'list' }, ready.map(t => itemRow(t, { showPhase: true, actions: [btn('Today', () => planFor(t.id, day, 'Plan for today'), { kind: 'sm', iconName: 'plus' })] }))));
}

/** Restart notes for the jobs you are touching today (or the focused job). */
function resumeNotes(book, planned, carried, day) {
  // Today's jobs first; otherwise carried-over work; otherwise whatever you touched last.
  let ids = ui.focus ? [ui.focus] : [...new Set(planned.map(t => t.jobId))];
  if (!ids.length) ids = [...new Set(carried.map(t => t.jobId))].slice(0, 2);
  const fallback = !ids.length;
  if (fallback) ids = [lastWorkedJob(book, day)?.id].filter(Boolean);
  const jobs = ids.map(id => jobOf(book, id)).filter(j => j && !j.archived && j.status === 'active');
  if (!jobs.length) return null;
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, 'Resume where you left off'), fallback ? h('span', { class: 'muted' }, 'last job you worked on') : null),
    jobs.map(job => {
      const area = h('textarea', {
        class: 'resume-text', rows: 2, 'aria-label': `Resume note for ${job.title}`, id: `resume-${job.id}`,
        placeholder: 'Where you stopped, what is unresolved, the next concrete step…',
        oninput: e => { autosize(e.target); act('Edit resume note', d => setNote(d, job.id, 'restart', e.target.value), { key: `restart:${job.id}`, quiet: true }); },
      });
      area.value = job.notes.restart;
      requestAnimationFrame(() => autosize(area));
      return h('div', { class: 'resume', style: { '--job': jobColor(job) } }, jobTag(job, { full: true }), area);
    }));
}

function milestones(book, day) {
  const list = upcomingMilestones(book, day, 28, ui.focus);
  if (!list.length) return null;
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, 'Milestones ahead')),
    h('ul', { class: 'milestones' }, list.map(t => h('li', null,
      h('span', { class: 'diamond', style: { '--job': jobColor(jobOf(book, t.jobId)) } }),
      h('div', null, h('strong', null, t.title), h('div', { class: 'muted' }, `${fmtDate(t.finish)} · ${relDay(t.finish, day)}`)),
      t.effort ? h('span', { class: 'effort' }, fmtEffort(t.effort)) : null))));
}
