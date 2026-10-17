// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Side panel editor for items and jobs. Every field saves as you go — there is no
// "Keep changes" step; undo (Ctrl+Z outside a text field) reverts mistakes.
import { h, icon, autosize } from './dom.js';
import { COLORS, JOB_STATUS, NOTE_PAGES } from '../core/model.js';
import { fmtDate, fmtShort, relDay } from '../core/dates.js';
import { fmtEffort, parseEffort } from '../core/parse.js';
import { blockers, dateConflicts, dependents, itemOf, jobOf, liveJobs, phasesOf, slip } from '../core/query.js';
import { addDep, addPhase, deletePhase, duplicateItem, movePhase, patchItem, patchJob, removeDep, renamePhase } from '../core/ops.js';
import { act, closeDrawer, openDrawer, rerender, setView, store, today, ui } from './state.js';
import { btn, chip, iconBtn, jobColor, segmented } from './components.js';
import { STANDARD_PHASES, removeItem, removeJob } from './commands.js';

let typedSinceRender = false;

function field(label, control, { hint = '', id = '' } = {}) {
  return h('div', { class: 'field' }, h('label', { for: id || null }, label), control, hint ? h('p', { class: 'field-hint' }, hint) : null);
}

/** Text input that saves on every keystroke (coalesced into one undo step). */
function liveText(id, value, onValue, attrs = {}) {
  const tag = attrs.multiline ? 'textarea' : 'input';
  const el = h(tag, {
    id, ...attrs, multiline: null,
    oninput: e => { typedSinceRender = true; if (tag === 'textarea') autosize(e.target); onValue(e.target.value); },
  });
  el.value = value;
  if (tag === 'textarea') requestAnimationFrame(() => autosize(el));
  return el;
}

export function renderDrawer() {
  const d = ui.drawer;
  if (!d) return null;
  const record = d.type === 'item' ? itemOf(store.book, d.id) : jobOf(store.book, d.id);
  if (!record) { ui.drawer = null; return null; }
  const panel = h('aside', { class: 'drawer', id: 'drawer', 'aria-label': d.type === 'item' ? 'Edit task' : 'Edit job', tabindex: '-1' },
    d.type === 'item' ? itemEditor(record) : jobEditor(record));
  // Text edits commit quietly (without rebuilding the page); refresh once focus leaves the field.
  panel.addEventListener('focusout', () => { if (typedSinceRender) { typedSinceRender = false; setTimeout(rerender, 0); } });
  if (d.focusField) {
    const target = d.focusField;
    d.focusField = '';
    requestAnimationFrame(() => {
      const el = document.getElementById(`d-${target}`);
      el?.focus();
      if (target === 'title') el?.select();
      el?.scrollIntoView({ block: 'center' });
    });
  }
  return panel;
}

function itemEditor(t) {
  const book = store.book;
  const job = jobOf(book, t.jobId);
  const set = (label, patch) => act(label, dd => patchItem(dd, t.id, patch, today()));
  const typed = (key, label) => value => act(label, dd => patchItem(dd, t.id, { [key]: value }, today()), { key: `${key}:${t.id}`, quiet: true });
  const reasons = blockers(book, t);
  const conflicts = dateConflicts(book, t);
  const s = slip(t);
  const isMs = t.kind === 'milestone';

  const effortInput = h('input', {
    id: 'd-effort', value: fmtEffort(t.effort), placeholder: 'e.g. 2h, 45m, 1h30', autocomplete: 'off',
    onchange: e => {
      const min = parseEffort(e.target.value);
      if (min === null) { e.target.setCustomValidity('Use hours and minutes, like 2h, 45m or 1h30.'); e.target.reportValidity(); return; }
      e.target.setCustomValidity('');
      set('Set effort', { effort: Math.min(min, 1e6) });
    },
  });

  const dateInput = (key, value) => h('input', { id: `d-${key}`, type: 'date', value, min: '1900-01-01', max: '2200-12-31', onchange: e => set('Change date', { [key]: e.target.value }) });

  const candidates = book.items.filter(x => x.id !== t.id && !t.deps.includes(x.id) && !x.archived);
  const loops = dependents(book, t.id);
  const depSelect = h('select', {
    id: 'd-deps', 'aria-label': 'Add a prerequisite',
    onchange: e => { if (e.target.value) act('Add prerequisite', dd => addDep(dd, t.id, e.target.value)); },
  }, h('option', { value: '' }, 'Add a prerequisite…'),
  liveJobs(book).map(j => {
    const opts = candidates.filter(x => x.jobId === j.id);
    return opts.length ? h('optgroup', { label: j.title }, opts.map(x => h('option', { value: x.id, disabled: loops.has(x.id) || null }, `${x.title}${loops.has(x.id) ? ' (would create a loop)' : ''}`))) : null;
  }));
  const neededBy = book.items.filter(x => x.deps.includes(t.id));

  return [
    h('div', { class: 'drawer-head', style: { '--job': jobColor(job) } },
      h('div', { class: 'drawer-crumbs' }, h('span', { class: 'dot' }), job.title, t.archived ? chip('Archived', 'muted') : null),
      h('div', { class: 'drawer-head-actions' },
        iconBtn('copy', 'Duplicate', () => { const c = act('Duplicate', dd => duplicateItem(dd, t.id)); if (c) openDrawer('item', c.id, 'title'); }),
        iconBtn('archive', t.archived ? 'Restore from archive' : 'Archive', () => set(t.archived ? 'Restore' : 'Archive', { archived: !t.archived })),
        iconBtn('trash', 'Delete', () => removeItem(t.id)),
        iconBtn('x', 'Close (Esc)', closeDrawer))),
    liveText('d-title', t.title, typed('title', 'Rename'), { class: 'drawer-title', 'aria-label': 'Title', maxlength: 500, placeholder: 'Task name' }),
    h('div', { class: 'drawer-row' },
      segmented([['task', 'Task'], ['milestone', '◆ Milestone']], t.kind, k => set('Change kind', { kind: k, finish: t.finish || t.start || today() }), 'Kind'),
      segmented([['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']], t.status, st => set(st === 'done' ? 'Complete' : 'Change status', { status: st }), 'Status')),
    reasons.length ? h('div', { class: 'notice warn' }, icon('alert', 16), h('div', null, h('strong', null, 'Blocked'), h('ul', null, reasons.map(r => h('li', null, r))))) : null,
    conflicts.length ? h('div', { class: 'notice danger' }, icon('alert', 16), h('div', null, `Starts before ${conflicts.map(c => `“${c.title}”`).join(', ')} is forecast to finish (${conflicts.map(c => fmtShort(c.finish)).join(', ')}).`)) : null,

    h('div', { class: 'fields two' },
      field('Job', h('select', { id: 'd-job', onchange: e => set('Move to job', { jobId: e.target.value, phaseId: '' }) },
        liveJobs(book).map(j => h('option', { value: j.id, selected: j.id === t.jobId }, j.title))), { id: 'd-job' }),
      field('Phase', h('select', { id: 'd-phase', onchange: e => set('Change phase', { phaseId: e.target.value }) },
        h('option', { value: '' }, 'No phase'), phasesOf(book, t.jobId).map(p => h('option', { value: p.id, selected: p.id === t.phaseId }, p.title))), { id: 'd-phase' })),

    h('div', { class: 'fields two' },
      isMs ? null : field('Start', dateInput('start', t.start), { id: 'd-start' }),
      field(isMs ? 'Date' : 'Finish', dateInput('finish', t.finish), { id: 'd-finish', hint: t.finish && t.status !== 'done' ? relDay(t.finish) : '' })),
    t.baseline?.finish ? h('p', { class: ['field-hint', s > 0 ? 'danger' : ''] }, `Baseline ${fmtShort(t.baseline.start || t.baseline.finish)}${t.baseline.start && t.baseline.start !== t.baseline.finish ? ` – ${fmtShort(t.baseline.finish)}` : ''}${s ? ` · ${s > 0 ? `${s} days later` : `${-s} days earlier`}` : ' · on baseline'}`) : null,

    h('div', { class: 'fields two' },
      field('Effort left', effortInput, { id: 'd-effort', hint: 'Your own working time, not calendar time.' }),
      field('Work on', h('input', { id: 'd-plannedDay', type: 'date', value: t.plannedDay, onchange: e => set('Plan day', { plannedDay: e.target.value }) }), { id: 'd-plannedDay', hint: t.plannedDay ? relDay(t.plannedDay) : 'Day you intend to do it' })),

    field('Waiting on / constraint', liveText('d-blocker', t.blocker, typed('blocker', 'Edit constraint'), { multiline: true, rows: 1, placeholder: 'e.g. Supervisor feedback, access to the lab, a delivery…' }),
      { id: 'd-blocker', hint: 'Anything written here marks the task as blocked until you clear it.' }),

    h('div', { class: 'field' }, h('label', { for: 'd-deps' }, 'Prerequisites'),
      t.deps.length ? h('ul', { class: 'deps' }, t.deps.map(id => {
        const d = itemOf(book, id);
        return h('li', { class: d.status === 'done' ? 'is-done' : null },
          h('span', { class: ['tick-mini', d.status === 'done' && 'on'] }, d.status === 'done' ? icon('check', 12) : null),
          h('button', { class: 'link', onclick: () => openDrawer('item', id) }, d.title),
          h('span', { class: 'muted' }, d.finish ? fmtShort(d.finish) : ''),
          iconBtn('x', `Remove prerequisite ${d.title}`, () => act('Remove prerequisite', dd => removeDep(dd, t.id, id)), { class: 'icon-btn sm' }));
      })) : null,
      depSelect,
      neededBy.length ? h('p', { class: 'field-hint' }, 'Needed by: ', neededBy.map((x, i) => [i ? ', ' : '', h('button', { class: 'link', onclick: () => openDrawer('item', x.id) }, x.title)])) : null),

    field('Owner / contact', liveText('d-owner', t.owner, typed('owner', 'Edit owner'), { maxlength: 200, placeholder: 'Optional' }), { id: 'd-owner' }),
    field(isMs ? 'Acceptance criteria' : 'Notes', liveText('d-notes', t.notes, typed('notes', 'Edit notes'), { multiline: true, rows: 3, placeholder: isMs ? 'What must be true for this to be accepted?' : 'Details, links, acceptance criteria…' }), { id: 'd-notes' }),
    t.doneOn ? h('p', { class: 'field-hint' }, `Completed ${fmtDate(t.doneOn)}.`) : null,
  ];
}

function jobEditor(job) {
  const book = store.book;
  const set = (label, patch) => act(label, dd => patchJob(dd, job.id, patch));
  const typed = (key, label) => value => act(label, dd => patchJob(dd, job.id, { [key]: value }), { key: `job-${key}:${job.id}`, quiet: true });
  const phases = phasesOf(book, job.id);
  const count = id => book.items.filter(t => t.phaseId === id && !t.archived).length;

  const newPhase = h('input', {
    id: 'd-phases', placeholder: 'Add a phase — Enter', autocomplete: 'off',
    onkeydown: e => {
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      act('Add phase', dd => addPhase(dd, job.id, e.target.value.trim()));
      ui.drawer.focusField = 'phases';
    },
  });

  return [
    h('div', { class: 'drawer-head', style: { '--job': jobColor(job) } },
      h('div', { class: 'drawer-crumbs' }, h('span', { class: 'dot' }), 'Job', job.archived ? chip('Archived', 'muted') : null),
      h('div', { class: 'drawer-head-actions' },
        iconBtn('notes', 'Open notebook', () => { ui.notesJob = job.id; ui.drawer = null; setView('notes'); }),
        iconBtn('archive', job.archived ? 'Restore job' : 'Archive job', () => set(job.archived ? 'Restore job' : 'Archive job', { archived: !job.archived })),
        iconBtn('trash', 'Delete job', () => removeJob(job.id)),
        iconBtn('x', 'Close (Esc)', closeDrawer))),
    liveText('d-title', job.title, typed('title', 'Rename job'), { class: 'drawer-title', 'aria-label': 'Job name', maxlength: 500, placeholder: 'Job name' }),
    field('Outcome', liveText('d-outcome', job.outcome, typed('outcome', 'Edit outcome'), { multiline: true, rows: 2, placeholder: 'What will exist when this job is done?' }), { id: 'd-outcome' }),
    h('div', { class: 'fields two' },
      field('Short code', liveText('d-code', job.code, typed('code', 'Edit code'), { maxlength: 40, placeholder: 'e.g. PHD — used with # in quick add' }), { id: 'd-code' }),
      field('Status', segmented(Object.entries(JOB_STATUS), job.status, st => set('Job status', { status: st }), 'Job status'))),
    field('Colour', h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Job colour' }, Object.entries(COLORS).map(([key, c]) => h('button', {
      role: 'radio', 'aria-checked': String(job.color === key), 'aria-label': c.label, title: c.label,
      class: ['swatch', job.color === key && 'on'], style: { '--sw': c.hex }, onclick: () => set('Job colour', { color: key }),
    })))),
    h('div', { class: 'field' }, h('label', { for: 'd-phases' }, 'Phases'),
      phases.length ? h('ol', { class: 'phase-list' }, phases.map((p, i) => h('li', null,
        h('input', { id: `d-phase-${p.id}`, value: p.title, 'aria-label': `Phase ${i + 1} name`, onchange: e => act('Rename phase', dd => renamePhase(dd, p.id, e.target.value.trim() || p.title)) }),
        h('span', { class: 'muted' }, String(count(p.id))),
        iconBtn('left', 'Move earlier', () => act('Reorder phases', dd => movePhase(dd, p.id, -1)), { class: 'icon-btn sm up', disabled: i === 0 || null }),
        iconBtn('right', 'Move later', () => act('Reorder phases', dd => movePhase(dd, p.id, 1)), { class: 'icon-btn sm down', disabled: i === phases.length - 1 || null }),
        iconBtn('x', `Remove phase ${p.title}`, () => act('Remove phase', dd => deletePhase(dd, p.id)), { class: 'icon-btn sm', title: count(p.id) ? 'Remove phase (its tasks stay in the job, unphased)' : 'Remove phase' }))))
        : btn(`Add standard phases: ${STANDARD_PHASES.join(' · ')}`, () => act('Add phases', dd => STANDARD_PHASES.forEach(p => addPhase(dd, job.id, p))), { kind: 'sm ghost', iconName: 'plus' }),
      newPhase),
    h('p', { class: 'field-hint' }, `${NOTE_PAGES.filter(([k]) => job.notes[k].trim()).length} of ${NOTE_PAGES.length} notebook pages written.`),
  ];
}
