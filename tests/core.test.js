// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, fmtDate, mondayOf, parseDayWord, relDay, isIsoDate } from '../src/core/dates.js';
import { decodeBook, encodeBook, newBook, validate, findCycle } from '../src/core/model.js';
import { addItem, addJob, captureBaseline, deleteItem, deleteJob, deletePhase, movePhase, patchItem, shiftItem } from '../src/core/ops.js';
import { blockers, boardColumn, dependents, lastWorkedJob, planRows, readyToPlan, slip, todayList, weekLoad } from '../src/core/query.js';
import { fmtEffort, parseEffort, parseQuickAdd } from '../src/core/parse.js';
import { createStore } from '../src/core/store.js';
import { exampleBook } from '../src/core/example.js';

const TODAY = '2026-10-17'; // a Saturday

function book2() {
  const b = newBook('Test');
  const job = addJob(b, { title: 'Methodology', code: 'PHD' }, ['Read', 'Write']);
  return { b, job, phases: b.phases };
}

test('dates: validity, week maths and parsing words', () => {
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(mondayOf(TODAY), '2026-10-12');
  assert.equal(mondayOf('2026-10-12'), '2026-10-12');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30'); // across a DST change in Europe
  assert.equal(parseDayWord('today', TODAY), TODAY);
  assert.equal(parseDayWord('tomorrow', TODAY), '2026-10-18');
  assert.equal(parseDayWord('sat', TODAY), TODAY, 'weekday includes today');
  assert.equal(parseDayWord('monday', TODAY), '2026-10-19');
  assert.equal(parseDayWord('friday', TODAY), '2026-10-23');
  assert.equal(parseDayWord('frid', TODAY), null);
  assert.equal(parseDayWord('2026-12-01', TODAY), '2026-12-01');
  assert.equal(fmtDate('2026-10-19', TODAY), 'Mon 19 Oct');
  assert.equal(fmtDate('2027-01-04', TODAY), 'Mon 4 Jan 2027');
  assert.equal(relDay('2026-10-18', TODAY), 'tomorrow');
  assert.equal(relDay('2026-10-14', TODAY), '3 days ago');
});

test('effort parsing and formatting', () => {
  const cases = { '2h': 120, '1h30': 90, '1h 30m': 90, '1.5h': 90, '90m': 90, '45': 45, '1.5': 90, '2': 120, '1d': 480, '': 0 };
  for (const [input, min] of Object.entries(cases)) assert.equal(parseEffort(input), min, input);
  assert.equal(parseEffort('soon'), null);
  assert.equal(fmtEffort(0), '');
  assert.equal(fmtEffort(45), '45m');
  assert.equal(fmtEffort(90), '1h 30m');
  assert.equal(fmtEffort(120), '2h');
});

test('quick add extracts job, effort, plan day, due date and milestone flag', () => {
  const { b } = book2();
  addJob(b, { title: 'Kitchen refit', code: 'HOME' });
  const q = parseQuickAdd('Draft lit review #phd 2h @mon !fri', b.jobs, TODAY);
  assert.equal(q.title, 'Draft lit review');
  assert.equal(q.jobId, b.jobs[0].id);
  assert.equal(q.effort, 120);
  assert.equal(q.plannedDay, '2026-10-19');
  assert.equal(q.finish, '2026-10-23');
  assert.deepEqual(q.errors, []);
  assert.equal(parseQuickAdd('Quotes #kit', b.jobs, TODAY).jobId, b.jobs[1].id, 'matches job title prefix');
  assert.equal(parseQuickAdd('Quotes #ref', b.jobs, TODAY).jobId, b.jobs[1].id, 'matches a later word in the title');
  const ms = parseQuickAdd('*Supervisor sign-off !2026-11-30', b.jobs, TODAY);
  assert.equal(ms.kind, 'milestone');
  assert.equal(ms.title, 'Supervisor sign-off');
  assert.deepEqual(parseQuickAdd('Thing #nope @someday', b.jobs, TODAY).errors.length, 2);
  assert.equal(parseQuickAdd('Call 2 suppliers', b.jobs, TODAY).title, 'Call 2 suppliers', 'bare numbers stay in the title');
});

test('blockers come from recorded constraints and unfinished prerequisites', () => {
  const { b, job } = book2();
  const a = addItem(b, { jobId: job.id, title: 'A' });
  const c = addItem(b, { jobId: job.id, title: 'C', deps: [a.id] });
  assert.deepEqual(blockers(b, c), ['Waiting for “A”']);
  assert.equal(boardColumn(b, c, TODAY), 'todo', 'an undated successor is waiting, not blocked');
  c.start = '2026-10-20';
  assert.equal(boardColumn(b, c, TODAY), 'todo', 'still waiting while its start is in the future');
  c.start = TODAY;
  assert.equal(boardColumn(b, c, TODAY), 'blocked', 'blocked once it is due to start');
  c.start = '';
  assert.throws(() => patchItem(b, c.id, { status: 'done' }, TODAY), /Can’t complete yet/);
  patchItem(b, a.id, { status: 'done' }, TODAY);
  assert.equal(a.doneOn, TODAY);
  assert.deepEqual(blockers(b, c), []);
  patchItem(b, c.id, { blocker: 'Need access' }, TODAY);
  assert.equal(boardColumn(b, c, TODAY), 'blocked', 'a written constraint always blocks');
  patchItem(b, a.id, { status: 'todo' }, TODAY);
  assert.equal(a.doneOn, '');
});

test('validation rejects loops, bad dates and dangling references', () => {
  const { b, job } = book2();
  const a = addItem(b, { jobId: job.id, title: 'A' });
  const c = addItem(b, { jobId: job.id, title: 'C', deps: [a.id] });
  a.deps = [c.id];
  assert.equal(findCycle(b.items), true);
  assert.throws(() => validate(b), /loop/);
  a.deps = [];
  c.finish = '2026-10-01'; c.start = '2026-10-05';
  assert.throws(() => validate(b), /finishes before it starts/);
  c.start = '';
  validate(b);
  assert.deepEqual([...dependents(b, a.id)], [c.id]);
});

test('editing a start past the finish keeps the duration; milestones collapse to one date', () => {
  const { b, job } = book2();
  const t = addItem(b, { jobId: job.id, title: 'T', start: '2026-10-19', finish: '2026-10-21' });
  patchItem(b, t.id, { start: '2026-10-25' }, TODAY);
  assert.equal(t.finish, '2026-10-27');
  patchItem(b, t.id, { kind: 'milestone' }, TODAY);
  assert.equal(t.start, '2026-10-27');
  assert.equal(t.finish, '2026-10-27');
  shiftItem(b, t.id, -2);
  assert.equal(t.start, '2026-10-25');
});

test('delete removes dependency links; phase delete keeps its items unphased', () => {
  const { b, job, phases } = book2();
  const a = addItem(b, { jobId: job.id, phaseId: phases[0].id, title: 'A' });
  const c = addItem(b, { jobId: job.id, title: 'C', deps: [a.id] });
  deletePhase(b, phases[0].id);
  assert.equal(a.phaseId, '');
  deleteItem(b, a.id);
  assert.deepEqual(c.deps, []);
  movePhase(b, phases[1].id, -1);
  validate(b);
  deleteJob(b, job.id);
  assert.equal(b.items.length, 0);
  assert.equal(b.phases.length, 0);
});

test('baseline and slip', () => {
  const { b, job } = book2();
  const t = addItem(b, { jobId: job.id, title: 'T', start: '2026-10-19', finish: '2026-10-21' });
  captureBaseline(b, TODAY);
  assert.equal(slip(t), 0);
  shiftItem(b, t.id, 3);
  assert.equal(slip(t), 3);
});

test('week load, ready-to-plan and today lists', () => {
  const { b, job } = book2();
  const mon = mondayOf(TODAY);
  addItem(b, { jobId: job.id, title: 'Planned', effort: 60, plannedDay: TODAY });
  addItem(b, { jobId: job.id, title: 'Carried', effort: 30, plannedDay: addDays(TODAY, -2) });
  addItem(b, { jobId: job.id, title: 'Late', effort: 30, finish: addDays(TODAY, -1) });
  addItem(b, { jobId: job.id, title: 'Free', effort: 30 });
  addItem(b, { jobId: job.id, title: 'Next week', plannedDay: addDays(mon, 8) });
  const load = weekLoad(b, mon);
  assert.equal(load.planned, 90);
  assert.equal(load.byDay[TODAY].length, 1);
  assert.deepEqual(readyToPlan(b, mon).map(t => t.title), ['Late', 'Free']);
  const today = todayList(b, TODAY);
  assert.deepEqual(today.planned.map(t => t.title), ['Planned']);
  assert.deepEqual(today.carried.map(t => t.title), ['Carried']);
  assert.deepEqual(today.overdue.map(t => t.title), ['Late']);
});

test('plan rows group items by job and phase in schedule order', () => {
  const { b, job, phases } = book2();
  addItem(b, { jobId: job.id, phaseId: phases[1].id, title: 'Later', start: '2026-11-01', finish: '2026-11-02' });
  addItem(b, { jobId: job.id, phaseId: phases[1].id, title: 'Sooner', start: '2026-10-20', finish: '2026-10-22' });
  addItem(b, { jobId: job.id, title: 'Loose' });
  const rows = planRows(b);
  assert.deepEqual(rows.map(r => r.type === 'item' ? r.item.title : r.type === 'phase' ? `[${r.phase?.title || 'No phase'}]` : r.job.title),
    ['Methodology', '[Read]', '[Write]', 'Sooner', 'Later', '[No phase]', 'Loose']);
});

test('store: commit validates, coalesces typing, undo/redo and dirty tracking', () => {
  const { b, job } = book2();
  const store = createStore(b);
  assert.equal(store.dirty, false);
  assert.throws(() => store.commit('bad', d => { d.items.push({ id: 'x' }); }));
  assert.equal(store.book.items.length, 0, 'invalid change is not applied');
  store.commit('add', d => addItem(d, { jobId: job.id, title: 'A' }));
  const id = store.book.items[0].id;
  store.commit('type', d => { d.items[0].notes = 'h'; }, { key: `notes:${id}` });
  store.commit('type', d => { d.items[0].notes = 'he'; }, { key: `notes:${id}` });
  assert.equal(store.dirty, true);
  assert.equal(store.undo(), 'type');
  assert.equal(store.book.items[0].notes, '', 'two keystrokes undo as one step');
  store.redo();
  assert.equal(store.book.items[0].notes, 'he');
  store.markSaved(store.revision);
  assert.equal(store.dirty, false);
});

test('file round trip and migration from version 2', () => {
  const ex = exampleBook(TODAY);
  const { book, upgradedFrom } = decodeBook(encodeBook(ex));
  assert.equal(upgradedFrom, null);
  assert.deepEqual(book, ex);
  const v2 = {
    format: 'tas-time-planning-book', version: 2, name: 'Old', baselineDate: '2026-10-01',
    jobs: [{ id: 'j', title: 'Job', code: 'J', outcome: '', color: 'blue', status: 'On hold', archived: false, notes: { scope: 's', decisions: '', working: '', references: '', restart: 'r' } }],
    phases: [{ id: 'p', jobId: 'j', title: 'P', order: 0 }],
    items: [
      { id: 'a', jobId: 'j', phaseId: 'p', title: 'A', kind: 'Action', owner: '', start: '2026-10-01', finish: '2026-10-03', remaining: 45, status: 'Done', archived: false, predecessors: [], blocker: '', plannedDay: '', baselineStart: '2026-10-01', baselineFinish: '2026-10-02', acceptedOn: '2026-10-03', notes: '' },
      { id: 'm', jobId: 'j', phaseId: '', title: 'M', kind: 'Milestone', owner: '', start: '2026-10-09', finish: '2026-10-09', remaining: 0, status: 'Not started', archived: true, predecessors: ['a'], blocker: '', plannedDay: '', baselineStart: '', baselineFinish: '', acceptedOn: '', notes: '' },
    ],
    weeks: { '2026-10-12': { capacity: 240, notes: 'n' } },
  };
  const up = decodeBook(JSON.stringify(v2));
  assert.equal(up.upgradedFrom, 2);
  const [a, m] = up.book.items;
  assert.equal(up.book.jobs[0].status, 'hold');
  assert.equal(up.book.jobs[0].notes.restart, 'r');
  assert.equal(a.status, 'done'); assert.equal(a.effort, 45); assert.deepEqual(a.baseline, { start: '2026-10-01', finish: '2026-10-02' });
  assert.equal(m.kind, 'milestone'); assert.equal(m.archived, true); assert.deepEqual(m.deps, ['a']); assert.equal(m.baseline, null);
  assert.equal(up.book.weeks['2026-10-12'].capacity, 240);
  assert.throws(() => decodeBook('{nope'), /not valid JSON/);
  assert.throws(() => decodeBook('{"format":"other"}'), /not a Tas-Time/);
});

test('books saved before the Lessons learned page existed still open, with that page empty', () => {
  const ex = exampleBook(TODAY);
  const old = JSON.parse(encodeBook(ex));
  for (const j of old.jobs) delete j.notes.lessons;
  const { book, upgradedFrom } = decodeBook(JSON.stringify(old));
  assert.equal(upgradedFrom, null);
  assert.ok(book.jobs.every(j => j.notes.lessons === ''));
  assert.equal(book.jobs[0].notes.restart, ex.jobs[0].notes.restart, 'other pages untouched');
});

test('last worked job: latest completion or planned day up to today', () => {
  const { b, job } = book2();
  const other = addJob(b, { title: 'Other', code: 'OTH' });
  assert.equal(lastWorkedJob(b, TODAY), null, 'nothing worked on and no resume notes');
  other.notes.restart = 'Pick up here';
  assert.equal(lastWorkedJob(b, TODAY).id, other.id, 'falls back to a job with a resume note');
  addItem(b, { jobId: job.id, title: 'Done last week', status: 'done', doneOn: addDays(TODAY, -5) });
  addItem(b, { jobId: other.id, title: 'Future plan', plannedDay: addDays(TODAY, 3) });
  assert.equal(lastWorkedJob(b, TODAY).id, job.id, 'future planned days do not count');
  addItem(b, { jobId: other.id, title: 'Planned yesterday', plannedDay: addDays(TODAY, -1) });
  assert.equal(lastWorkedJob(b, TODAY).id, other.id);
});

test('example book is valid and exercises every state', () => {
  const ex = validate(exampleBook(TODAY));
  const cols = new Set(ex.items.map(t => boardColumn(ex, t, TODAY)));
  for (const c of ['todo', 'doing', 'blocked', 'done']) assert.ok(cols.has(c), c);
  assert.ok(ex.items.some(t => slip(t) > 0));
  assert.ok(todayList(ex, TODAY).carried.length);
});
