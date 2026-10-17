// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Notes: one notebook per job, in a few fixed pages. Plain text, saved as you type.
import { h, autosize } from '../dom.js';
import { NOTE_PAGES } from '../../core/model.js';
import { liveJobs } from '../../core/query.js';
import { setNote } from '../../core/ops.js';
import { act, rerender, store, today, ui } from '../state.js';
import { btn, jobColor } from '../components.js';
import { welcome } from './welcome.js';

const HINTS = {
  restart: 'Where you stopped.\nWhat is unresolved.\nThe next concrete step.',
  scope: 'What is in and out of scope, acceptance criteria, assumptions…',
  decisions: 'Date — decision — reason — evidence — who agreed',
  working: 'Brain dump, mind-map branches, fishbone causes, 5 Whys, pre-mortem stories — anything from breaking the goal down. Also observations and open questions…',
  references: 'Zotero links, citation keys, document references (kept as plain text)…',
  lessons: 'What went well?\nWhat went badly?\nWhat surprised me?\nWhat will I do differently next time?',
};

export function renderNotes() {
  const book = store.book;
  const jobs = liveJobs(book);
  if (!jobs.length) return welcome();
  const job = jobs.find(j => j.id === ui.focus) || jobs.find(j => j.id === ui.notesJob) || jobs[0];
  const page = ui.notesPage;

  const area = h('textarea', {
    id: 'note-text', class: 'note-text', placeholder: HINTS[page], 'aria-label': `${job.title}: ${NOTE_PAGES.find(p => p[0] === page)[1]}`,
    oninput: e => { autosize(e.target); act('Edit note', d => setNote(d, job.id, page, e.target.value), { key: `note:${job.id}:${page}`, quiet: true }); },
  });
  area.value = job.notes[page];
  requestAnimationFrame(() => autosize(area));

  const insertDate = () => {
    const prefix = `${today()} — `;
    const v = area.value;
    const at = area.selectionStart ?? v.length;
    const lineStart = at === 0 || v[at - 1] === '\n';
    area.setRangeText(`${lineStart ? '' : '\n'}${prefix}`, at, at, 'end');
    area.dispatchEvent(new Event('input'));
    area.focus();
  };

  return h('div', { class: 'view notes' },
    h('header', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, 'Notebook'), h('h1', null, job.title || 'Untitled job'),
      job.outcome ? h('p', { class: 'sub' }, job.outcome) : null)),
    h('div', { class: 'notes-layout' },
      h('nav', { class: 'notes-jobs', 'aria-label': 'Jobs' }, jobs.map(j => h('button', {
        class: ['notes-job', j.id === job.id && 'on'], style: { '--job': jobColor(j) }, 'aria-current': j.id === job.id ? 'true' : null,
        onclick: () => { ui.notesJob = j.id; if (ui.focus) ui.focus = j.id; rerender(); },
      }, h('span', { class: 'dot' }), h('span', null, j.title), filled(j) ? h('span', { class: 'muted' }, `${filled(j)}/${NOTE_PAGES.length}`) : null))),
      h('div', { class: 'paper' },
        h('div', { class: 'tabs', role: 'tablist' }, NOTE_PAGES.map(([key, label]) => h('button', {
          role: 'tab', 'aria-selected': String(key === page), class: key === page ? 'on' : null,
          onclick: () => { ui.notesPage = key; rerender(); },
        }, label, job.notes[key].trim() ? h('span', { class: 'tab-dot', 'aria-label': 'has notes' }) : null))),
        page === 'decisions' ? h('div', { class: 'paper-tools' }, btn('Insert today’s date', insertDate, { kind: 'sm ghost', iconName: 'clock' })) : null,
        area,
        page === 'lessons' ? earlierLessons(book, job) : null)));
}

/** Lessons from every other job, archived ones included, so the next plan starts smarter. */
function earlierLessons(book, current) {
  const others = book.jobs.filter(j => j.id !== current.id && j.notes.lessons.trim());
  if (!others.length) return null;
  return h('details', { class: 'earlier-lessons' }, h('summary', null, `Lessons from ${others.length} earlier job${others.length === 1 ? '' : 's'}`),
    others.map(j => h('div', { class: 'earlier-lesson', style: { '--job': jobColor(j) } },
      h('strong', null, j.title || 'Untitled job', j.archived ? h('span', { class: 'muted' }, ' · archived') : null),
      h('p', null, j.notes.lessons.trim()))));
}

function filled(job) { return NOTE_PAGES.filter(([k]) => job.notes[k].trim()).length; }
