// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { newBook } from '../src/core/model.js';
import { addJob, addItem, patchJob } from '../src/core/ops.js';
import { todayList, weekLoad, readyToPlan, upcomingMilestones, liveItems, planRows } from '../src/core/query.js';
import { parseQuickAdd } from '../src/core/parse.js';
import { quickAdd, createTask } from '../src/ui/commands.js';
import { store, ui } from '../src/ui/state.js';

test('held and completed jobs leave daily planning without losing their tasks', () => {
  const b = newBook();
  const j = addJob(b, { title: 'Kitchen' }, ['Preparation']);
  addItem(b, { jobId: j.id, title: 'Measure', plannedDay: '2026-10-26', effort: 120 });
  addItem(b, { jobId: j.id, title: 'Order' });
  addItem(b, { jobId: j.id, title: 'Sign off', kind: 'milestone', start: '2026-10-27', finish: '2026-10-27' });
  for (const status of ['hold', 'done']) {
    patchJob(b, j.id, { status });
    assert.equal(todayList(b, '2026-10-26').planned.length, 0);
    assert.equal(weekLoad(b, '2026-10-26').planned, 0);
    assert.equal(readyToPlan(b, '2026-10-26').length, 0);
    assert.equal(upcomingMilestones(b, '2026-10-26').length, 0);
    assert.equal(liveItems(b).length, 3);
    assert.equal(planRows(b).filter(r => r.type === 'item').length, 3);
  }
  patchJob(b, j.id, { status: 'active' });
  assert.equal(todayList(b, '2026-10-26').planned.length, 1);
  assert.equal(weekLoad(b, '2026-10-26').planned, 120);
  assert.equal(readyToPlan(b, '2026-10-26').length, 1);
});

test('ambiguous job abbreviations require a specific destination', () => {
  const b = newBook();
  const a = addJob(b, { title: 'Alpha', code: 'ALPHA' });
  addJob(b, { title: 'Alpine', code: 'ALPINE' });
  assert.equal(parseQuickAdd('Measure #al', b.jobs).errors.length, 1);
  assert.equal(parseQuickAdd('Measure #alpha', b.jobs).jobId, a.id);
});

test('task creation keeps a phase for the same job and clears it for another job', () => {
  const b = newBook();
  const j = addJob(b, { title: 'Kitchen', code: 'HOME' }, ['Preparation']);
  const other = addJob(b, { title: 'Study', code: 'STUDY' });
  store.replace(b);
  ui.focus = '';
  ui.quickJob = j.id;
  const defaults = { jobId: j.id, phaseId: b.phases[0].id };
  assert.equal(quickAdd('Measure kitchen #home', defaults).phaseId, b.phases[0].id);
  const moved = quickAdd('Read chapter #study', defaults);
  assert.equal(moved.jobId, other.id);
  assert.equal(moved.phaseId, '');
  const t = createTask(j.id, b.phases[0].id, '2026-10-30');
  assert.equal(t.plannedDay, '2026-10-30');
  assert.equal(t.phaseId, b.phases[0].id);
  assert.equal(ui.drawer.id, t.id);
  assert.equal(ui.drawer.focusField, 'title');
});
