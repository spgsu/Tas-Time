// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Week: set real capacity, then place work on days. Planning a day never moves programme dates.
import { h, icon, autosize } from '../dom.js';
import { addDays, fmtShort, mondayOf } from '../../core/dates.js';
import { fmtEffort, fmtHours, parseEffort } from '../../core/parse.js';
import { jobOf, liveJobs, openEffort, readyToPlan, weekLoad } from '../../core/query.js';
import { patchItem, setCapacity, setWeekNotes } from '../../core/ops.js';
import { DEFAULT_CAPACITY } from '../../core/model.js';
import { act, openDrawer, rerender, store, today, ui, notify } from '../state.js';
import { btn, doneToggle, dueChip, iconBtn, jobColor, jobTag, meter, readiness } from '../components.js';
import { makeDraggable, makeDropZone } from '../dnd.js';
import { showMenu } from '../overlay.js';
import { welcome } from './welcome.js';
import { createTask } from '../commands.js';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function planOn(id, day) {
  act(day ? 'Plan day' : 'Unplan', d => patchItem(d, id, { plannedDay: day }, today()));
}

function dayMenu(anchor, t, days) {
  showMenu(anchor, [
    { heading: 'Plan for' },
    ...days.map((d, i) => ({ label: `${DAY_LABELS[i]} ${fmtShort(d)}${d === today() ? ' · today' : ''}`, run: () => planOn(t.id, d) })),
    'separator',
    { label: 'Next week', icon: 'arrowRight', run: () => planOn(t.id, addDays(days[0], 7)) },
    t.plannedDay ? { label: 'Remove from week', icon: 'x', run: () => planOn(t.id, '') } : null,
  ].filter(Boolean));
}

function weekCard(t, days) {
  const book = store.book;
  const job = jobOf(book, t.jobId);
  const el = h('div', { class: ['wcard', t.status === 'done' && 'is-done'], style: { '--job': jobColor(job) }, 'data-item': t.id },
    doneToggle(t),
    h('div', { class: 'wcard-body' },
      h('button', { class: 'wcard-title', onclick: () => openDrawer('item', t.id) }, t.title),
      h('div', { class: 'wcard-meta' }, jobTag(job), t.effort && t.status !== 'done' ? h('span', { class: 'effort' }, fmtEffort(t.effort)) : null, dueChip(t), readiness(t))),
    iconBtn('more', `Plan “${t.title}” for another day`, e => dayMenu(e.currentTarget, t, days), { class: 'icon-btn wcard-menu' }));
  return makeDraggable(el, t.id);
}

export function renderWeek() {
  const book = store.book;
  if (!liveJobs(book).length) return welcome();
  const monday = ui.week;
  const load = weekLoad(book, monday, ui.focus);
  const plan = book.weeks[monday] || { capacity: DEFAULT_CAPACITY, notes: '' };
  const isCurrent = monday === mondayOf(today());
  const ready = readyToPlan(book, monday, ui.focus);

  const capInput = h('input', {
    id: 'week-capacity', class: 'cap-input', value: fmtEffort(plan.capacity) || '0h', 'aria-label': 'Hours available this week',
    title: 'Hours you can realistically give this week, across all jobs. E.g. 8h, 6h30, 90m',
    onchange: e => {
      const min = parseEffort(e.target.value);
      if (min === null) { notify('Enter hours like 8h, 6h30 or 90m.', { kind: 'warn' }); e.target.value = fmtEffort(plan.capacity); return; }
      act('Set capacity', d => setCapacity(d, monday, Math.min(min, 7 * 24 * 60)));
    },
  });

  const notes = h('textarea', {
    id: 'week-notes', class: 'week-notes', rows: 1, placeholder: 'Intent for the week: what will you produce, and what will deliberately wait?',
    'aria-label': 'Week intent',
    oninput: e => { autosize(e.target); act('Edit week intent', d => setWeekNotes(d, monday, e.target.value, DEFAULT_CAPACITY), { key: `week:${monday}`, quiet: true }); },
  });
  notes.value = plan.notes;
  requestAnimationFrame(() => autosize(notes));

  const columns = load.days.map((day, i) => {
    const list = load.byDay[day].filter(t => !ui.focus || t.jobId === ui.focus);
    const total = openEffort(load.byDay[day]);
    const col = h('section', { class: ['day', day === today() && 'is-today', i >= 5 && 'weekend', day < today() && 'is-past'], 'aria-label': `${DAY_LABELS[i]} ${fmtShort(day)}` },
      h('header', null, h('span', { class: 'day-name' }, DAY_LABELS[i]), h('span', { class: 'day-date' }, fmtShort(day)), total ? h('span', { class: 'day-total' }, fmtHours(total)) : null),
      btn('Add task', () => createTask(undefined, '', day), { kind: 'sm ghost', iconName: 'plus', attrs: { 'aria-label': `Add task for ${day}` } }),
      h('div', { class: 'day-cards' }, list.length ? list.map(t => weekCard(t, load.days)) : h('p', { class: 'day-empty' }, 'Add a task or drop work here')));
    return makeDropZone(col, id => planOn(id, day));
  });

  const tray = makeDropZone(h('aside', { class: 'tray', 'aria-label': 'Unplanned work' },
    h('header', null, h('h2', null, 'Unplanned'), h('span', { class: 'muted' }, `${ready.length}`)),
    h('p', { class: 'hint' }, 'Active tasks without a work day, plus unfinished work from earlier weeks. Tasks scheduled for future weeks stay there. Drag onto a day, or use ⋯.'),
    h('div', { class: 'tray-cards' }, ready.length ? ready.map(t => weekCard(t, load.days)) : h('p', { class: 'day-empty' }, 'No unscheduled or carried-over tasks. Check other weeks or paused jobs in Plan.'))), id => planOn(id, ''));

  const range = `${fmtShort(monday)} – ${fmtShort(addDays(monday, 6))} ${addDays(monday, 6).slice(0, 4)}`;
  return h('div', { class: 'view week' },
    h('header', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow' }, isCurrent ? 'This week' : weekOffsetLabel(monday)), h('h1', null, range)),
      h('div', { class: 'page-actions' },
        iconBtn('left', 'Previous week', () => { ui.week = addDays(monday, -7); rerender(); }),
        btn('This week', () => { ui.week = mondayOf(today()); rerender(); }, { disabled: isCurrent, kind: 'sm' }),
        iconBtn('right', 'Next week', () => { ui.week = addDays(monday, 7); rerender(); }))),
    h('div', { class: 'week-summary panel' },
      h('label', { class: 'cap', for: 'week-capacity' }, icon('clock', 16), 'Available', capInput),
      h('div', { class: 'cap-meter' }, meter(load.planned, plan.capacity)),
      h('div', { class: 'cap-facts muted' },
        load.unestimated ? h('span', { class: 'warn-text' }, `${load.unestimated} without an estimate · `) : null,
        `${load.done} done`, ui.focus ? ' · totals include all jobs' : ''),
      notes),
    h('div', { class: 'week-body' }, h('div', { class: 'days' }, columns), tray));
}

function weekOffsetLabel(monday) {
  const weeks = Math.round((Date.parse(monday) - Date.parse(mondayOf(today()))) / (7 * 86400000));
  return weeks > 0 ? `${weeks} week${weeks > 1 ? 's' : ''} ahead` : `${-weeks} week${weeks < -1 ? 's' : ''} ago`;
}

