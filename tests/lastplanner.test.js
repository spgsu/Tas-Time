// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Last Planner: constraint log, ball in court, lookahead readiness and Percent Plan Complete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBook, encodeBook, newBook, validate } from '../src/core/model.js';
import { addItem, addJob, deleteItem, deleteJob, setStatus } from '../src/core/ops.js';
import { blockers, boardColumn, isBlocked } from '../src/core/query.js';
import {
  addLogEntry, ballInCourt, commitWeek, linkLog, logCsv, lookahead, nextNumber, parties, patchLogEntry, ppcHistory, ppcWeek, setMissReason, unlinkLog,
} from '../src/core/lastplanner.js';

const TODAY = '2026-10-28'; // a Wednesday; its week starts Monday 26 Oct

function project() {
  const b = newBook('Clinic fit-out');
  const job = addJob(b, { title: 'Clinic', code: 'CLN' });
  const other = addJob(b, { title: 'School', code: 'SCH' });
  return { b, job, other };
}

test('numbers run per job and type, and follow a change of type', () => {
  const { b, job, other } = project();
  assert.equal(addLogEntry(b, { jobId: job.id, type: 'rfi' }).number, 'RFI-001');
  assert.equal(addLogEntry(b, { jobId: job.id, type: 'rfi' }).number, 'RFI-002');
  assert.equal(addLogEntry(b, { jobId: other.id, type: 'rfi' }).number, 'RFI-001', 'each job has its own sequence');
  const sub = addLogEntry(b, { jobId: job.id, type: 'submittal' });
  assert.equal(sub.number, 'SUB-001');
  patchLogEntry(b, sub.id, { type: 'rfi' }, TODAY);
  assert.equal(sub.number, 'RFI-003');
  const custom = addLogEntry(b, { jobId: job.id, type: 'rfi', number: 'Owner Q7' });
  patchLogEntry(b, custom.id, { type: 'approval' }, TODAY);
  assert.equal(custom.number, 'Owner Q7', 'a hand-typed number is kept');
  assert.equal(nextNumber(b, job.id, 'constraint'), 'C-001');
  validate(b);
});

test('an open entry blocks its tasks until cleared; clearing records the day', () => {
  const { b, job } = project();
  const t = addItem(b, { jobId: job.id, title: 'Issue ceiling plan', start: '2026-11-02' });
  const rfi = addLogEntry(b, { jobId: job.id, type: 'rfi', subject: 'Ceiling height in exam rooms', ball: 'Owner', itemIds: [t.id] });
  assert.equal(isBlocked(b, t, TODAY), true, 'blocked even before its start date');
  assert.equal(boardColumn(b, t, TODAY), 'blocked');
  assert.match(blockers(b, t)[0], /RFI-001: Ceiling height in exam rooms \(ball in court: Owner\)/);
  assert.throws(() => setStatus(b, t.id, 'done', TODAY), /Can’t complete yet/);
  patchLogEntry(b, rfi.id, { status: 'cleared' }, TODAY);
  assert.equal(rfi.clearedOn, TODAY);
  assert.equal(isBlocked(b, t, TODAY), false);
  patchLogEntry(b, rfi.id, { status: 'open' }, TODAY);
  assert.equal(rfi.clearedOn, '');
  unlinkLog(b, rfi.id, t.id);
  assert.equal(isBlocked(b, t, TODAY), false);
  linkLog(b, rfi.id, t.id); linkLog(b, rfi.id, t.id);
  assert.deepEqual(rfi.itemIds, [t.id], 'linking twice keeps one link');
});

test('deleting tasks and jobs removes their links and entries', () => {
  const { b, job, other } = project();
  const a = addItem(b, { jobId: job.id, title: 'A' });
  const c = addItem(b, { jobId: other.id, title: 'C' });
  const e = addLogEntry(b, { jobId: job.id, itemIds: [a.id, c.id] });
  addLogEntry(b, { jobId: other.id, itemIds: [c.id] });
  deleteItem(b, a.id);
  assert.deepEqual(e.itemIds, [c.id]);
  deleteJob(b, other.id);
  assert.deepEqual([b.log.length, b.log[0].itemIds], [1, []]);
  validate(b);
});

test('lookahead groups by week, counts earlier open work in this week and flags late responses', () => {
  const { b, job } = project();
  const late = addItem(b, { jobId: job.id, title: 'Started last week', start: '2026-10-19', finish: '2026-10-30' });
  const ready = addItem(b, { jobId: job.id, title: 'Ready next week', plannedDay: '2026-11-03' });
  const held = addItem(b, { jobId: job.id, title: 'Held next week', start: '2026-11-04', finish: '2026-11-06' });
  addItem(b, { jobId: job.id, title: 'Too far', start: '2026-12-21' });
  addItem(b, { jobId: job.id, title: 'Done', start: '2026-11-02', status: 'done', doneOn: TODAY });
  addItem(b, { jobId: job.id, title: 'No dates' });
  addLogEntry(b, { jobId: job.id, type: 'submittal', subject: 'Door hardware', ball: 'GC', due: '2026-11-10', itemIds: [held.id] });
  const weeks = lookahead(b, TODAY, 3);
  assert.deepEqual(weeks.map(w => w.monday), ['2026-10-26', '2026-11-02', '2026-11-09']);
  assert.deepEqual(weeks[0].rows.map(r => [r.item.title, r.earlier]), [['Started last week', true]]);
  assert.deepEqual(weeks[1].rows.map(r => [r.item.title, r.ready]), [['Held next week', false], ['Ready next week', true]], 'constrained first');
  assert.deepEqual(weeks[1].rows[0].constraints.map(c => [c.entry.number, c.tooLate, c.overdue]), [['SUB-001', true, false]]);
  assert.equal(weeks.flatMap(w => w.rows).length, 3, 'done, undated and beyond-horizon work is left out');
  assert.equal(late.status, 'todo'); assert.equal(ready.kind, 'task');
});

test('ball in court groups open entries by party, most overdue first; parties are suggested', () => {
  const { b, job } = project();
  addLogEntry(b, { jobId: job.id, type: 'rfi', subject: 'Q1', ball: 'MEP engineer', due: '2026-11-05' });
  addLogEntry(b, { jobId: job.id, type: 'rfi', subject: 'Q2', ball: 'Owner', due: '2026-10-20' });
  addLogEntry(b, { jobId: job.id, type: 'rfi', subject: 'Q3', ball: 'Owner', due: '2026-11-20' });
  const cleared = addLogEntry(b, { jobId: job.id, subject: 'Q4', ball: 'GC' });
  patchLogEntry(b, cleared.id, { status: 'cleared' }, TODAY);
  addLogEntry(b, { jobId: job.id, subject: 'Q5' });
  const groups = ballInCourt(b, TODAY);
  assert.deepEqual(groups.map(g => [g.party, g.entries.map(e => e.subject), g.overdue]),
    [['Owner', ['Q2', 'Q3'], 1], ['MEP engineer', ['Q1'], 0], ['No one named', ['Q5'], 0]]);
  assert.ok(ballInCourt(b, TODAY, { showCleared: true }).some(g => g.party === 'GC'));
  assert.deepEqual(parties(b), ['GC', 'Me', 'MEP engineer', 'Owner']);
});

test('PPC counts committed tasks done by Sunday; later additions and late completions do not count', () => {
  const { b, job } = project();
  const monday = '2026-10-19';
  const ids = ['Mon', 'Tue', 'Wed', 'Thu'].map((title, i) => addItem(b, { jobId: job.id, title, plannedDay: `2026-10-${19 + i}` }).id);
  addItem(b, { jobId: job.id, title: 'Milestone', kind: 'milestone', start: '2026-10-23', finish: '2026-10-23', plannedDay: '' });
  assert.equal(commitWeek(b, monday, '2026-10-19').length, 4);
  addItem(b, { jobId: job.id, title: 'Added Wednesday', plannedDay: '2026-10-21' });
  setStatus(b, ids[0], 'done', '2026-10-19');
  setStatus(b, ids[1], 'done', '2026-10-25');
  setStatus(b, ids[2], 'done', '2026-10-27'); // after the week ended
  let w = ppcWeek(b, monday, TODAY);
  assert.deepEqual([w.ppc, w.done.length, w.committed.length, w.closed], [50, 2, 4, true]);
  setMissReason(b, monday, ids[3], 'info');
  setMissReason(b, monday, ids[2], 'estimate');
  deleteItem(b, ids[3]);
  w = ppcWeek(b, monday, TODAY);
  assert.deepEqual([w.ppc, w.committed.length], [67, 3], 'deleted tasks leave the measure');
  assert.equal(ppcWeek(b, '2026-10-26', TODAY), null, 'no commitment, no PPC');
  commitWeek(b, '2026-10-26', TODAY);
  const history = ppcHistory(b, TODAY);
  assert.deepEqual(history.weeks.map(x => [x.monday, x.closed]), [[monday, true], ['2026-10-26', false]]);
  assert.equal(history.average, 67, 'only finished weeks count towards the average');
  assert.deepEqual(history.reasons, { estimate: 1 });
  validate(b);
});

test('older books open with an empty log; dangling links from older apps are dropped; bad values refused', () => {
  const { b, job } = project();
  const t = addItem(b, { jobId: job.id, title: 'Kept' });
  addLogEntry(b, { jobId: job.id, itemIds: [t.id] });
  const raw = JSON.parse(encodeBook(b));
  raw.log[0].itemIds.push('deleted-by-an-older-app');
  raw.log.push({ ...raw.log[0], id: 'orphan', jobId: 'gone' });
  const reopened = decodeBook(JSON.stringify(raw)).book;
  assert.deepEqual([reopened.log.length, reopened.log[0].itemIds], [1, [t.id]]);
  delete raw.log;
  assert.deepEqual(decodeBook(JSON.stringify(raw)).book.log, []);
  const bad = (mutate, pattern) => { const copy = structuredClone(reopened); mutate(copy); assert.throws(() => validate(copy), pattern); };
  bad(c => { c.log[0].type = 'memo'; }, /Invalid constraint log type/);
  bad(c => { c.log[0].status = 'closed'; }, /Invalid constraint log status/);
  bad(c => { c.log[0].due = '2026-02-30'; }, /real date/);
  bad(c => { c.weeks['2026-10-26'] = { capacity: 600, notes: '', misses: { x: 'weather' } }; }, /Invalid reason/);
});

test('log CSV neutralises spreadsheet formulas and lists linked tasks', () => {
  const { b, job } = project();
  const t = addItem(b, { jobId: job.id, title: 'Slab pour' });
  addLogEntry(b, { jobId: job.id, type: 'rfi', subject: '=HYPERLINK("x")', ball: 'GC', due: '2026-10-20', itemIds: [t.id] });
  const csv = logCsv(b, b.log, TODAY);
  assert.ok(csv.startsWith('﻿"Number"'));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"Open","","8","Slab pour"/);
});
