// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Lookahead (Last Planner): which upcoming work is ready, who holds the ball on each constraint,
// and how reliably weekly commitments are kept (Percent Plan Complete).
import { h } from '../dom.js';
import { addDays, fmtDate, fmtShort, mondayOf, relDay } from '../../core/dates.js';
import { LOG_TYPES, MISS_REASONS } from '../../core/model.js';
import { itemOf, jobOf, liveJobs } from '../../core/query.js';
import { addLogEntry, ballInCourt, commitWeek, isOverdue, logCsv, lookahead, patchLogEntry, ppcHistory, ppcWeek, setMissReason } from '../../core/lastplanner.js';
import { act, notify, openDrawer, rerender, store, today, ui } from '../state.js';
import { btn, chip, emptyState, itemRow, jobTag } from '../components.js';
import { personSelect, workPersonId } from '../people.js';
import { welcome } from './welcome.js';

const TABS = [['lookahead', 'Lookahead'], ['ball', 'Ball in court'], ['ppc', 'PPC']];

/** New log entry for a job, optionally holding up a task; opens it for editing. */
export function createLogEntry(jobId, itemId = '', type = 'constraint') {
  const entry = act(itemId ? 'Add constraint' : 'New log entry', d => addLogEntry(d, { jobId, type, itemIds: itemId ? [itemId] : [] }));
  if (entry) openDrawer('log', entry.id, 'subject');
  return entry;
}

export function setLogStatus(entry, status) {
  return act(status === 'cleared' ? 'Clear constraint' : 'Reopen constraint', d => patchLogEntry(d, entry.id, { status }, today()));
}

function logDueChip(e, day) {
  if (!e.due) return e.status === 'open' ? chip('No response date', 'muted') : null;
  if (e.status !== 'open') return chip(`Cleared ${e.clearedOn ? fmtShort(e.clearedOn) : ''}`.trim(), 'muted');
  return chip(`Response due ${relDay(e.due, day)}`, isOverdue(e, day) ? 'danger' : e.due <= addDays(day, 2) ? 'warn' : '', fmtDate(e.due));
}

function entryLine(e, day, { tooLate = false, showJob = false } = {}) {
  const book = store.book;
  return h('div', { class: ['log-line', e.status !== 'open' && 'is-cleared'] },
    h('span', { class: 'log-number' }, e.number || LOG_TYPES[e.type][0]),
    h('button', { class: 'link log-subject', onclick: () => openDrawer('log', e.id) }, e.subject || 'Untitled'),
    showJob ? jobTag(jobOf(book, e.jobId)) : null,
    h('span', { class: 'muted' }, LOG_TYPES[e.type][0]),
    e.ball ? chip(`Ball: ${e.ball}`, 'accent', 'Ball in court: who has to act next') : chip('No one named', 'muted'),
    logDueChip(e, day),
    tooLate ? chip('Due after the work needs it', 'warn', 'The response is due later than this task is meant to start') : null,
    btn(e.status === 'open' ? 'Cleared' : 'Reopen', () => setLogStatus(e, e.status === 'open' ? 'cleared' : 'open'), { kind: 'sm ghost', iconName: e.status === 'open' ? 'check' : 'undo', attrs: { 'aria-label': `${e.status === 'open' ? 'Mark cleared' : 'Reopen'}: ${e.number} ${e.subject}` } }));
}

export function renderLookahead() {
  const book = store.book;
  if (!liveJobs(book).length) return welcome();
  const tab = ui.lookaheadTab;
  const openCount = book.log.filter(e => e.status === 'open' && (!ui.focus || e.jobId === ui.focus)).length;
  const personId = workPersonId();
  const actions = [];
  if (tab !== 'ball') actions.push(personSelect(personId, value => { ui.workPerson = value; rerender(); }, { id: 'lookahead-person', label: 'Show work for' }));
  if (tab === 'lookahead') actions.push(h('label', { class: 'person-filter' }, 'Weeks ahead', h('select', { id: 'lookahead-weeks', onchange: e => { ui.lookaheadWeeks = Number(e.target.value); rerender(); } },
    [3, 4, 6].map(n => h('option', { value: n, selected: ui.lookaheadWeeks === n }, `${n} weeks`)))));
  if (tab === 'ball') {
    actions.push(h('label', { class: 'toggle' }, h('input', { id: 'log-show-cleared', type: 'checkbox', checked: ui.logShowCleared, onchange: e => { ui.logShowCleared = e.target.checked; rerender(); } }), 'Show cleared'),
      btn('Export CSV', exportLog, { kind: 'sm' }),
      btn('New entry', () => createLogEntry(ui.focus || liveJobs(book)[0].id), { kind: 'sm primary', iconName: 'plus', attrs: { id: 'log-new' } }));
  }
  actions.push(btn('Print', () => window.print(), { kind: 'sm', iconName: 'print' }));
  const body = tab === 'ball' ? ballView() : tab === 'ppc' ? ppcView(personId) : lookaheadView(personId);
  return h('div', { class: 'view lookahead' },
    h('header', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow' }, 'Last Planner'), h('h1', null, TABS.find(([k]) => k === tab)[1])),
      h('div', { class: 'page-actions' }, actions)),
    h('div', { class: 'tabs panel-tabs', role: 'tablist' }, TABS.map(([key, label]) => h('button', {
      role: 'tab', 'aria-selected': String(tab === key), class: tab === key ? 'on' : null, onclick: () => { ui.lookaheadTab = key; rerender(); },
    }, label, key === 'ball' && openCount ? h('span', { class: 'badge' }, String(openCount)) : null))),
    body);
}

function lookaheadView(personId) {
  const book = store.book;
  const day = today();
  const weeks = lookahead(book, day, ui.lookaheadWeeks, { focus: ui.focus, person: personId });
  const rows = weeks.flatMap(w => w.rows);
  const constrained = rows.filter(r => !r.ready);
  const overdue = new Set(rows.flatMap(r => r.constraints.filter(c => c.overdue).map(c => c.entry.id))).size;
  return h('div', null,
    h('p', { class: 'hint lookahead-intro' }, 'Make work ready before it is due: each task needs its constraints cleared — answers, approvals, submittals, prerequisites — before its week arrives. Add a constraint to record what stands in the way and who has to act.'),
    h('div', { class: 'panel lookahead-summary' },
      `${rows.length} task${rows.length === 1 ? '' : 's'} in the next ${ui.lookaheadWeeks} weeks · `,
      h('strong', null, `${rows.length - constrained.length} ready`), ` · ${constrained.length} constrained`,
      overdue ? h('span', { class: 'danger' }, ` · ${overdue} constraint response${overdue === 1 ? '' : 's'} overdue`) : null),
    weeks.map((w, i) => h('section', { class: 'panel lookahead-week' },
      h('div', { class: 'panel-head' },
        h('h2', null, i === 0 ? 'This week' : `Week of ${fmtShort(w.monday)}`),
        h('span', { class: 'muted' }, `${fmtShort(w.monday)} – ${fmtShort(addDays(w.monday, 6))} · ${w.rows.filter(r => r.ready).length} of ${w.rows.length} ready`)),
      w.rows.length ? h('div', { class: 'list' }, w.rows.map(r => h('div', { class: ['lookahead-row', r.ready ? 'is-ready' : 'is-constrained'], 'data-lookahead': r.item.id },
        itemRow(r.item, { showPhase: true, actions: [
          r.ready ? chip('Ready', 'accent') : null,
          btn('Constraint', () => createLogEntry(r.item.jobId, r.item.id), { kind: 'sm ghost', iconName: 'plus', attrs: { 'aria-label': `Add constraint to ${r.item.title}` } })] }),
        r.earlier ? h('p', { class: 'field-hint' }, 'Scheduled before this week and not finished.') : null,
        r.constraints.length ? h('div', { class: 'log-lines' }, r.constraints.map(c => entryLine(c.entry, day, { tooLate: c.tooLate }))) : null)))
        : h('p', { class: 'muted' }, 'Nothing scheduled.'))));
}

function ballView() {
  const book = store.book;
  const day = today();
  const groups = ballInCourt(book, day, { focus: ui.focus, showCleared: ui.logShowCleared });
  if (!groups.length) {
    return emptyState(ui.logShowCleared ? 'No log entries yet' : 'Nothing waiting on anyone',
      'Log constraints, RFIs, submittals, approvals and information requests. Link them to the tasks they hold up; those tasks stay blocked until the entry is cleared.',
      btn('New entry', () => createLogEntry(ui.focus || liveJobs(book)[0].id), { kind: 'primary', iconName: 'plus' }));
  }
  return h('div', null, groups.map(g => h('section', { class: 'panel ball-group' },
    h('div', { class: 'panel-head' }, h('h2', null, g.party),
      h('span', { class: 'muted' }, `${g.entries.filter(e => e.status === 'open').length} open`), g.overdue ? h('span', { class: 'danger' }, ` · ${g.overdue} overdue`) : null),
    h('div', { class: 'log-lines' }, g.entries.map(e => h('div', { class: 'ball-entry' },
      entryLine(e, day, { showJob: !ui.focus }),
      h('p', { class: 'field-hint' }, [e.sent ? `Sent ${fmtShort(e.sent)}` : '', e.itemIds.length ? `Holds up: ${e.itemIds.map(id => itemOf(book, id)?.title).filter(Boolean).join(', ')}` : 'Not linked to a task'].filter(Boolean).join(' · '))))))));
}

function exportLog() {
  const book = store.book;
  const entries = ballInCourt(book, today(), { focus: ui.focus, showCleared: ui.logShowCleared }).flatMap(g => g.entries);
  const url = URL.createObjectURL(new Blob([logCsv(book, entries, today())], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: `${book.name.replace(/[^a-z0-9]+/gi, '-')}-constraint-log.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  notify(`Exported ${entries.length} log entr${entries.length === 1 ? 'y' : 'ies'}.`);
}

/** Commits the current week's plan; usable from Week and from the PPC tab. */
export function commitThisWeek(monday) {
  const ids = act('Commit week', d => commitWeek(d, monday, today()));
  if (ids) notify(`Committed ${ids.length} task${ids.length === 1 ? '' : 's'} for the week of ${fmtShort(monday)}. PPC is measured against this list.`);
  return ids;
}

function ppcView(personId) {
  const book = store.book;
  const day = today();
  const current = mondayOf(day);
  const { weeks, reasons, average } = ppcHistory(book, day, { person: personId });
  const now = ppcWeek(book, current, day, { person: personId });
  const reasonRows = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  const maxReason = Math.max(1, ...reasonRows.map(([, n]) => n));
  const lastIndex = weeks.length - 1;

  return h('div', null,
    h('p', { class: 'hint lookahead-intro' }, 'Percent Plan Complete: of the tasks you committed to for a week, how many were done by its Sunday. Commit each week after planning it in Week; recording why work was missed shows what to fix.'),
    h('div', { class: 'ppc-top' },
      h('section', { class: 'panel ppc-stat' },
        h('p', { class: 'eyebrow' }, 'This week'),
        now ? [h('p', { class: 'ppc-number' }, now.ppc === null ? '—' : `${now.ppc}%`),
          h('p', { class: 'muted' }, `${now.done.length} of ${now.committed.length} committed tasks done so far · committed ${fmtShort(now.committedOn)}`),
          btn('Re-commit', () => commitThisWeek(current), { kind: 'sm ghost', title: 'Record the week’s current plan as the commitment' })]
          : [h('p', { class: 'ppc-number muted' }, '—'), h('p', { class: 'muted' }, 'Not committed yet.'),
            btn('Commit this week', () => commitThisWeek(current), { kind: 'sm primary', attrs: { id: 'ppc-commit' } })]),
      h('section', { class: 'panel ppc-stat' },
        h('p', { class: 'eyebrow' }, 'Average, finished weeks'),
        h('p', { class: 'ppc-number' }, average === null ? '—' : `${average}%`),
        h('p', { class: 'muted' }, `${weeks.filter(w => w.closed).length} finished week${weeks.filter(w => w.closed).length === 1 ? '' : 's'} with a commitment`))),
    weeks.length ? h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'PPC by week'), h('span', { class: 'muted' }, 'Lighter bar: this week, still in progress')),
      h('div', { class: 'ppc-chart', role: 'img', 'aria-label': `PPC by week: ${weeks.map(w => `${fmtShort(w.monday)} ${w.ppc ?? 0}%`).join(', ')}` },
        weeks.map((w, i) => h('div', { class: ['ppc-col', !w.closed && 'is-open'], title: `Week of ${fmtShort(w.monday)}: ${w.ppc ?? 0}% (${w.done.length} of ${w.committed.length})${w.closed ? '' : ', in progress'}` },
          h('span', { class: 'ppc-value' }, i === lastIndex ? `${w.ppc ?? 0}%` : ''),
          h('div', { class: 'ppc-track' }, h('span', { class: 'ppc-bar', style: { height: `${w.ppc ?? 0}%` } })),
          h('span', { class: 'ppc-label' }, fmtShort(w.monday)))))) : null,
    reasonRows.length ? h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'Why committed work was missed'), h('span', { class: 'muted' }, 'Finished weeks shown above')),
      h('div', { class: 'reason-bars' }, reasonRows.map(([key, n]) => h('div', { class: 'reason-row' },
        h('span', null, MISS_REASONS[key] || 'No reason recorded'),
        h('div', { class: 'reason-track' }, h('span', { style: { width: `${(n / maxReason) * 100}%` } })),
        h('strong', null, String(n)))))) : null,
    weeks.length ? [...weeks].reverse().map(w => h('details', { class: 'panel ppc-week', open: w.monday === current || (w.closed && w === weeks.filter(x => x.closed).at(-1)) || null },
      h('summary', null, h('strong', null, `Week of ${fmtShort(w.monday)}`), ` · ${w.ppc ?? 0}% · ${w.done.length} of ${w.committed.length} done${w.closed ? '' : ' so far'}`),
      w.missed.length ? h('div', { class: 'list' }, w.missed.map(t => h('div', { class: 'ppc-miss' },
        itemRow(t, { showPhase: true }),
        w.closed ? h('label', { class: 'person-filter' }, 'Reason', h('select', { 'aria-label': `Reason “${t.title}” was missed`, onchange: e => act('Record reason', d => setMissReason(d, w.monday, t.id, e.target.value)) },
          h('option', { value: '' }, 'Choose a reason…'),
          Object.entries(MISS_REASONS).map(([key, label]) => h('option', { value: key, selected: w.reasons[t.id] === key }, label)))) : null)))
        : h('p', { class: 'muted' }, w.committed.length ? 'Every committed task was done.' : 'Nothing was committed.')))
      : emptyState('No committed weeks yet', 'Plan this week in Week, then press Commit this week. PPC compares that list with what gets done.'));
}
