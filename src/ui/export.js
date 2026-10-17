// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// "Export to calendar" dialog: choose what to include, download an .ics file, then import it.
import { h } from './dom.js';
import { ICS_KINDS, buildIcs, calendarEvents } from '../core/ics.js';
import { jobOf } from '../core/query.js';
import { APP_VERSION, notify, store, ui } from './state.js';
import { btn } from './components.js';
import { showModal } from './overlay.js';

const choice = { planned: true, milestones: true, due: false, done: false, focusOnly: false };

export function showCalendarExport() {
  const book = store.book;
  const focusJob = ui.focus ? jobOf(book, ui.focus) : null;
  const options = () => ({
    focus: focusJob && choice.focusOnly ? focusJob.id : '',
    include: { planned: choice.planned, milestones: choice.milestones, due: choice.due },
    done: choice.done,
  });

  const count = h('p', { class: 'export-count', role: 'status' });
  const exportBtn = btn('Download .ics file', () => downloadIcs(options()), { kind: 'primary', iconName: 'save' });
  const refresh = () => {
    const n = calendarEvents(book, options()).length;
    count.textContent = n ? `${n} event${n === 1 ? '' : 's'} will be exported.` : 'Nothing to export with these choices.';
    exportBtn.disabled = !n;
  };
  const box = (key, label, hint = '') => h('label', { class: 'check-row' },
    h('input', { type: 'checkbox', checked: choice[key], onchange: e => { choice[key] = e.target.checked; refresh(); } }),
    h('span', null, label, hint ? h('small', { class: 'muted' }, ` — ${hint}`) : null));

  refresh();
  showModal('Export to calendar', [
    h('p', { class: 'muted' }, 'Creates an .ics file you import into Google Calendar or Outlook. All-day events, shown as free time. One-way: edit plans here and export again.'),
    h('fieldset', { class: 'export-set' }, h('legend', null, 'Include'),
      box('planned', ICS_KINDS.planned, 'the day you intend to work on a task'),
      box('milestones', ICS_KINDS.milestones),
      box('due', ICS_KINDS.due, 'forecast finish of each task'),
      box('done', 'Completed work')),
    focusJob ? h('fieldset', { class: 'export-set' }, h('legend', null, 'Jobs'), box('focusOnly', `Only ${focusJob.title}`)) : null,
    count,
    h('div', { class: 'export-actions' }, exportBtn),
    h('details', { class: 'export-help' }, h('summary', null, 'How to import'),
      h('p', null, h('strong', null, 'Tip: '), 'import into a separate calendar called “Tas-Time”. To refresh cleanly, delete that calendar and import the new file — your own events are never touched, and finished or removed tasks disappear.'),
      h('p', null, h('strong', null, 'Google Calendar: '), 'Settings → Add calendar → Create new calendar (“Tas-Time”). Then Settings → Import & export → Import, choose the file and the Tas-Time calendar.'),
      h('p', null, h('strong', null, 'Outlook (classic): '), 'File → Open & Export → Import/Export → “Import an iCalendar (.ics) file”, then choose “Open as New” to keep it as a separate calendar.'),
      h('p', null, h('strong', null, 'New Outlook / Outlook on the web: '), 'Calendar → Add calendar → Upload from file, then pick or create the calendar to import into.')),
  ]);
}

function downloadIcs(options) {
  const book = store.book;
  const ics = buildIcs(book, options, new Date(), APP_VERSION);
  const name = `${book.name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'planning-book'}-calendar.ics`;
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  notify(`Calendar file downloaded: ${name}. Import it into your calendar.`);
}
