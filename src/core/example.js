// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Synthetic example book, dated relative to today so it always looks current.
import { addDays, mondayOf } from './dates.js';
import { newBook } from './model.js';
import { addItem, addJob, captureBaseline } from './ops.js';

export function exampleBook(today) {
  const book = newBook('Example planning book');
  const d = n => addDays(today, n);
  const phd = addJob(book, { title: 'Methodology chapter', code: 'PHD', outcome: 'A justified method choice and a supervisor-reviewed draft.', color: 'forest' },
    ['Evidence review', 'Method selection', 'Draft & review']);
  const home = addJob(book, { title: 'Kitchen refit', code: 'HOME', outcome: 'Agreed scope, three comparable quotes, contractor booked.', color: 'blue' },
    ['Scope', 'Quotes', 'Works']);
  const [p1, p2, p3] = book.phases.filter(p => p.jobId === phd.id);
  const [h1, h2, h3] = book.phases.filter(p => p.jobId === home.id);
  phd.notes.restart = 'Comparing assumptions behind methods A and B.\nNext: write up the limitations table before drafting.';
  phd.notes.scope = 'Chapter 3 only. Out of scope: pilot study results.';
  phd.notes.decisions = `${d(-6)} — Dropped method C: needs data we cannot collect in time.`;
  home.notes.restart = 'Waiting on the second quote. Chase on Monday if nothing arrives.';

  const read = addItem(book, { jobId: phd.id, phaseId: p1.id, title: 'Read core method papers', start: d(-10), finish: d(-3), effort: 0, status: 'done', doneOn: d(-3) });
  const compare = addItem(book, { jobId: phd.id, phaseId: p1.id, title: 'Compare methods A and B', start: d(-2), finish: d(3), effort: 150, status: 'doing', plannedDay: today, deps: [read.id] });
  const justify = addItem(book, { jobId: phd.id, phaseId: p2.id, title: 'Write method justification', start: d(4), finish: d(11), effort: 240, deps: [compare.id] });
  const limits = addItem(book, { jobId: phd.id, phaseId: p2.id, title: 'Limitations table', start: d(4), finish: d(7), effort: 90, plannedDay: d(1), deps: [compare.id] });
  const draft = addItem(book, { jobId: phd.id, phaseId: p3.id, title: 'Full chapter draft', start: d(12), finish: d(24), effort: 600, deps: [justify.id, limits.id] });
  addItem(book, { jobId: phd.id, phaseId: p3.id, title: 'Supervisor accepts draft', kind: 'milestone', finish: d(31), deps: [draft.id], notes: 'Acceptance: supervisor confirms the method and its limitations are addressed.' });

  addItem(book, { jobId: home.id, phaseId: h1.id, title: 'Measure and photograph kitchen', start: d(-4), finish: d(-1), effort: 60, plannedDay: d(-1) });
  const brief = addItem(book, { jobId: home.id, phaseId: h1.id, title: 'Write scope brief', start: d(0), finish: d(2), effort: 45, plannedDay: today, deps: [] });
  const quotes = addItem(book, { jobId: home.id, phaseId: h2.id, title: 'Get three quotes', start: d(3), finish: d(17), effort: 120, deps: [brief.id], blocker: '' });
  addItem(book, { jobId: home.id, phaseId: h2.id, title: 'Second contractor site visit', start: d(5), finish: d(5), effort: 60, blocker: 'Contractor to confirm a date' });
  const choose = addItem(book, { jobId: home.id, phaseId: h2.id, title: 'Contractor chosen', kind: 'milestone', finish: d(20), deps: [quotes.id] });
  addItem(book, { jobId: home.id, phaseId: h3.id, title: 'Works on site', start: d(35), finish: d(48), effort: 120, deps: [choose.id] });

  captureBaseline(book, d(-7));
  // Show some slippage against the baseline.
  justify.baseline = { start: d(2), finish: d(9) };
  book.weeks[mondayOf(today)] = { capacity: 8 * 60, notes: 'Finish the comparison. Keep Friday evening free.' };
  return book;
}
