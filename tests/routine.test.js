// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Repeating tasks, checklists and the backup retention rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths } from '../src/core/dates.js';
import { decodeBook, encodeBook, newBook, validate } from '../src/core/model.js';
import { addItem, addJob, addStep, duplicateItem, moveStep, patchItem, patchStep, removeStep, setStatus } from '../src/core/ops.js';
import { fmtRepeat } from '../src/core/parse.js';
import { createStore } from '../src/core/store.js';
import { BACKUP_GAP_MS, withBackup } from '../src/core/backups.js';

const TODAY = '2026-10-27'; // a Tuesday

function book1() {
  const b = newBook('Routine');
  const job = addJob(b, { title: 'Admin' });
  return { b, job };
}

test('months clamp to the last day and keep their day afterwards', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-01-31', 2), '2026-03-31', 'stepping from the original date, not the clamped one');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(fmtRepeat({ every: 1, unit: 'week' }), 'Every week');
  assert.equal(fmtRepeat({ every: 3, unit: 'day' }), 'Every 3 days');
});

test('completing a repeating task creates the next one, once, from its own schedule', () => {
  const { b, job } = book1();
  const t = addItem(b, { jobId: job.id, title: 'Supervisor meeting', plannedDay: TODAY, start: TODAY, finish: TODAY, effort: 60, repeat: { every: 1, unit: 'week' } });
  addStep(b, t.id, 'Send agenda'); patchStep(b, t.id, t.checklist[0].id, { done: true });
  setStatus(b, t.id, 'done', TODAY);
  validate(b);
  assert.equal(b.items.length, 2);
  const [done, next] = b.items;
  assert.equal(done.repeat, null, 'the series moves to the new occurrence');
  assert.equal(done.status, 'done');
  assert.deepEqual([next.status, next.plannedDay, next.start, next.finish, next.effort], ['todo', '2026-11-03', '2026-11-03', '2026-11-03', 60]);
  assert.deepEqual(next.repeat, { every: 1, unit: 'week' });
  assert.deepEqual(next.checklist.map(c => [c.text, c.done]), [['Send agenda', false]]);
  assert.notEqual(next.checklist[0].id, done.checklist[0].id);
  setStatus(b, done.id, 'todo', TODAY); setStatus(b, done.id, 'done', TODAY);
  assert.equal(b.items.length, 2, 'reopening and completing again never repeats twice');
});

test('late completion skips occurrences already past; undated repeats get a work day', () => {
  const { b, job } = book1();
  const rent = addItem(b, { jobId: job.id, title: 'Rent', start: '2026-01-31', finish: '2026-01-31', repeat: { every: 1, unit: 'month' } });
  setStatus(b, rent.id, 'done', '2026-04-15');
  assert.deepEqual([b.items[1].start, b.items[1].finish], ['2026-04-30', '2026-04-30']);
  const early = addItem(b, { jobId: job.id, title: 'Timesheet', plannedDay: '2026-10-30', repeat: { every: 1, unit: 'week' } });
  setStatus(b, early.id, 'done', TODAY);
  assert.equal(b.items.find(x => x.id !== early.id && x.title === 'Timesheet').plannedDay, '2026-11-06', 'finishing early keeps the schedule');
  const loose = addItem(b, { jobId: job.id, title: 'Water plants', repeat: { every: 3, unit: 'day' } });
  setStatus(b, loose.id, 'done', TODAY);
  const after = b.items.find(x => x.id !== loose.id && x.title === 'Water plants');
  assert.deepEqual([after.plannedDay, after.start, after.finish], ['2026-10-30', '', '']);
});

test('a blocked repeating task cannot complete and creates nothing; undo removes the next one too', () => {
  const { b, job } = book1();
  const t = addItem(b, { jobId: job.id, title: 'Report', plannedDay: TODAY, blocker: 'Waiting for data', repeat: { every: 1, unit: 'week' } });
  assert.throws(() => setStatus(b, t.id, 'done', TODAY), /Can’t complete yet/);
  assert.equal(b.items.length, 1);
  const store = createStore(b);
  store.commit('Clear', d => patchItem(d, t.id, { blocker: '' }, TODAY));
  store.commit('Complete', d => setStatus(d, t.id, 'done', TODAY));
  assert.equal(store.book.items.length, 2);
  store.undo();
  assert.equal(store.book.items.length, 1);
  assert.deepEqual(store.book.items[0].repeat, { every: 1, unit: 'week' });
});

test('checklist steps add, edit, reorder and remove; duplicates copy them', () => {
  const { b, job } = book1();
  const t = addItem(b, { jobId: job.id, title: 'Chapter' });
  const a = addStep(b, t.id, '  Draft  '); const c = addStep(b, t.id, 'Figures');
  moveStep(b, t.id, c.id, -1); moveStep(b, t.id, c.id, -1);
  assert.deepEqual(t.checklist.map(s => s.text), ['Figures', 'Draft']);
  patchStep(b, t.id, a.id, { done: true, text: 'Draft v1' });
  removeStep(b, t.id, c.id);
  assert.deepEqual(t.checklist.map(s => [s.text, s.done]), [['Draft v1', true]]);
  assert.equal(duplicateItem(b, t.id).checklist.length, 1);
  validate(b);
});

test('books saved before 3.3 open with no repeats or steps; malformed values are refused', () => {
  const { b, job } = book1();
  addItem(b, { jobId: job.id, title: 'Old task' });
  const raw = JSON.parse(encodeBook(b));
  delete raw.items[0].repeat; delete raw.items[0].checklist;
  const { book, upgradedFrom } = decodeBook(JSON.stringify(raw));
  assert.equal(upgradedFrom, null, 'still format 4: no upgrade step');
  assert.deepEqual([book.items[0].repeat, book.items[0].checklist], [null, []]);
  const bad = (patch, pattern) => {
    const copy = structuredClone(book); Object.assign(copy.items[0], patch);
    assert.throws(() => validate(copy), pattern);
  };
  bad({ repeat: { every: 0, unit: 'week' } }, /every 1 to 99/);
  bad({ repeat: { every: 1, unit: 'year' } }, /invalid repeat/);
  bad({ checklist: [{ id: 'a', text: 'x', done: 'yes' }] }, /malformed/);
  bad({ checklist: [{ id: 'a', text: 'x', done: false }, { id: 'a', text: 'y', done: false }] }, /unique/);
});

test('backups: newest first, at most one per gap unless forced, never a duplicate, ten kept', () => {
  const at = min => new Date(Date.UTC(2026, 9, 27, 9, 0) + min * 60000).toISOString();
  const entry = (min, raw) => ({ at: at(min), raw });
  let list = withBackup([], entry(0, 'a'));
  assert.deepEqual(list.map(e => e.raw), ['a']);
  assert.equal(withBackup(list, entry(5, 'b')), null, 'too soon');
  assert.deepEqual(withBackup(list, entry(5, 'b'), { force: true }).map(e => e.raw), ['b', 'a']);
  assert.equal(withBackup(list, entry(60, 'a'), { force: true }), null, 'unchanged book');
  for (let i = 1; i <= 12; i++) list = withBackup(list, entry(i * BACKUP_GAP_MS / 60000, `v${i}`));
  assert.equal(list.length, 10);
  assert.deepEqual([list[0].raw, list.at(-1).raw], ['v12', 'v3']);
});
