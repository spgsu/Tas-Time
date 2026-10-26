// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBook, encodeBook, newBook, validate } from '../src/core/model.js';
import { addItem, addJob, addPerson, duplicateItem, patchItem, patchPerson, setCapacity, setWeekNotes } from '../src/core/ops.js';
import { personCapacity, personName, todayList, weekLoad } from '../src/core/query.js';
import { assignmentGroups, assignmentItems, assignmentsCsv } from '../src/core/assignments.js';
import { createStore } from '../src/core/store.js';

const DAY = '2026-10-26';
function teamBook() {
  const b = newBook();
  const david = addPerson(b, 'David');
  const kitchen = addJob(b, { title: 'Kitchen' });
  const office = addJob(b, { title: 'Office' });
  const mine = addItem(b, { jobId: kitchen.id, title: 'My task', effort: 60, plannedDay: DAY });
  const his = addItem(b, { jobId: kitchen.id, title: 'Gather scope', assigneeId: david.id, effort: 180, plannedDay: DAY, notes: 'Confirm quantities' });
  addItem(b, { jobId: office.id, title: 'Quality check', assigneeId: david.id, effort: 120, finish: '2026-10-25', blocker: 'Need drawings' });
  const unassigned = addItem(b, { jobId: office.id, title: 'Unassigned', assigneeId: '', effort: 30, plannedDay: DAY });
  return { b, david, kitchen, office, mine, his, unassigned };
}

test('person assignments retain stable identity through rename, duplicate, save and undo', () => {
  const { b, david, his } = teamBook();
  const copy = duplicateItem(b, his.id);
  assert.equal(copy.assigneeId, david.id);
  patchPerson(b, david.id, { name: 'David Smith' });
  assert.equal(personName(b, his.assigneeId), 'David Smith');
  assert.equal(decodeBook(encodeBook(b)).book.items.find(t => t.id === his.id).assigneeId, david.id);
  const s = createStore(b);
  s.commit('Unassign', d => patchItem(d, his.id, { assigneeId: '' }, DAY));
  assert.equal(s.book.items.find(t => t.id === his.id).assigneeId, '');
  s.undo();
  assert.equal(s.book.items.find(t => t.id === his.id).assigneeId, david.id);
});

test('person validation rejects dangling assignments, duplicate names and invalid capacities', () => {
  const { b, david, his } = teamBook();
  his.assigneeId = 'missing';
  assert.throws(() => validate(b), /assignee/);
  his.assigneeId = david.id;
  patchPerson(b, david.id, { name: ' me ' });
  assert.throws(() => validate(b), /unique/);
  patchPerson(b, david.id, { name: 'David', capacity: 10081 });
  assert.throws(() => validate(b), /capacity/);
  patchPerson(b, david.id, { capacity: 600 });
  b.weeks[DAY] = { capacity: 600, notes: '', people: { missing: 60 } };
  assert.throws(() => validate(b), /missing person/);
});

test('version 3 migration preserves personal work, notes, contacts and weekly capacity', () => {
  const { b, his } = teamBook();
  b.version = 3;
  delete b.people; delete b.selfId;
  for (const t of b.items) delete t.assigneeId;
  his.owner = 'David / supplier';
  b.weeks[DAY] = { capacity: 480, notes: 'Finish estimate' };
  const { book, upgradedFrom } = decodeBook(JSON.stringify(b));
  assert.equal(upgradedFrom, 3);
  assert.equal(book.version, 4);
  assert.equal(book.people.length, 1);
  assert.ok(book.items.every(t => t.assigneeId === book.selfId));
  assert.equal(book.items.find(t => t.id === his.id).owner, 'David / supplier');
  assert.equal(book.items.find(t => t.id === his.id).notes, 'Confirm quantities');
  assert.equal(personCapacity(book, DAY, book.selfId), 480);
  assert.equal(book.weeks[DAY].notes, 'Finish estimate');
});

test('David’s work and weekly capacity stay separate from My work and unassigned tasks', () => {
  const { b, david } = teamBook();
  setCapacity(b, DAY, 240, david.id);
  setCapacity(b, DAY, 90, b.selfId);
  assert.equal(personCapacity(b, DAY, david.id), 240);
  assert.equal(personCapacity(b, DAY, b.selfId), 90);
  assert.equal(personCapacity(b, DAY, 'all'), 330);
  assert.equal(weekLoad(b, DAY, '', david.id).planned, 180);
  assert.equal(weekLoad(b, DAY, '', b.selfId).planned, 60);
  assert.equal(weekLoad(b, DAY, '', 'unassigned').planned, 30);
  assert.equal(todayList(b, DAY, '', david.id).planned[0].title, 'Gather scope');
  assert.equal(todayList(b, DAY, '', b.selfId).planned[0].title, 'My task');
  assert.equal(personCapacity(b, '2026-11-02', david.id), 600, 'weekly overrides do not change defaults');
});

test('assignment reports combine person, job, status, week, notes and paused-job filters', () => {
  const { b, david, office, his } = teamBook();
  const opts = { person: david.id };
  assert.equal(assignmentItems(b, DAY, opts).length, 2);
  assert.equal(assignmentItems(b, DAY, { ...opts, status: 'blocked' })[0].title, 'Quality check');
  assert.equal(assignmentItems(b, DAY, { ...opts, status: 'late' }).length, 1);
  assert.equal(assignmentItems(b, DAY, { ...opts, period: 'week' })[0].id, his.id);
  assert.equal(assignmentItems(b, DAY, { ...opts, search: 'quantities' })[0].id, his.id);
  assert.equal(assignmentItems(b, DAY, { person: 'unassigned' }).length, 1);
  office.status = 'hold';
  assert.equal(assignmentItems(b, DAY, opts).length, 1);
  assert.equal(assignmentItems(b, DAY, { ...opts, paused: true, job: office.id }).length, 1);
  office.archived = true;
  assert.equal(assignmentItems(b, DAY, { ...opts, paused: true }).length, 1);
  assert.equal(assignmentGroups(b, [his], 'person', DAY)[0][0], 'David');
});

test('shared week notes do not override a person’s default availability', () => {
  const { b, david } = teamBook();
  patchPerson(b, b.selfId, { capacity: 1200 });
  setWeekNotes(b, DAY, 'Shared intent', 600);
  assert.equal(personCapacity(b, DAY, b.selfId), 1200);
  patchPerson(b, david.id, { capacity: 240 });
  assert.equal(personCapacity(b, DAY, david.id), 240);
  setCapacity(b, DAY, 90, david.id);
  patchPerson(b, david.id, { capacity: 300 });
  assert.equal(personCapacity(b, DAY, david.id), 90, 'explicit weekly override survives default changes');
});

test('CSV exports only selected assignments and protects formula-like text and multiline notes', () => {
  const { b, david, his } = teamBook();
  his.title = '=SUM(A1:A2)'; his.notes = 'First line\n"Second", line';
  const csv = assignmentsCsv(b, assignmentItems(b, DAY, { person: david.id, period: 'week' }), DAY);
  assert.ok(csv.startsWith('\uFEFF"Assignee"'));
  assert.ok(csv.includes('"\'=SUM(A1:A2)"'));
  assert.ok(csv.includes('"First line\n""Second"", line"'));
  assert.ok(!csv.includes('My task'));
  assert.ok(csv.includes('"David"'));
});
