// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
import { h } from '../dom.js';
import { addDays, fmtShort, mondayOf } from '../../core/dates.js';
import { fmtHours } from '../../core/parse.js';
import { assignmentGroups, assignmentItems, assignmentsCsv } from '../../core/assignments.js';
import { isBlocked, isLate, openEffort, personCapacity, personName, weekLoad } from '../../core/query.js';
import { rerender, store, today, ui } from '../state.js';
import { btn, itemRow, meter } from '../components.js';
import { personSelect, showPeople } from '../people.js';

export function renderAssignments() {
  const book = store.book;
  const day = today();
  const options = { ...ui.assignments, job: ui.focus, week: ui.assignmentWeek };
  if (!['all', 'unassigned'].includes(options.person) && !book.people.some(p => p.id === options.person)) options.person = ui.assignments.person = 'all';
  const items = assignmentItems(book, day, options);
  const title = options.person === 'all' ? 'All assignments' : options.person === 'unassigned' ? 'Unassigned work' : `${personName(book, options.person)}’s assignments`;
  const change = (key, value) => { ui.assignments[key] = value; rerender(); };
  const select = (key, label, choices) => h('label', null, label, h('select', { id: `assignment-${key}`, onchange: e => change(key, e.target.value) }, choices.map(([value, text]) => h('option', { value, selected: ui.assignments[key] === value }, text))));
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([assignmentsCsv(book, items, day)], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `${title.replace(/[^a-z0-9]+/gi, '-')}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const load = weekLoad(book, ui.assignmentWeek, '', options.person);
  const assignedLoad = options.person === 'all' ? weekLoad(book, ui.assignmentWeek, '', 'unassigned').planned : 0;
  return h('div', { class: 'view assignments' },
    h('header', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, 'People & reports'), h('h1', null, title)),
      h('div', { class: 'page-actions' }, btn('People & capacity', showPeople, { kind: 'sm' }), btn('Export CSV', exportCsv, { kind: 'sm' }), btn('Print report', () => window.print(), { kind: 'sm', iconName: 'print' }))),
    h('details', { class: 'assignment-filter-panel panel', open: innerWidth >= 760 || ui.assignmentFiltersOpen,
      ontoggle: e => { if (innerWidth < 760) ui.assignmentFiltersOpen = e.target.open; } },
      h('summary', null, `Report filters · ${options.person === 'all' ? 'All people' : personName(book, options.person === 'unassigned' ? '' : options.person)} · ${options.status}`),
    h('div', { class: 'assignment-filters' },
      personSelect(options.person, value => change('person', value), { id: 'assignment-person' }),
      select('status', 'Task status', [['open', 'Open'], ['all', 'All statuses'], ['todo', 'To do'], ['doing', 'Doing'], ['blocked', 'Blocked'], ['late', 'Past forecast finish'], ['done', 'Done']]),
      select('period', 'Work day', [['all', 'Any work day'], ['week', 'Scheduled in selected week'], ['unscheduled', 'No work day']]),
      select('group', 'Group by', [['job', 'Job'], ['person', 'Assignee'], ['status', 'Status'], ['week', 'Work week']]),
      h('label', null, 'Find task / notes', h('input', { id: 'assignment-search', value: options.search, type: 'search', onchange: e => change('search', e.target.value), placeholder: 'Search then Enter' })),
      h('label', { class: 'toggle' }, h('input', { id: 'assignment-paused', type: 'checkbox', checked: options.paused, onchange: e => change('paused', e.target.checked) }), 'Include paused / completed jobs'))),
    h('p', { class: 'assignment-scope' }, `${book.name} · ${ui.focus ? `Job: ${book.jobs.find(j => j.id === ui.focus)?.title}` : 'Across all jobs'} · ${options.status} tasks · ${options.period === 'week' ? 'Work scheduled in selected week' : options.period === 'unscheduled' ? 'No work day' : 'All work days'} · ${options.paused ? 'Paused jobs included' : 'Active jobs only'} · Generated ${day}`),
    h('div', { class: 'assignment-summary panel' }, `${items.length} tasks / milestones · ${fmtHours(openEffort(items))} remaining · ${items.filter(t => isLate(t, day)).length} past forecast finish · ${items.filter(t => isBlocked(book, t, day)).length} blocked · ${items.filter(t => t.kind === 'task' && !t.effort && t.status !== 'done').length} without estimates`),
    h('section', { class: 'panel assignment-workload' }, h('div', { class: 'panel-head' }, h('h2', null, `Capacity: ${fmtShort(ui.assignmentWeek)}–${fmtShort(addDays(ui.assignmentWeek, 6))}`),
      h('label', null, 'Week starting', h('input', { id: 'assignment-week', type: 'date', value: ui.assignmentWeek, onchange: e => { if (e.target.value) { ui.assignmentWeek = mondayOf(e.target.value); rerender(); } } }))),
      options.person === 'unassigned' ? h('p', null, `${fmtHours(load.planned)} of unassigned work; assign a person to compare with availability.`)
        : meter(load.planned - assignedLoad, personCapacity(book, ui.assignmentWeek, options.person)),
      h('p', { class: 'hint' }, `Capacity covers active scheduled work across all jobs, regardless of report filters.${assignedLoad ? ` Unassigned work: ${fmtHours(assignedLoad)} (excluded from people's capacity).` : ''}`)),
    items.length ? assignmentGroups(book, items, options.group, day).map(([label, list]) => h('section', { class: 'panel assignment-group' }, h('div', { class: 'panel-head' }, h('h2', null, label), h('span', { class: 'muted' }, `${list.length} · ${fmtHours(openEffort(list))} remaining`)),
      h('div', { class: 'list' }, list.map(t => h('div', { class: 'assignment-entry' }, itemRow(t, { showPhase: true }),
        h('p', { class: 'assignment-detail muted' }, `${t.plannedDay ? `Work on ${fmtShort(t.plannedDay)}` : 'No work day'}${t.start ? ` · Forecast start ${fmtShort(t.start)}` : ''}`)))))) : h('div', { class: 'empty' }, h('h2', null, 'No assignments match'), h('p', null, 'Choose another person, task status, work week or job. Assign people in the task editor.')));
}
