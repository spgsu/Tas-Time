// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Side panel editor for items, jobs and constraint log entries. Every field saves as you go — there is no
// "Keep changes" step; undo (Ctrl+Z outside a text field) reverts mistakes.
import { h, icon, autosize } from './dom.js';
import { COLORS, JOB_STATUS, LOG_TYPES, NOTE_PAGES } from '../core/model.js';
import { fmtDate, fmtShort, relDay } from '../core/dates.js';
import { fmtEffort, fmtRepeat, parseEffort } from '../core/parse.js';
import { blockers, dateConflicts, dependents, itemOf, jobOf, liveJobs, phasesOf, slip } from '../core/query.js';
import { addDep, addPhase, addStep, deletePhase, duplicateItem, movePhase, moveStep, patchItem, patchJob, patchStep, removeDep, removeStep, renamePhase } from '../core/ops.js';
import { act, closeDrawer, openDrawer, rerender, setView, store, today, ui } from './state.js';
import { btn, chip, iconBtn, jobColor, segmented } from './components.js';
import { STANDARD_PHASES, createTask, removeItem, removeJob, setItemStatus } from './commands.js';
import { personSelect, showPeople } from './people.js';
import { deleteLogEntry, isOverdue, linkLog, logEntry, parties, patchLogEntry, unlinkLog } from '../core/lastplanner.js';
import { createLogEntry, setLogStatus } from './views/lookahead.js';

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
  typedSinceRender = false;
  const d = ui.drawer;
  if (!d) return null;
  const record = d.type === 'item' ? itemOf(store.book, d.id) : d.type === 'log' ? logEntry(store.book, d.id) : jobOf(store.book, d.id);
  if (!record) { ui.drawer = null; return null; }
  const panel = h('aside', { class: 'drawer', id: 'drawer', 'data-record': d.id, 'aria-label': { item: 'Edit task', log: 'Edit log entry', job: 'Edit job' }[d.type], tabindex: '-1' },
    d.type === 'item' ? itemEditor(record) : d.type === 'log' ? logEditor(record) : jobEditor(record));
  // Text edits commit quietly (without rebuilding the page); refresh once focus leaves the field.
  panel.addEventListener('focusout', () => {
    if (typedSinceRender) {
      typedSinceRender = false;
      setTimeout(() => { if (panel.isConnected) rerender(); }, 0);
    }
  });
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
    oninput: e => e.target.setCustomValidity(''),
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
    h('p', { class: 'field-hint' }, `Job: ${job.title} → ${book.phases.find(p => p.id === t.phaseId)?.title || 'No phase'} → ${isMs ? 'Milestone' : 'Task'}. Changes save automatically.`),
    h('div', { class: 'drawer-row' },
      segmented([['task', 'Task'], ['milestone', '◆ Milestone']], t.kind, k => set('Change kind', { kind: k, finish: t.finish || t.start || today() }), 'Kind'),
      segmented([['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']], t.status, st => setItemStatus(t.id, st), 'Status')),
    reasons.length ? h('div', { class: 'notice warn' }, icon('alert', 16), h('div', null, h('strong', null, 'Blocked'), h('ul', null, reasons.map(r => h('li', null, r))))) : null,
    conflicts.length ? h('div', { class: 'notice danger' }, icon('alert', 16), h('div', null, `Starts before ${conflicts.map(c => `“${c.title}”`).join(', ')} is forecast to finish (${conflicts.map(c => fmtShort(c.finish)).join(', ')}).`)) : null,

    h('div', { class: 'fields two' },
      field('Job', h('select', { id: 'd-job', onchange: e => set('Move to job', { jobId: e.target.value, phaseId: '' }) },
        liveJobs(book).map(j => h('option', { value: j.id, selected: j.id === t.jobId }, j.title))), { id: 'd-job' }),
      field('Phase (optional group)', h('select', { id: 'd-phase', onchange: e => set('Change phase', { phaseId: e.target.value }) },
        h('option', { value: '' }, 'No phase'), phasesOf(book, t.jobId).map(p => h('option', { value: p.id, selected: p.id === t.phaseId }, p.title))), { id: 'd-phase' })),

    h('div', { class: 'field' }, personSelect(t.assigneeId, value => set('Assign task', { assigneeId: value }), { id: 'd-assignee', all: false }),
      btn('People & capacity', showPeople, { kind: 'sm ghost' })),

    h('div', { class: 'fields two' },
      isMs ? null : field('Forecast start', dateInput('start', t.start), { id: 'd-start' }),
      field(isMs ? 'Milestone date' : 'Forecast finish', dateInput('finish', t.finish), { id: 'd-finish', hint: isMs ? '' : 'Expected finish, not a fixed deadline. Moving the timeline changes this date.' })),
    t.baseline?.finish ? h('p', { class: ['field-hint', s > 0 ? 'danger' : ''] }, `Baseline ${fmtShort(t.baseline.start || t.baseline.finish)}${t.baseline.start && t.baseline.start !== t.baseline.finish ? ` – ${fmtShort(t.baseline.finish)}` : ''}${s ? ` · ${s > 0 ? `${s} days later` : `${-s} days earlier`}` : ' · on baseline'}`) : null,

    h('div', { class: 'fields two' },
      field('Effort left', effortInput, { id: 'd-effort', hint: 'Use units: 10h or 45m. Your working time, not calendar duration. A work day receives the whole estimate; split tasks that need several work sessions.' }),
      field('Work on', h('input', { id: 'd-plannedDay', type: 'date', value: t.plannedDay, onchange: e => set('Plan day', { plannedDay: e.target.value }) }), { id: 'd-plannedDay', hint: t.plannedDay ? relDay(t.plannedDay) : 'Day you intend to do it' })),

    repeatField(t, set),

    field('Waiting on / constraint', liveText('d-blocker', t.blocker, typed('blocker', 'Edit constraint'), { multiline: true, rows: 1, placeholder: 'e.g. Supervisor feedback, access to the lab, a delivery…' }),
      { id: 'd-blocker', hint: 'Anything written here marks the task as blocked until you clear it.' }),
    logSection(t),

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

    field('Contacts / consulted', liveText('d-owner', t.owner, typed('owner', 'Edit contacts'), { maxlength: 200, placeholder: 'Optional: suppliers, reviewers, contacts' }), { id: 'd-owner', hint: 'Separate from the person responsible for completing this task. Existing owner/contact text is kept here.' }),
    checklist(t),
    field(isMs ? 'Acceptance criteria' : 'Notes', liveText('d-notes', t.notes, typed('notes', 'Edit notes'), { multiline: true, rows: 3, placeholder: isMs ? 'What must be true for this to be accepted?' : 'Details, links, acceptance criteria…' }), { id: 'd-notes' }),
    t.doneOn ? h('p', { class: 'field-hint' }, `Completed ${fmtDate(t.doneOn)}.`) : null,
  ];
}

function repeatField(t, set) {
  const r = t.repeat;
  const every = h('input', {
    id: 'd-repeat-every', type: 'number', min: 1, max: 99, value: r?.every || 1, disabled: !r || null, 'aria-label': 'Repeat every',
    onchange: e => {
      const n = Math.round(Number(e.target.value));
      if (n >= 1 && n <= 99) set('Change repeat', { repeat: { ...r, every: n } }); else e.target.value = r.every;
    },
  });
  const unit = h('select', { id: 'd-repeat', onchange: e => set(e.target.value ? 'Repeat task' : 'Stop repeating', { repeat: e.target.value ? { every: r?.every || 1, unit: e.target.value } : null }) },
    [['', 'Does not repeat'], ['day', 'Day(s)'], ['week', 'Week(s)'], ['month', 'Month(s)']].map(([v, label]) => h('option', { value: v, selected: (r?.unit || '') === v }, label)));
  return field('Repeats', h('div', { class: 'repeat-control' }, r ? h('span', { class: 'muted' }, 'Every') : null, r ? every : null, unit), {
    id: 'd-repeat',
    hint: r ? `${fmtRepeat(r)}. When you mark it done, the next one is created ${r.every === 1 ? `one ${r.unit}` : `${r.every} ${r.unit}s`} after this one’s dates (skipping any already past), with its checklist cleared.` : 'For routine work: the next one is created when you mark this done.',
  });
}

function checklist(t) {
  const steps = t.checklist;
  const add = () => {
    if (!input.value.trim()) { input.focus(); return; }
    ui.drawer.focusField = 'step-new';
    act('Add step', dd => addStep(dd, t.id, input.value));
  };
  const input = h('input', { id: 'd-step-new', placeholder: 'Add a step', maxlength: 500, autocomplete: 'off', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); add(); } } });
  const done = steps.filter(c => c.done).length;
  return h('div', { class: 'field' }, h('label', { for: 'd-step-new' }, steps.length ? `Checklist · ${done} of ${steps.length} done` : 'Checklist'),
    steps.length ? h('ul', { class: 'checklist' }, steps.map((c, i) => h('li', { class: c.done ? 'is-done' : null },
      h('input', { type: 'checkbox', checked: c.done, 'aria-label': `Step done: ${c.text}`, onchange: e => act(e.target.checked ? 'Tick step' : 'Untick step', dd => patchStep(dd, t.id, c.id, { done: e.target.checked })) }),
      liveText(`d-step-${c.id}`, c.text, value => act('Edit step', dd => patchStep(dd, t.id, c.id, { text: value.slice(0, 500) }), { key: `step:${c.id}`, quiet: true }), { 'aria-label': `Step ${i + 1}`, maxlength: 500 }),
      iconBtn('left', 'Move up', () => act('Reorder steps', dd => moveStep(dd, t.id, c.id, -1)), { class: 'icon-btn sm up', disabled: i === 0 || null }),
      iconBtn('x', `Remove step ${c.text}`, () => act('Remove step', dd => removeStep(dd, t.id, c.id)), { class: 'icon-btn sm' })))) : null,
    h('div', { class: 'phase-add-control' }, input, btn('Add', add, { kind: 'sm', iconName: 'plus' })),
    h('p', { class: 'field-hint' }, 'Small steps inside this task. They have no dates or effort of their own and never block completing the task.'));
}

/** Constraints, RFIs and submittals holding up this task, from the job's log. */
function logSection(t) {
  const book = store.book;
  const linked = book.log.filter(e => e.itemIds.includes(t.id));
  const others = book.log.filter(e => e.status === 'open' && !e.itemIds.includes(t.id) && e.jobId === t.jobId);
  return h('div', { class: 'field' }, h('label', { for: 'd-log-link' }, 'Constraints & RFIs'),
    linked.length ? h('ul', { class: 'deps' }, linked.map(e => h('li', { class: e.status === 'open' ? null : 'is-done' },
      h('span', { class: ['tick-mini', e.status !== 'open' && 'on'] }, e.status !== 'open' ? icon('check', 12) : null),
      h('button', { class: 'link', onclick: () => openDrawer('log', e.id) }, `${e.number} ${e.subject || 'Untitled'}`),
      h('span', { class: isOverdue(e, today()) ? 'danger' : 'muted' }, [e.ball, e.due && e.status === 'open' ? `due ${fmtShort(e.due)}` : ''].filter(Boolean).join(' · ')),
      iconBtn('x', `Unlink ${e.number}`, () => act('Unlink constraint', dd => unlinkLog(dd, e.id, t.id)), { class: 'icon-btn sm' })))) : null,
    h('div', { class: 'phase-add-control' },
      others.length ? h('select', { id: 'd-log-link', 'aria-label': 'Link an open log entry', onchange: e => { if (e.target.value) act('Link constraint', dd => linkLog(dd, e.target.value, t.id)); } },
        h('option', { value: '' }, 'Link an open entry…'), others.map(e => h('option', { value: e.id }, `${e.number} ${e.subject}`))) : null,
      btn('New constraint', () => createLogEntry(t.jobId, t.id), { kind: 'sm', iconName: 'plus', attrs: { id: others.length ? null : 'd-log-link' } })),
    h('p', { class: 'field-hint' }, 'Logged constraints, RFIs and submittals with who has to act. The task is blocked while any is open. See them all in Lookahead → Ball in court.'));
}

function logEditor(e) {
  const book = store.book;
  const set = (label, patch) => act(label, dd => patchLogEntry(dd, e.id, patch, today()));
  const typed = (key, label) => value => act(label, dd => patchLogEntry(dd, e.id, { [key]: value }, today()), { key: `log-${key}:${e.id}`, quiet: true });
  const dateInput = (key, label) => h('input', { id: `d-${key}`, type: 'date', value: e[key], min: '1900-01-01', max: '2200-12-31', 'aria-label': label, onchange: ev => set('Change date', { [key]: ev.target.value }) });
  const linked = e.itemIds.map(id => itemOf(book, id)).filter(Boolean);
  const candidates = book.items.filter(x => !x.archived && x.status !== 'done' && !e.itemIds.includes(x.id));
  const job = jobOf(book, e.jobId);
  return [
    h('div', { class: 'drawer-head', style: { '--job': jobColor(job) } },
      h('div', { class: 'drawer-crumbs' }, h('span', { class: 'dot' }), job.title, chip(LOG_TYPES[e.type][0], 'muted')),
      h('div', { class: 'drawer-head-actions' },
        iconBtn('trash', 'Delete entry', () => { if (confirm(`Delete ${e.number}? Linked tasks are no longer held up by it.`)) { act('Delete log entry', dd => deleteLogEntry(dd, e.id)); closeDrawer(); } }),
        iconBtn('x', 'Close (Esc)', closeDrawer))),
    liveText('d-subject', e.subject, typed('subject', 'Edit subject'), { class: 'drawer-title', 'aria-label': 'Subject', maxlength: 500, placeholder: 'What is needed, e.g. Confirm slab edge detail at grid C' }),
    h('p', { class: 'field-hint' }, 'Changes save automatically. Open entries block their linked tasks until marked cleared.'),
    h('div', { class: 'drawer-row' },
      segmented([['open', 'Open'], ['cleared', 'Cleared']], e.status, st => setLogStatus(e, st), 'Status'),
      e.clearedOn ? h('span', { class: 'muted' }, `Cleared ${fmtDate(e.clearedOn)}`) : null),
    h('div', { class: 'fields two' },
      field('Type', h('select', { id: 'd-type', onchange: ev => set('Change type', { type: ev.target.value }) },
        Object.entries(LOG_TYPES).map(([key, [label]]) => h('option', { value: key, selected: key === e.type }, label))), { id: 'd-type' }),
      field('Number', liveText('d-number', e.number, typed('number', 'Edit number'), { maxlength: 40 }), { id: 'd-number' })),
    field('Ball in court', h('div', null,
      liveText('d-ball', e.ball, typed('ball', 'Ball in court'), { maxlength: 200, list: 'd-ball-parties', placeholder: 'Who has to act next: Owner, MEP engineer, GC…', autocomplete: 'off' }),
      h('datalist', { id: 'd-ball-parties' }, parties(book).map(p => h('option', { value: p })))), { id: 'd-ball', hint: 'Change it when the ball moves, e.g. a submittal returned for revision goes back to the contractor.' }),
    h('div', { class: 'fields two' },
      field('Sent / raised', dateInput('sent', 'Sent'), { id: 'd-sent' }),
      field('Response due', dateInput('due', 'Response due'), { id: 'd-due', hint: e.due ? relDay(e.due) : 'When an answer is needed' })),
    field('Job', h('select', { id: 'd-log-job', onchange: ev => set('Move entry to job', { jobId: ev.target.value }) },
      liveJobs(book).map(j => h('option', { value: j.id, selected: j.id === e.jobId }, j.title))), { id: 'd-log-job' }),
    h('div', { class: 'field' }, h('label', { for: 'd-log-items' }, 'Holds up these tasks'),
      linked.length ? h('ul', { class: 'deps' }, linked.map(t => h('li', { class: t.status === 'done' ? 'is-done' : null },
        h('button', { class: 'link', onclick: () => openDrawer('item', t.id) }, t.title),
        h('span', { class: 'muted' }, t.start ? `starts ${fmtShort(t.start)}` : t.plannedDay ? `work on ${fmtShort(t.plannedDay)}` : ''),
        iconBtn('x', `Unlink ${t.title}`, () => act('Unlink task', dd => unlinkLog(dd, e.id, t.id)), { class: 'icon-btn sm' })))) : null,
      h('select', { id: 'd-log-items', 'aria-label': 'Link a task', onchange: ev => { if (ev.target.value) act('Link task', dd => linkLog(dd, e.id, ev.target.value)); } },
        h('option', { value: '' }, 'Link a task…'),
        liveJobs(book).map(j => {
          const opts = candidates.filter(x => x.jobId === j.id);
          return opts.length ? h('optgroup', { label: j.title }, opts.map(x => h('option', { value: x.id }, x.title))) : null;
        }))),
    field('Notes', liveText('d-log-notes', e.notes, typed('notes', 'Edit notes'), { multiline: true, rows: 3, placeholder: 'Question asked, answer received, references…' }), { id: 'd-log-notes' }),
  ];
}

function jobEditor(job) {
  const book = store.book;
  const set = (label, patch) => act(label, dd => patchJob(dd, job.id, patch));
  const typed = (key, label) => value => act(label, dd => patchJob(dd, job.id, { [key]: value }), { key: `job-${key}:${job.id}`, quiet: true });
  const phases = phasesOf(book, job.id);
  const count = id => book.items.filter(t => t.phaseId === id && !t.archived).length;
  const changeJobStatus = status => {
    const open = book.items.filter(t => t.jobId === job.id && !t.archived && t.status !== 'done').length;
    if (status === 'done' && open && !confirm(`Complete this job with ${open} unfinished task${open === 1 ? '' : 's'}? They will be kept in Plan and Board, but removed from Today and Week until you reactivate the job.`)) return;
    set('Job status', { status });
  };

  const newPhase = h('input', {
    id: 'd-phases', placeholder: 'New phase name', autocomplete: 'off',
    onkeydown: e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      submitPhase();
    },
  });
  const submitPhase = () => {
    if (!newPhase.value.trim()) { newPhase.focus(); return; }
    ui.drawer.focusField = 'phases';
    act('Add phase', dd => addPhase(dd, job.id, newPhase.value.trim()));
  };

  return [
    h('div', { class: 'drawer-head', style: { '--job': jobColor(job) } },
      h('div', { class: 'drawer-crumbs' }, h('span', { class: 'dot' }), 'Job', job.archived ? chip('Archived', 'muted') : null),
      h('div', { class: 'drawer-head-actions' },
        iconBtn('notes', 'Open notebook', () => { ui.notesJob = job.id; ui.drawer = null; setView('notes'); }),
        iconBtn('archive', job.archived ? 'Restore job' : 'Archive job', () => set(job.archived ? 'Restore job' : 'Archive job', { archived: !job.archived })),
        iconBtn('trash', 'Delete job', () => removeJob(job.id)),
        iconBtn('x', 'Close (Esc)', closeDrawer))),
    liveText('d-title', job.title, typed('title', 'Rename job'), { class: 'drawer-title', 'aria-label': 'Job name', maxlength: 500, placeholder: 'Job name' }),
    h('p', { class: 'field-hint' }, 'Job → optional phases → tasks. A phase groups tasks; add the actual work with Add task. Changes save automatically.'),
    btn('Add task without a phase', () => createTask(job.id), { kind: 'primary', iconName: 'plus' }),
    field('Outcome', liveText('d-outcome', job.outcome, typed('outcome', 'Edit outcome'), { multiline: true, rows: 2, placeholder: 'What will exist when this job is done?' }), { id: 'd-outcome' }),
    h('div', { class: 'fields two' },
      field('Short code', liveText('d-code', job.code, typed('code', 'Edit code'), { maxlength: 40, placeholder: 'e.g. PHD — used with # in quick add' }), { id: 'd-code' }),
      field('Status', segmented(Object.entries(JOB_STATUS), job.status, changeJobStatus, 'Job status'), { hint: 'On hold and Complete pause all tasks in Today and Week. Plan, Board and Notes keep them accessible. Active restores them.' })),
    field('Colour', h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Job colour' }, Object.entries(COLORS).map(([key, c]) => h('button', {
      role: 'radio', 'aria-checked': String(job.color === key), 'aria-label': c.label, title: c.label,
      class: ['swatch', job.color === key && 'on'], style: { '--sw': c.hex }, onclick: () => set('Job colour', { color: key }),
    })))),
    h('div', { class: 'field' }, h('label', { for: 'd-phases' }, 'Phases — optional task groups'),
      phases.length ? h('ol', { class: 'phase-list' }, phases.map((p, i) => h('li', null,
        h('input', { id: `d-phase-${p.id}`, value: p.title, 'aria-label': `Phase ${i + 1} name`, onchange: e => act('Rename phase', dd => renamePhase(dd, p.id, e.target.value.trim() || p.title)) }),
        h('span', { class: 'muted' }, `${count(p.id)} tasks`),
        btn('Add task', () => createTask(job.id, p.id), { kind: 'sm', iconName: 'plus' }),
        iconBtn('left', 'Move earlier', () => act('Reorder phases', dd => movePhase(dd, p.id, -1)), { class: 'icon-btn sm up', disabled: i === 0 || null }),
        iconBtn('right', 'Move later', () => act('Reorder phases', dd => movePhase(dd, p.id, 1)), { class: 'icon-btn sm down', disabled: i === phases.length - 1 || null }),
        iconBtn('x', `Remove phase ${p.title}`, () => act('Remove phase', dd => deletePhase(dd, p.id)), { class: 'icon-btn sm', title: count(p.id) ? 'Remove phase (its tasks stay in the job, unphased)' : 'Remove phase' }))))
        : btn(`Add standard phases: ${STANDARD_PHASES.join(' · ')}`, () => act('Add phases', dd => STANDARD_PHASES.forEach(p => addPhase(dd, job.id, p))), { kind: 'sm ghost', iconName: 'plus' }),
      h('div', { class: 'phase-add-control' }, newPhase, btn('Add phase', submitPhase, { kind: 'sm', iconName: 'plus' }))),
    h('p', { class: 'field-hint' }, `${NOTE_PAGES.filter(([k]) => job.notes[k].trim()).length} of ${NOTE_PAGES.length} notebook pages written.`),
  ];
}
