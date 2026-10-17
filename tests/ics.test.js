// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { buildIcs, calendarEvents, escapeText, fold } from '../src/core/ics.js';
import { exampleBook } from '../src/core/example.js';
import { newBook } from '../src/core/model.js';
import { addItem, addJob } from '../src/core/ops.js';

const TODAY = '2026-10-17';
const NOW = new Date('2026-10-17T09:30:00Z');
const bytes = s => new TextEncoder().encode(s).length;

test('event selection follows the chosen kinds, focus and done filter', () => {
  const book = exampleBook(TODAY);
  const kinds = opts => calendarEvents(book, opts).map(e => e.kind);
  const def = kinds();
  assert.ok(def.includes('plan') && def.includes('milestone') && !def.includes('due'), 'planned + milestones by default');
  assert.ok(kinds({ include: { due: true } }).every(k => k === 'due'));
  const phd = book.jobs.find(j => j.code === 'PHD');
  assert.ok(calendarEvents(book, { focus: phd.id, include: { planned: true, milestones: true, due: true } }).every(e => e.job.id === phd.id));
  const doneItem = book.items.find(t => t.status === 'done');
  doneItem.plannedDay = TODAY;
  assert.ok(!calendarEvents(book).some(e => e.item === doneItem), 'done work excluded by default');
  assert.ok(calendarEvents(book, { done: true }).some(e => e.item === doneItem));
});

test('all-day events with stable UIDs, CRLF lines and no line over 75 octets', () => {
  const book = exampleBook(TODAY);
  const a = buildIcs(book, {}, NOW, '3.0.0');
  const b = buildIcs(book, {}, new Date(NOW.getTime() + 3600_000), '3.0.0');
  assert.match(a, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.ok(a.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(a), 'every line ends in CRLF');
  for (const line of a.split('\r\n')) assert.ok(bytes(line) <= 75, `too long: ${line}`);
  const uids = s => [...s.matchAll(/^UID:(.+)$/gm)].map(m => m[1]);
  assert.deepEqual(uids(a), uids(b), 'UIDs are stable across exports');
  assert.equal(new Set(uids(a)).size, uids(a).length, 'UIDs are unique');
  assert.ok(Number(b.match(/SEQUENCE:(\d+)/)[1]) > Number(a.match(/SEQUENCE:(\d+)/)[1]), 'later export has a higher SEQUENCE');
  assert.match(a, /DTSTART;VALUE=DATE:20261017\r\nDTEND;VALUE=DATE:20261018/);
  assert.match(a, /DTSTAMP:20261017T093000Z/);
  assert.match(a, /TRANSP:TRANSPARENT/);
});

test('text is escaped and long Unicode lines fold without splitting characters', () => {
  assert.equal(escapeText('a,b;c\\d\nnext'), 'a\\,b\\;c\\\\d\\nnext');
  const long = `SUMMARY:${'Überprüfung der Methodik — 測試 '.repeat(6)}`;
  const folded = fold(long);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(bytes(l) <= 75);
  assert.equal(lines.map((l, i) => (i ? l.slice(1) : l)).join(''), long, 'unfolding restores the original');
});

test('writes a fixture with awkward content for the independent parser check', () => {
  const book = newBook('Parser fixture');
  const job = addJob(book, { title: 'Kitchen, bath; & more', code: 'HOME' });
  addItem(book, { jobId: job.id, title: 'Ask about tiles; colours, sizes \\ prices', plannedDay: '2026-10-19', effort: 90, notes: 'Line one\nLine two — with “quotes”, 測試 and émojis ✅'.repeat(5) });
  addItem(book, { jobId: job.id, title: 'Contractor chosen', kind: 'milestone', finish: '2026-12-31' });
  const ics = buildIcs(book, { include: { planned: true, milestones: true, due: true } }, NOW, '3.0.0');
  if (process.env.ICS_FIXTURE) writeFileSync(process.env.ICS_FIXTURE, ics);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /DTEND;VALUE=DATE:20270101/, 'year rollover');
});
