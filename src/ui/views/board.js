// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Board: status at a glance. "Blocked" is derived from constraints and prerequisites,
// so dropping a card there asks for the reason instead of setting a status.
import { h } from '../dom.js';
import { addDays } from '../../core/dates.js';
import { fmtEffort } from '../../core/parse.js';
import { blockers, boardColumn, byUrgency, isBlocked, jobOf, liveItems, liveJobs, phaseTitle, waitingOn } from '../../core/query.js';
import { patchItem } from '../../core/ops.js';
import { STATUS } from '../../core/model.js';
import { act, openDrawer, rerender, store, today, ui, notify } from '../state.js';
import { btn, dueChip, jobColor, jobTag } from '../components.js';
import { makeDraggable, makeDropZone } from '../dnd.js';
import { welcome } from './welcome.js';

const COLUMNS = [['todo', 'To do'], ['doing', 'Doing'], ['blocked', 'Blocked'], ['done', 'Done']];
const DONE_WINDOW = 14;

function moveTo(id, column) {
  const t = store.book.items.find(x => x.id === id);
  if (!t || boardColumn(store.book, t, today()) === column) return;
  if (column === 'blocked') { openDrawer('item', id, 'blocker'); notify('Record what this is waiting for.'); return; }
  const reasons = blockers(store.book, t);
  if (reasons.length && column !== 'todo') {
    notify(`Still blocked: ${reasons.join('; ')}. Clear it in the task first.`, { kind: 'warn', action: { label: 'Open', run: () => openDrawer('item', id, 'blocker') } });
    return;
  }
  act(`Move to ${STATUS[column]}`, d => patchItem(d, id, { status: column }, today()));
}

export function renderBoard() {
  const book = store.book;
  if (!liveJobs(book).length) return welcome();
  const items = liveItems(book).filter(t => !ui.focus || t.jobId === ui.focus);
  const cutoff = addDays(today(), -DONE_WINDOW);
  const cols = COLUMNS.map(([key, label]) => {
    let list = items.filter(t => boardColumn(book, t, today()) === key).sort(byUrgency);
    let hidden = 0;
    if (key === 'done' && !ui.boardAllDone) {
      const recent = list.filter(t => !t.doneOn || t.doneOn >= cutoff);
      hidden = list.length - recent.length; list = recent;
    }
    const col = h('section', { class: ['col', `col-${key}`], 'aria-label': label },
      h('header', null, h('h2', null, label), h('span', { class: 'count' }, String(list.length + hidden))),
      h('div', { class: 'col-cards' }, list.length ? list.map(boardCard) : h('p', { class: 'col-empty' }, key === 'blocked' ? 'Nothing is blocked.' : 'No cards')),
      hidden ? btn(`Show ${hidden} older`, () => { ui.boardAllDone = true; rerender(); }, { kind: 'ghost sm' }) : null);
    return makeDropZone(col, id => moveTo(id, key));
  });
  return h('div', { class: 'view board' },
    h('header', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, 'Status'), h('h1', null, 'Board'),
      h('p', { class: 'sub' }, 'Drag cards between columns. A task is Blocked when it has a written constraint, or its prerequisites are unfinished once it is due to start.'))),
    h('div', { class: 'cols' }, cols));
}

function boardCard(t) {
  const book = store.book;
  const job = jobOf(book, t.jobId);
  const blocked = isBlocked(book, t, today());
  const waiting = blocked ? [] : waitingOn(book, t);
  const el = h('article', { class: ['bcard', t.kind === 'milestone' && 'is-ms'], style: { '--job': jobColor(job) }, 'data-item': t.id },
    h('button', { class: 'bcard-title', onclick: () => openDrawer('item', t.id) }, t.kind === 'milestone' ? '◆ ' : '', t.title),
    h('div', { class: 'bcard-meta' }, jobTag(job), h('span', { class: 'muted' }, phaseTitle(book, t.phaseId))),
    blocked ? h('p', { class: 'bcard-why' }, blockers(book, t).join(' · ')) : null,
    waiting.length ? h('p', { class: 'bcard-after' }, `After ${waiting.map(w => `“${w.title}”`).join(', ')}`) : null,
    h('div', { class: 'bcard-foot' }, dueChip(t), t.effort && t.status !== 'done' ? h('span', { class: 'effort' }, fmtEffort(t.effort)) : null, t.owner ? h('span', { class: 'muted' }, t.owner) : null));
  return makeDraggable(el, t.id);
}
