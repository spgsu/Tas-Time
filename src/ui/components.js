// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Small building blocks shared by several views.
import { h, icon } from './dom.js';
import { COLORS } from '../core/model.js';
import { blockers, isBlocked, isLate, jobOf, phaseTitle, waitingOn } from '../core/query.js';
import { addDays, fmtDate, relDay } from '../core/dates.js';
import { fmtEffort, fmtHours } from '../core/parse.js';
import { act, openDrawer, store, today } from './state.js';
import { setStatus } from '../core/ops.js';

export function jobColor(job) { return COLORS[job?.color]?.hex || COLORS.forest.hex; }

export function jobTag(job, { full = false } = {}) {
  if (!job) return null;
  return h('span', { class: 'job-tag', style: { '--job': jobColor(job) }, title: job.title },
    h('span', { class: 'dot' }), full || !job.code ? job.title : job.code);
}

export function chip(text, kind = '', title = '') { return h('span', { class: ['chip', kind], title: title || null }, text); }

/** Forecast-finish chip that turns red once late and amber within two days. */
export function dueChip(t) {
  if (!t.finish || t.status === 'done') return null;
  const late = isLate(t, today());
  const soon = !late && t.finish <= addDays(today(), 2);
  const label = t.kind === 'milestone' ? `◆ ${fmtDate(t.finish)}` : `Forecast finish ${relDay(t.finish)}`;
  return chip(label, late ? 'danger' : soon ? 'warn' : '', fmtDate(t.finish));
}

/** "Blocked: reason" when stuck now; a quiet "After X" when merely waiting on a prerequisite. */
export function readiness(t) {
  const book = store.book;
  if (t.status === 'done') return null;
  if (isBlocked(book, t, today())) {
    const reasons = blockers(book, t);
    return chip(`Blocked · ${reasons[0]}`, 'warn', reasons.join('\n'));
  }
  const waiting = waitingOn(book, t);
  return waiting.length ? chip(`After “${waiting[0].title}”${waiting.length > 1 ? ` +${waiting.length - 1}` : ''}`, 'muted', waiting.map(w => w.title).join('\n')) : null;
}

/** Round completion checkbox. Disabled with an explanation while blocked. */
export function doneToggle(t) {
  const book = store.book;
  const reasons = t.status === 'done' ? [] : blockers(book, t);
  const done = t.status === 'done';
  return h('button', {
    class: ['tick', done && 'on', t.kind === 'milestone' && 'tick-ms'],
    'aria-pressed': String(done),
    'aria-label': `${done ? 'Mark not done' : 'Mark done'}: ${t.title}`,
    title: reasons.length ? `Blocked: ${reasons.join('; ')}` : done ? 'Mark as not done' : 'Mark done',
    disabled: reasons.length ? true : null,
    onclick: event => {
      event.stopPropagation();
      act(done ? 'Reopen' : 'Complete', d => setStatus(d, t.id, done ? 'todo' : 'done', today()));
    },
  }, icon('check', 14));
}

/** A list row for an item: toggle, title, metadata, optional trailing actions. */
export function itemRow(t, { actions = null, showJob = true, showPhase = false, dense = false } = {}) {
  const book = store.book;
  const job = jobOf(book, t.jobId);
  const phase = showPhase ? phaseTitle(book, t.phaseId) : '';
  return h('div', { class: ['row-item', t.status === 'done' && 'is-done', dense && 'dense'], 'data-item': t.id, style: { '--job': jobColor(job) } },
    doneToggle(t),
    h('div', { class: 'row-main' },
      h('button', { class: 'row-title', onclick: () => openDrawer('item', t.id) }, t.title),
      h('div', { class: 'row-meta' },
        showJob ? jobTag(job) : null,
        phase ? h('span', { class: 'muted' }, phase) : null,
        t.status === 'doing' ? chip('Doing', 'accent') : null,
        dueChip(t),
        readiness(t),
        t.effort && t.status !== 'done' ? h('span', { class: 'effort' }, fmtEffort(t.effort)) : null,
      )),
    actions ? h('div', { class: 'row-actions' }, actions) : null);
}

export function segmented(options, value, onChange, label) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    options.map(([key, text]) => h('button', {
      role: 'radio', 'aria-checked': String(key === value), class: key === value ? 'on' : null,
      onclick: () => onChange(key),
    }, text)));
}

/** Planned vs capacity bar. */
export function meter(used, capacity, { label = true } = {}) {
  const pct = capacity ? Math.min(100, (used / capacity) * 100) : used ? 100 : 0;
  const over = used > capacity;
  return h('div', { class: ['meter', over && 'over'] },
    h('div', { class: 'meter-track' }, h('span', { style: { width: `${pct}%` } })),
    label ? h('div', { class: 'meter-label' },
      h('strong', null, fmtHours(used)), ` planned of ${fmtHours(capacity)}`,
      h('span', { class: over ? 'danger' : 'muted' }, over ? ` · ${fmtHours(used - capacity)} over` : ` · ${fmtHours(capacity - used)} free`)) : null);
}

export function emptyState(title, body, ...actions) {
  return h('div', { class: 'empty' }, h('h3', null, title), body ? h('p', null, body) : null, actions.length ? h('div', { class: 'empty-actions' }, actions) : null);
}

export function btn(label, onclick, { kind = '', iconName = '', title = '', disabled = false, attrs = {} } = {}) {
  return h('button', { class: ['btn', kind], onclick, title: title || null, disabled: disabled || null, ...attrs }, iconName ? icon(iconName, 16) : null, label ? h('span', null, label) : null);
}

export function iconBtn(name, label, onclick, attrs = {}) {
  return h('button', { class: 'icon-btn', 'aria-label': label, title: label, onclick, ...attrs }, icon(name, 18));
}

