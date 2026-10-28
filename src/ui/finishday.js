// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// "Finish the day": what got done, a decision for each unfinished task, and where you stopped.
// Task moves wait for Finish the day and are one undo step; resume notes save as you type, as in Today.
import { h, autosize } from './dom.js';
import { addDays, fmtDate, fmtLong } from '../core/dates.js';
import { activeItems, jobOf, matchesFocus, matchesPerson, todayList } from '../core/query.js';
import { patchItem, setNote } from '../core/ops.js';
import { act, notify, store, today, ui } from './state.js';
import { btn, jobColor, jobTag, segmented } from './components.js';
import { undo } from './commands.js';
import { showModal } from './overlay.js';
import { workPersonId } from './people.js';

const CHOICES = [['tomorrow', 'Tomorrow'], ['unplan', 'Unplan'], ['leave', 'Leave']];

export function showFinishDay() {
  const book = store.book;
  const day = today();
  const tomorrow = addDays(day, 1);
  const personId = workPersonId();
  const { planned, carried } = todayList(book, day, ui.focus, personId);
  const open = [...planned.filter(t => t.status !== 'done'), ...carried];
  const done = activeItems(book).filter(t => t.doneOn === day && matchesFocus(t, ui.focus) && matchesPerson(t, personId));
  const choice = new Map(open.map(t => [t.id, 'tomorrow']));

  const rows = h('div', { class: 'finish-list' });
  const drawRows = () => rows.replaceChildren(...open.map(t => h('div', { class: 'finish-row', style: { '--job': jobColor(jobOf(book, t.jobId)) } },
    h('div', { class: 'finish-title' }, h('strong', null, t.title),
      h('span', { class: 'muted' }, jobOf(book, t.jobId).title, t.plannedDay < day ? ` · planned ${fmtDate(t.plannedDay)}` : '')),
    segmented(CHOICES, choice.get(t.id), value => { choice.set(t.id, value); drawRows(); }, `What to do with ${t.title}`))));
  drawRows();

  const jobIds = [...new Set([...planned, ...done].map(t => t.jobId))];
  const notes = jobIds.map(id => jobOf(store.book, id)).filter(j => j && !j.archived).map(job => {
    const area = h('textarea', {
      class: 'resume-text', rows: 2, 'aria-label': `Resume note for ${job.title}`,
      placeholder: 'Where you stopped, what is unresolved, the next concrete step…',
      oninput: e => { autosize(e.target); act('Edit resume note', d => setNote(d, job.id, 'restart', e.target.value), { key: `restart:${job.id}`, quiet: true }); },
    });
    area.value = job.notes.restart;
    requestAnimationFrame(() => autosize(area));
    return h('div', { class: 'resume', style: { '--job': jobColor(job) } }, jobTag(job, { full: true }), area);
  });

  const finish = () => {
    const moved = open.filter(t => choice.get(t.id) === 'tomorrow');
    const unplanned = open.filter(t => choice.get(t.id) === 'unplan');
    dialog.close();
    if (!moved.length && !unplanned.length) return;
    const ok = act('Finish the day', d => {
      for (const t of moved) patchItem(d, t.id, { plannedDay: tomorrow }, day);
      for (const t of unplanned) patchItem(d, t.id, { plannedDay: '' }, day);
      return true;
    });
    if (ok) {
      const parts = [moved.length ? `${moved.length} moved to tomorrow` : '', unplanned.length ? `${unplanned.length} unplanned` : ''].filter(Boolean);
      notify(`Day finished: ${parts.join(', ')}.`, { action: { label: 'Undo', run: undo } });
    }
  };

  const dialog = showModal(`Finish the day · ${fmtLong(day)}`, [
    h('section', { class: 'finish-section' },
      h('h3', null, done.length ? `Done today · ${done.length}` : 'Done today'),
      done.length ? h('ul', { class: 'finish-done' }, done.map(t => h('li', null, t.title))) : h('p', { class: 'muted' }, 'Nothing ticked off today.')),
    h('section', { class: 'finish-section' },
      h('h3', null, open.length ? `Still open · ${open.length}` : 'Still open'),
      open.length
        ? [h('p', { class: 'muted' }, `Tomorrow plans it for ${fmtDate(tomorrow)}. Unplan returns it to the unplanned list in Week. Leave keeps it where it is. Forecast dates never change.`), rows]
        : h('p', { class: 'muted' }, 'Everything planned for today is done.')),
    notes.length ? h('section', { class: 'finish-section' }, h('h3', null, 'Where you stopped'), notes) : null,
    h('div', { class: 'finish-actions' },
      btn('Cancel', () => dialog.close(), { kind: 'ghost' }),
      btn('Finish the day', finish, { kind: 'primary', iconName: 'check', attrs: { id: 'finish-day-apply' } })),
  ]);
  return dialog;
}
