// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Plan: the programme. A frozen table on the left, a calendar-day Gantt on the right,
// both in one scroll container so rows can never drift out of alignment.
import { h, icon } from '../dom.js';
import { addDays, dayNum, diffDays, fmtShort, mondayOf, MONTH_NAMES } from '../../core/dates.js';
import { fmtEffort } from '../../core/parse.js';
import { blockers, dateConflicts, isBlocked, isLate, itemOf, jobSummary, liveJobs, planRows, slip } from '../../core/query.js';
import { captureBaseline, patchItem, shiftItem } from '../../core/ops.js';
import { act, openDrawer, rerender, setFocus, store, today, ui, notify } from '../state.js';
import { btn, chip, doneToggle, iconBtn, jobColor, segmented } from '../components.js';
import { createJob, quickAdd } from '../commands.js';
import { welcome } from './welcome.js';

const ROW = { job: 46, phase: 32, item: 36, add: 34 };
const HEADER = 52;

export const planScroll = { toToday: true };

function timeRange(rows) {
  const t = today();
  const base = addDays(mondayOf(t), -7);
  if (ui.planRange === '6w') return { start: base, days: 56, px: 26 };
  if (ui.planRange === '3m') return { start: base, days: 7 * 15, px: 12 };
  const dates = rows.filter(r => r.type === 'item').flatMap(r => [r.item.start, r.item.finish, r.item.baseline?.start, r.item.baseline?.finish]).filter(Boolean);
  if (!dates.length) return { start: base, days: 56, px: 26 };
  dates.push(t);
  dates.sort();
  const start = addDays(mondayOf(dates[0]), -7);
  const days = Math.ceil((diffDays(start, dates.at(-1)) + 14) / 7) * 7;
  const avail = (document.getElementById('main')?.clientWidth || 1200) - labelWidth() - 48;
  return { start, days, px: Math.max(4, Math.min(26, Math.floor(avail / days))) };
}

function labelWidth() { return innerWidth < 760 ? 220 : 420; }

export function renderPlan() {
  const book = store.book;
  if (!liveJobs(book).length && !ui.planShowArchived) return welcome();
  const rows = planRows(book, { focus: ui.focus, showDone: ui.planShowDone, showArchived: ui.planShowArchived });
  const range = timeRange(rows);
  const toolbar = h('div', { class: 'plan-toolbar' },
    segmented([['6w', '6 weeks'], ['3m', '3 months'], ['all', 'Whole job']], ui.planRange, v => { ui.planRange = v; planScroll.toToday = true; rerender(); }, 'Timeline range'),
    h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: ui.planShowDone, onchange: e => { ui.planShowDone = e.target.checked; rerender(); } }), 'Done'),
    h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: ui.planShowArchived, onchange: e => { ui.planShowArchived = e.target.checked; rerender(); } }), 'Archived'),
    h('span', { class: 'spacer' }),
    btn('Today', () => { planScroll.toToday = true; rerender(); }, { kind: 'sm ghost', iconName: 'today' }),
    btn(book.baselineDate ? `Baseline ${fmtShort(book.baselineDate)}` : 'Set baseline', baselineCommand, {
      kind: 'sm', iconName: 'flag', title: 'A baseline freezes current dates so you can see slippage later.',
    }),
    btn('Job', () => createJob(), { kind: 'sm', iconName: 'plus' }));

  const lw = labelWidth();
  const width = lw + range.days * range.px;
  const grid = h('div', { class: 'plan-grid', style: { width: `${width}px`, '--lw': `${lw}px`, '--px': `${range.px}px`, '--offset': `${(7 - ((dayNum(range.start) + 3) % 7)) % 7}` } });
  grid.append(header(range));

  const positions = new Map();
  let y = HEADER;
  const push = (el, height) => { grid.append(el); y += height; };
  // An inline "add" row closes each phase group (and each job that has no groups yet).
  let group = null; let job = null; let jobHasGroup = false;
  const closeGroup = () => { if (group && !group.job.archived) push(addRow(group.job, group.phase), ROW.add); group = null; };
  const closeJob = () => { closeGroup(); if (job && !jobHasGroup && !job.archived) push(addRow(job, null), ROW.add); };
  for (const row of rows) {
    if (row.type === 'job') { closeJob(); job = row.job; jobHasGroup = false; push(jobRow(row.job), ROW.job); }
    else if (row.type === 'phase') { closeGroup(); group = row; jobHasGroup = true; push(phaseRow(row), ROW.phase); }
    else { positions.set(row.item.id, y + ROW.item / 2); push(itemRowPlan(row.item, range), ROW.item); }
  }
  closeJob();
  grid.append(overlay(rows, positions, range, y));

  const scroller = h('div', { class: 'plan-scroll', id: 'plan-scroll' }, grid);
  if (planScroll.toToday) {
    planScroll.toToday = false;
    requestAnimationFrame(() => { scroller.scrollLeft = Math.max(0, diffDays(range.start, today()) * range.px - 7 * range.px); });
  }

  return h('div', { class: 'view plan' },
    h('header', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, 'Programme'), h('h1', null, 'Plan')), toolbar),
    rows.length ? scroller : h('p', { class: 'muted' }, 'No jobs match.'),
    h('p', { class: 'legend' },
      h('span', { class: 'lg-bar' }), 'Forecast', h('span', { class: 'lg-base' }), 'Baseline', h('span', { class: 'lg-ms' }), 'Milestone',
      h('span', { class: 'lg-late' }), 'Late', h('span', { class: 'lg-dep' }), 'Prerequisite',
      h('span', { class: 'muted' }, ' · Drag a bar to move it, its right edge to change the finish. Arrow keys on a focused bar: move; Shift+arrows: resize.')));
}

function baselineCommand() {
  const book = store.book;
  if (book.baselineDate && !confirm(`Replace the baseline from ${book.baselineDate} with today’s forecast dates?`)) return;
  act('Set baseline', d => captureBaseline(d, today()));
  notify('Baseline set. Slippage is now measured from today’s forecast.');
}

function header(range) {
  const months = [];
  for (let i = 0; i < range.days;) {
    const iso = addDays(range.start, i);
    const [y, m] = iso.split('-').map(Number);
    const nextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
    const span = Math.min(range.days - i, diffDays(iso, nextMonth));
    months.push(h('div', { class: 'ph-month', style: { left: `${i * range.px}px`, width: `${span * range.px}px` } }, span * range.px > 40 ? `${MONTH_NAMES[m - 1]} ${y}` : ''));
    i += span;
  }
  const weeks = [];
  for (let i = (7 - ((dayNum(range.start) + 3) % 7)) % 7; i < range.days; i += 7) {
    const iso = addDays(range.start, i);
    weeks.push(h('div', { class: 'ph-week', style: { left: `${i * range.px}px`, width: `${7 * range.px}px` } }, range.px * 7 >= 30 ? String(Number(iso.slice(8))) : ''));
  }
  return h('div', { class: 'ph' },
    h('div', { class: 'pl ph-label' }, 'Task', h('span', null, 'Dates'), h('span', null, 'Effort')),
    h('div', { class: 'pt ph-time' }, h('div', { class: 'ph-months' }, months), h('div', { class: 'ph-weeks' }, weeks)));
}

function jobRow(job) {
  const s = jobSummary(store.book, job, today());
  return h('div', { class: ['prow', 'prow-job', job.archived && 'is-archived'], style: { '--job': jobColor(job), height: `${ROW.job}px` } },
    h('div', { class: 'pl' },
      h('span', { class: 'job-bar' }),
      h('button', { class: 'job-title', onclick: () => openDrawer('job', job.id) }, job.title || 'Untitled job'),
      job.code ? chip(job.code) : null,
      job.archived ? chip('Archived', 'muted') : null,
      h('span', { class: 'job-facts muted' }, `${s.done}/${s.total}`, s.late ? h('span', { class: 'danger' }, ` · ${s.late} late`) : null),
      iconBtn('focus', ui.focus === job.id ? 'Show all jobs' : `Focus on ${job.title}`, () => setFocus(job.id), { class: ['icon-btn', 'sm', ui.focus === job.id && 'on'] })),
    h('div', { class: 'pt' }));
}

function phaseRow({ phase, job }) {
  return h('div', { class: 'prow prow-phase', style: { height: `${ROW.phase}px` } },
    h('div', { class: 'pl' }, h('button', { class: 'phase-title', title: 'Edit phases', onclick: () => openDrawer('job', job.id, 'phases') }, phase ? phase.title : 'No phase')),
    h('div', { class: 'pt' }));
}

function addKey(job, phase) { return `${job.id}/${phase?.id || ''}`; }

function addRow(job, phase) {
  const key = addKey(job, phase);
  if (ui.addingIn !== key) {
    return h('div', { class: 'prow prow-add', style: { height: `${ROW.add}px` } },
      h('div', { class: 'pl' }, h('button', { class: 'add-inline', onclick: () => { ui.addingIn = key; rerender(); } }, icon('plus', 14), phase ? `Add to ${phase.title}` : 'Add task')),
      h('div', { class: 'pt' }));
  }
  const input = h('input', {
    id: `add-${key}`, class: 'add-input', placeholder: 'Task name   2h   !fri   — Enter to add, Esc to close', autocomplete: 'off',
    onkeydown: e => {
      if (e.key === 'Escape') { e.stopPropagation(); ui.addingIn = ''; rerender(); }
      if (e.key === 'Enter' && e.target.value.trim()) {
        const created = quickAdd(e.target.value, { jobId: job.id, phaseId: phase?.id || '' });
        if (created) { e.target.value = ''; }
      }
    },
    onblur: e => { if (!e.target.value.trim()) setTimeout(() => { if (ui.addingIn === key && document.activeElement?.id !== `add-${key}`) { ui.addingIn = ''; rerender(); } }, 150); },
  });
  requestAnimationFrame(() => document.getElementById(`add-${key}`)?.focus());
  return h('div', { class: 'prow prow-add is-open', style: { height: `${ROW.add}px` } }, h('div', { class: 'pl' }, input), h('div', { class: 'pt' }));
}

function itemRowPlan(t, range) {
  const book = store.book;
  const late = isLate(t, today());
  const blocked = isBlocked(book, t, today());
  const reasons = blocked ? blockers(book, t) : [];
  const s = slip(t);
  const dates = t.kind === 'milestone' ? fmtShort(t.finish) : t.start || t.finish ? `${fmtShort(t.start) || '?'} – ${fmtShort(t.finish) || '?'}` : '';
  return h('div', { class: ['prow', 'prow-item', t.status === 'done' && 'is-done', (t.archived) && 'is-archived'], style: { height: `${ROW.item}px` }, 'data-item': t.id },
    h('div', { class: 'pl' },
      doneToggle(t),
      h('button', { class: 'item-title', onclick: () => openDrawer('item', t.id), title: reasons.length ? `Blocked: ${reasons.join('; ')}` : t.title },
        t.kind === 'milestone' ? h('span', { class: 'ms-mark', 'aria-label': 'Milestone' }, '◆') : null, t.title,
        reasons.length ? h('span', { class: 'blocked-dot', 'aria-label': 'Blocked' }) : null),
      h('span', { class: ['item-dates', late && 'danger', !dates && 'muted'] }, dates || 'No dates'),
      h('span', { class: 'item-effort' }, t.status === 'done' ? '' : fmtEffort(t.effort))),
    track(t, range, { late, blocked, slip: s }));
}

function x(range, iso) { return diffDays(range.start, iso) * range.px; }

function track(t, range, { late, blocked, slip: s }) {
  const tr = h('div', { class: 'pt track' });
  if (t.baseline?.finish) {
    const bs = t.baseline.start || t.baseline.finish;
    tr.append(h('span', { class: 'base', style: { left: `${x(range, bs)}px`, width: `${(diffDays(bs, t.baseline.finish) + 1) * range.px}px` }, title: `Baseline ${fmtShort(bs)} – ${fmtShort(t.baseline.finish)}` }));
  }
  if (!t.start && !t.finish) {
    tr.classList.add('unscheduled');
    tr.title = 'Click a day to schedule';
    tr.addEventListener('click', e => {
      const day = addDays(range.start, Math.floor((e.clientX - tr.getBoundingClientRect().left) / range.px));
      act('Schedule', d => patchItem(d, t.id, t.kind === 'milestone' ? { finish: day } : { start: day, finish: day }, today()));
    });
    return tr;
  }
  const start = t.start || t.finish;
  const finish = t.finish || t.start;
  const label = `${t.title}: ${fmtShort(start)}${start !== finish ? ` to ${fmtShort(finish)}` : ''}`;
  if (t.kind === 'milestone') {
    const ms = h('button', { class: ['gms', t.status === 'done' && 'done', late && 'late'], style: { left: `${x(range, finish) + range.px / 2}px` }, 'aria-label': label, title: label });
    bindDrag(ms, t, range, false);
    tr.append(ms);
  } else {
    const bar = h('button', {
      class: ['bar', t.status, late && 'late', blocked && 'blocked'],
      style: { left: `${x(range, start)}px`, width: `${(diffDays(start, finish) + 1) * range.px}px` },
      'aria-label': label, title: label,
    }, h('span', { class: 'grip', 'data-resize': '1' }));
    bindDrag(bar, t, range, true);
    tr.append(bar);
  }
  if (s) tr.append(h('span', { class: ['slip', s > 0 ? 'danger' : 'good'], style: { left: `${x(range, finish) + range.px + 6}px` }, title: 'Change since baseline' }, `${s > 0 ? '+' : ''}${s}d`));
  return tr;
}

/** Pointer drag to move (or resize from the grip) with day snapping; arrow keys for the same. */
function bindDrag(el, t, range, resizable) {
  let startX = 0; let mode = ''; let moved = 0; let origLeft = 0; let origWidth = 0;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    mode = resizable && e.target.dataset.resize ? 'resize' : 'move';
    startX = e.clientX; moved = 0;
    origLeft = parseFloat(el.style.left); origWidth = parseFloat(el.style.width) || 0;
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  });
  el.addEventListener('pointermove', e => {
    if (!mode) return;
    moved = Math.round((e.clientX - startX) / range.px);
    if (mode === 'move') el.style.left = `${origLeft + moved * range.px}px`;
    else el.style.width = `${Math.max(range.px, origWidth + moved * range.px)}px`;
  });
  const end = () => {
    if (!mode) return;
    const m = mode; mode = '';
    el.classList.remove('dragging');
    if (Math.abs(moved) > 0) commitDrag(t, m, moved);
    else if (Math.abs(parseFloat(el.style.left) - origLeft) < 1) openDrawer('item', t.id);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => { mode = ''; el.classList.remove('dragging'); rerender(); });
  el.addEventListener('click', e => { if (e.detail === 0) openDrawer('item', t.id); });
  el.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const delta = e.key === 'ArrowLeft' ? -1 : 1;
    commitDrag(t, resizable && e.shiftKey ? 'resize' : 'move', delta);
    requestAnimationFrame(() => document.querySelector(`[data-item="${t.id}"] .bar, [data-item="${t.id}"] .gms`)?.focus());
  });
}

function commitDrag(t, mode, days) {
  if (mode === 'move') { act('Move', d => shiftItem(d, t.id, days)); return; }
  const cur = itemOf(store.book, t.id);
  const start = cur.start || cur.finish;
  const finish = addDays(cur.finish || cur.start, days);
  act('Change finish', d => patchItem(d, t.id, { start, finish: finish < start ? start : finish }, today()));
}

/** Today line plus prerequisite connectors, drawn in one SVG over the timeline. */
function overlay(rows, positions, range, height) {
  const lw = labelWidth();
  const w = range.days * range.px;
  const svg = h('svg', { class: 'plan-overlay', width: w, height, style: { left: `${lw}px` }, 'aria-hidden': 'true' },
    h('defs', null, h('marker', { id: 'arrow', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' }, h('path', { d: 'M0 0L8 4L0 8z', class: 'arrow-head' })),
      h('marker', { id: 'arrow-bad', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' }, h('path', { d: 'M0 0L8 4L0 8z', class: 'arrow-head bad' }))));
  const tx = x(range, today()) + range.px / 2;
  if (tx >= 0 && tx <= w) svg.append(h('line', { class: 'today-line', x1: tx, x2: tx, y1: HEADER - 6, y2: height }));
  const book = store.book;
  for (const row of rows) {
    if (row.type !== 'item') continue;
    const t = row.item;
    const y2 = positions.get(t.id);
    if (!t.start && !t.finish) continue;
    const conflicts = new Set(dateConflicts(book, t).map(d => d.id));
    for (const depId of t.deps) {
      const d = itemOf(book, depId);
      const y1 = positions.get(depId);
      if (!d || y1 === undefined || !(d.finish || d.start)) continue;
      const x1 = x(range, d.finish || d.start) + (d.kind === 'milestone' ? range.px / 2 + 6 : range.px);
      const x2 = x(range, t.start || t.finish) + (t.kind === 'milestone' ? range.px / 2 - 7 : 0);
      const bad = conflicts.has(depId);
      const mid = Math.max(x1 + 6, Math.min(x2 - 8, x1 + 10));
      const path = x2 - 8 >= x1 + 6
        ? `M${x1} ${y1} H${mid} V${y2} H${x2 - 1}`
        : `M${x1} ${y1} h6 V${(y1 + y2) / 2} H${x2 - 12} V${y2} H${x2 - 1}`;
      svg.append(h('path', { d: path, class: ['dep', bad && 'bad'], 'marker-end': `url(#${bad ? 'arrow-bad' : 'arrow'})` }));
    }
  }
  return svg;
}

