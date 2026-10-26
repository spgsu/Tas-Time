// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// App frame: sidebar, top bar (quick add + file status), main view and drawer.
import { appMark, fill, h, icon } from './dom.js';
import { fmtEffort, parseQuickAdd } from '../core/parse.js';
import { fmtDate } from '../core/dates.js';
import { jobSummary, liveJobs, phasesOf } from '../core/query.js';
import { APP_VERSION, IS_MAC, VIEWS, keys, closeDrawer, openDrawer, rerender, setFocus, setView, store, today, ui } from './state.js';
import { btn, iconBtn, jobColor } from './components.js';
import { createJob, createTask, quickAdd, redo, undo } from './commands.js';
import { canLinkFiles, file, loadExample, newBlankBook, openFile, prefs, reconnect, save, setPref } from './files.js';
import { showMenu, showModal } from './overlay.js';
import { appearanceMenu } from './appearance.js';
import { showCalendarExport } from './export.js';
import { guideButton, showGuide } from './guide.js';
import { renderDrawer } from './drawer.js';
import { renderToday } from './views/today.js';
import { renderWeek } from './views/week.js';
import { renderPlan } from './views/plan.js';
import { renderBoard } from './views/board.js';
import { renderNotes } from './views/notes.js';

const RENDER = { today: renderToday, week: renderWeek, plan: renderPlan, board: renderBoard, notes: renderNotes };

export function renderShell(scope = 'all') {
  if (scope === 'status') { renderStatus(); return; }
  const active = document.activeElement;
  const focusId = active?.id && active !== document.body ? active.id : '';
  const selection = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const keep = ['plan-scroll'].map(id => [id, document.getElementById(id)]).filter(([, el]) => el).map(([id, el]) => [id, el.scrollLeft, el.scrollTop]);
  const pageY = document.getElementById('main')?.scrollTop || 0;
  const oldDrawer = document.getElementById('drawer');
  const drawerY = oldDrawer && oldDrawer.dataset.record === ui.drawer?.id ? oldDrawer.scrollTop : 0;

  fill(document.getElementById('sidebar'), sidebar());
  renderStatus();
  renderQuickDestination();
  const main = document.getElementById('main');
  fill(main, RENDER[ui.view]());
  const focusedJob = store.book.jobs.find(j => j.id === ui.focus);
  if (focusedJob) main.prepend(h('div', { class: 'focus-banner' },
    h('strong', null, `Showing: ${focusedJob.title}`),
    btn('All jobs', () => setFocus(ui.focus), { kind: 'sm' }),
    btn('Edit job', () => openJobEditor(focusedJob.id), { kind: 'sm' }),
    focusedJob.status !== 'active' ? h('span', null, `${focusedJob.status === 'hold' ? 'On hold' : 'Complete'} · Tasks are paused in Today and Week. Reactivate in Edit job.`) : null));
  main.scrollTop = pageY;
  const drawer = renderDrawer();
  fill(document.getElementById('drawer-host'), drawer);
  if (drawer) drawer.scrollTop = drawerY;
  document.body.classList.toggle('has-drawer', !!drawer);

  for (const [id, left, top] of keep) {
    const el = document.getElementById(id);
    if (el) { el.scrollLeft = left; el.scrollTop = top; }
  }
  if (focusId && focusId !== 'quick-add') {
    const el = document.getElementById(focusId);
    if (el && el !== document.activeElement) {
      el.focus({ preventScroll: true });
      if (selection && 'setSelectionRange' in el) { try { el.setSelectionRange(...selection); } catch { /* not a text field */ } }
    }
  }
  document.title = `${store.dirty ? '• ' : ''}${store.book.name} — Tas-Time`;
}

function sidebar() {
  const book = store.book;
  const jobs = liveJobs(book);
  return [
    h('div', { class: 'brand' }, appMark(30), h('div', null, h('strong', null, 'Tas-Time'),
      h('button', { class: 'book-name', title: 'Rename this planning book', onclick: renameBook }, book.name))),
    h('nav', { class: 'nav', 'aria-label': 'Views' }, VIEWS.map(v => h('button', {
      class: ['nav-item', ui.view === v.id && 'on'], 'aria-current': ui.view === v.id ? 'page' : null, onclick: () => setView(v.id),
    }, icon(v.icon, 18), h('span', null, v.label), h('kbd', null, v.key)))),
    h('div', { class: 'jobs-head' }, h('span', null, 'Jobs'), iconBtn('plus', 'New job', () => createJob(), { class: 'icon-btn sm' })),
    btn('All jobs', () => { ui.focus = ''; rerender(); }, { kind: 'sm ghost' }),
    h('ul', { class: 'jobs' }, jobs.map(j => {
      const s = jobSummary(book, j, today());
      return h('li', null, h('button', {
        class: ['job-link', ui.focus === j.id && 'on'], style: { '--job': jobColor(j) }, 'aria-pressed': String(ui.focus === j.id),
        title: ui.focus === j.id ? 'Showing only this job — click to show all' : `Show only ${j.title}`,
        onclick: () => setFocus(j.id),
      }, h('span', { class: 'dot' }), h('span', { class: 'job-name' }, j.title || 'Untitled job'),
      j.status !== 'active' ? h('span', { class: 'chip' }, j.status === 'hold' ? 'On hold' : 'Complete') : null,
      s.late ? h('span', { class: 'late-dot', title: `${s.late} late` }) : null,
      h('span', { class: 'badge', title: `${s.open} open` }, String(s.open))));
    })),
    jobs.length ? null : h('p', { class: 'jobs-empty' }, 'No jobs yet.'),
    h('div', { class: 'side-foot' },
      h('button', { class: 'foot-link', id: 'guide', onclick: showGuide }, icon('book', 16), 'Beginner’s guide'),
      h('button', { class: 'foot-link', id: 'appearance', 'aria-haspopup': 'menu', onclick: e => appearanceMenu(e.currentTarget) }, icon('palette', 16), 'Appearance'),
      h('button', { class: 'foot-link', onclick: showHelp }, icon('keyboard', 16), 'Shortcuts & help')),
  ];
}

function openJobEditor(id) { openDrawer('job', id); }

function renderQuickDestination() {
  const jobs = liveJobs(store.book);
  const selected = jobs.find(j => j.id === ui.quickJob) || jobs.find(j => j.id === ui.focus) || jobs[0];
  ui.quickJob = selected?.id || '';
  const phases = phasesOf(store.book, ui.quickJob);
  if (!phases.some(p => p.id === ui.quickPhase)) ui.quickPhase = '';
  fill(document.getElementById('quick-destination'),
    h('label', null, 'Job', h('select', { id: 'quick-job', 'aria-label': 'New task job', onchange: e => { ui.quickJob = e.target.value; ui.quickPhase = ''; renderQuickDestination(); document.getElementById('quick-add').dispatchEvent(new Event('input')); } },
      jobs.length ? jobs.map(j => h('option', { value: j.id, selected: j.id === ui.quickJob }, j.title)) : h('option', { value: '' }, 'New Inbox'))),
    h('label', null, 'Phase', h('select', { id: 'quick-phase', 'aria-label': 'New task phase', onchange: e => { ui.quickPhase = e.target.value; document.getElementById('quick-add').dispatchEvent(new Event('input')); } },
      h('option', { value: '' }, 'No phase (optional)'), phases.map(p => h('option', { value: p.id, selected: p.id === ui.quickPhase }, p.title)))),
    btn('Add task', () => {
      const input = document.getElementById('quick-add');
      if (input.value.trim()) {
        if (quickAdd(input.value, { jobId: ui.quickJob, phaseId: ui.quickPhase })) { input.value = ''; input.dispatchEvent(new Event('input')); }
      } else createTask(ui.quickJob, ui.quickPhase);
    }, { kind: 'sm', iconName: 'plus' }));
}

function renameBook() {
  const name = prompt('Name this planning book', store.book.name);
  if (name && name.trim()) store.commit('Rename book', d => { d.name = name.trim().slice(0, 200); });
}

export function renderStatus() {
  const host = document.getElementById('file-status');
  const dirty = store.dirty;
  let label; let kind = ''; let title = ''; let onclick = () => save();
  if (file.state === 'saving') { label = 'Saving…'; kind = 'busy'; }
  else if (file.state === 'reconnect') { label = `Reconnect ${file.name}`; kind = 'warn'; title = 'The browser needs your permission again to keep saving to this file.'; onclick = reconnect; }
  else if (file.state === 'error') { label = 'Save failed — retry'; kind = 'danger'; title = file.lastError; }
  else if (file.handle && !dirty) { label = `Saved · ${file.name}`; kind = 'ok'; title = file.savedAt ? `Last saved ${file.savedAt.toLocaleTimeString()}` : 'Up to date'; }
  else if (file.handle) { label = 'Saving soon…'; kind = 'busy'; }
  else if (dirty) { label = canLinkFiles ? 'Not saved to a file' : 'Unsaved changes'; kind = 'warn'; title = 'Your work is kept in this browser as a recovery copy, but not in a file yet.'; }
  else { label = file.name || 'New book'; title = 'No changes'; }
  fill(host,
    h('button', { class: ['status', kind], title, onclick }, h('span', { class: 'status-dot' }), h('span', { class: 'status-text' }, label)),
    !file.handle ? btn('Save', () => save(), { kind: dirty ? 'primary sm' : 'sm', iconName: 'save', title: `Save (${keys('S')})` }) : null,
    iconBtn('more', 'File menu', e => showMenu(e.currentTarget, fileMenu()), { id: 'file-menu', 'aria-haspopup': 'menu' }));
  if (file.restoredAt) {
    const banner = document.getElementById('banner');
    banner.replaceChildren(h('div', { class: 'banner' }, icon('alert', 16),
      h('span', null, `Restored unsaved changes from ${file.restoredAt.toLocaleString()}.`),
      btn(file.handle ? `Save to ${file.name}` : 'Save to a file', async () => { if (await (file.handle ? reconnect() : save()) !== false) { file.restoredAt = null; rerender(); } }, { kind: 'sm primary' }),
      iconBtn('x', 'Dismiss', () => { file.restoredAt = null; banner.replaceChildren(); })));
  } else document.getElementById('banner').replaceChildren();
}

function fileMenu() {
  const p = prefs();
  return [
    { heading: 'Navigate & help' },
    { label: 'All jobs', run: () => { ui.focus = ''; rerender(); } },
    ...liveJobs(store.book).map(j => ({ label: `Show job: ${j.title}`, run: () => { ui.focus = j.id; ui.quickJob = j.id; ui.quickPhase = ''; rerender(); } })),
    { label: 'New job', icon: 'plus', run: () => createJob() },
    { label: 'Beginner’s guide', icon: 'book', run: showGuide },
    { label: 'Shortcuts & help', icon: 'keyboard', run: showHelp },
    { label: 'Appearance', icon: 'palette', run: () => appearanceMenu(document.getElementById('file-menu')) },
    'separator',
    { label: 'Save', icon: 'save', hint: keys('S'), run: () => save() },
    { label: 'Save as…', icon: 'copy', hint: keys('Shift+S'), run: () => save({ saveAs: true }) },
    { label: 'Open…', icon: 'open', hint: keys('O'), run: openFile },
    'separator',
    { label: 'Undo', icon: 'undo', hint: keys('Z'), run: undo, disabled: !store.canUndo },
    { label: 'Redo', icon: 'redo', hint: keys(IS_MAC ? 'Shift+Z' : 'Y'), run: redo, disabled: !store.canRedo },
    'separator',
    { label: 'New book', icon: 'plus', run: newBlankBook },
    { label: 'Load example book', icon: 'book', run: () => loadExample(today()) },
    { label: 'Rename book…', icon: 'notes', run: renameBook },
    { label: 'Export to calendar (.ics)…', icon: 'week', run: showCalendarExport },
    { label: 'Print this view', icon: 'print', hint: keys('P'), run: () => window.print() },
    'separator',
    { label: p.recovery ? 'Recovery copy: on' : 'Recovery copy: off', icon: p.recovery ? 'check' : 'x', run: () => setPref('recovery', !p.recovery) },
  ];
}

// ── Quick add ──

export function initQuickAdd() {
  const input = document.getElementById('quick-add');
  const preview = document.getElementById('quick-preview');
  const update = () => {
    const v = input.value.trim();
    if (!v) { preview.hidden = true; return; }
    const q = parseQuickAdd(v, store.book.jobs, today());
    const job = store.book.jobs.find(j => j.id === (q.jobId || ui.quickJob || ui.focus)) || liveJobs(store.book)[0];
    const phase = store.book.phases.find(p => p.id === ui.quickPhase && p.jobId === job?.id);
    fill(preview,
      h('span', { class: 'qp-title' }, q.kind === 'milestone' ? '◆ ' : '', q.title || '…'),
      job ? h('span', { class: 'job-tag', style: { '--job': jobColor(job) } }, h('span', { class: 'dot' }), job.title) : h('span', { class: 'chip' }, 'New “Inbox” job'),
      q.effort ? h('span', { class: 'chip' }, fmtEffort(q.effort)) : null,
      h('span', { class: 'chip' }, phase?.title || 'No phase'),
      q.plannedDay ? h('span', { class: 'chip accent' }, `Work on ${fmtDate(q.plannedDay)}`) : null,
      q.finish ? h('span', { class: 'chip' }, `${q.kind === 'milestone' ? 'On' : 'Forecast finish'} ${fmtDate(q.finish)}`) : null,
      !q.plannedDay ? h('span', { class: 'chip' }, 'No work day set · use @today or choose a day in Week') : null,
      q.errors.map(e => h('span', { class: 'chip danger' }, e)),
      h('span', { class: 'qp-help' }, h('kbd', null, 'Enter'), ' add'));
    preview.hidden = false;
  };
  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur', () => setTimeout(() => { preview.hidden = true; }, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; preview.hidden = true; input.blur(); }
    if (e.key === 'Enter' && input.value.trim()) {
      const defaults = { jobId: ui.quickJob, phaseId: ui.quickPhase };
      if (quickAdd(input.value, defaults)) { input.value = ''; update(); }
    }
  });
}

// ── Keyboard ──

function typing(el) { return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable); }

export function initKeys() {
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 's') { e.preventDefault(); save({ saveAs: e.shiftKey }); return; }
    if (mod && key === 'o') { e.preventDefault(); openFile(); return; }
    if (document.querySelector('dialog[open]')) return;
    if (mod && !typing(e.target) && (key === 'z' || key === 'y')) {
      e.preventDefault();
      if (key === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (e.key === 'Escape' && ui.drawer && !e.defaultPrevented) { closeDrawer(); return; }
    if (mod || e.altKey || typing(e.target)) return;
    const view = VIEWS.find(v => v.key === e.key);
    if (view) { e.preventDefault(); setView(view.id); return; }
    if (key === 'n' || e.key === '/') { e.preventDefault(); document.getElementById('quick-add').focus(); return; }
    if (e.key === '?') { e.preventDefault(); showHelp(); return; }
    if (ui.view === 'week' && (e.key === '[' || e.key === ']')) {
      e.preventDefault();
      document.querySelector(`.week [aria-label="${e.key === '[' ? 'Previous week' : 'Next week'}"]`)?.click();
    }
  });
}

export function showHelp() {
  const row = (keys, what) => h('tr', null, h('td', null, keys.map(k => h('kbd', null, k))), h('td', null, what));
  showModal('Shortcuts & help', [
    h('p', { class: 'guide-link' }, 'New to planning? ', guideButton(), ' — a step-by-step walkthrough of one real project, from first idea to finished.'),
    h('div', { class: 'help-grid' },
      h('section', null,
        h('h3', null, 'Quick add'),
        h('p', null, 'Type a task in the box at the top and press Enter. Add any of:'),
        h('table', { class: 'keys' },
          row(['#phd'], 'job, by code or name'), row(['2h', '45m', '1h30'], 'effort'),
          row(['@tue', '@today'], 'day you’ll work on it (otherwise unscheduled in every view)'), row(['!fri', '!2026-12-01'], 'forecast finish, not a fixed deadline'), row(['*'], 'at the start: a milestone')),
        h('h3', null, 'Keys'),
        h('table', { class: 'keys' },
          row(['N', '/'], 'Quick add'), row(['1–5'], 'Today, Week, Plan, Board, Notes'), row([keys('S')], 'Save'), row([keys('Shift+S')], 'Save as'),
          row([keys('O')], 'Open'), row([keys('Z'), keys(IS_MAC ? 'Shift+Z' : 'Y')], 'Undo / redo'), row(['Esc'], 'Close panel'), row(['[', ']'], 'Previous / next week'),
          row(['← →'], 'Move a focused bar on the Plan'), row(['Shift+← →'], 'Change its finish'))),
      h('section', null,
        h('h3', null, 'How it fits together'),
        h('p', null, h('strong', null, 'Plan'), ' is the programme: jobs, phases and dated tasks with prerequisites. Dates are forecasts you control — nothing reschedules itself.'),
        h('p', null, h('strong', null, 'Week'), ' compares the effort you plan with the hours you actually have. Placing a task on a day does not change its programme dates.'),
        h('p', null, h('strong', null, 'Today'), ' shows today’s work, anything carried over, and the resume note for each job you touch.'),
        h('p', null, h('strong', null, 'Blocked'), ' is never set by hand: a task is blocked while it has a written constraint or an unfinished prerequisite.'),
        h('h3', null, 'Your data'),
        h('p', null, 'Your book is a single .json file. After the first Save it is saved automatically to that file (Edge and Chrome). A recovery copy is also kept in this browser in case the window closes; turn that off in the ⋯ menu if this computer is shared.'),
        h('p', null, 'Keep work and personal books in their own environments. Nothing is sent over the network.'))),
    h('p', { class: 'fine' }, `Tas-Time ${APP_VERSION} · © 2026 Selami Pazarbasi · MIT License`),
  ], { wide: true });
}
