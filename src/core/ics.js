// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// One-way export of planned work, milestones and due dates as an iCalendar (.ics) file
// (RFC 5545). All events are all-day and marked "free" so they never block meeting time.
import { addDays } from './dates.js';
import { fmtEffort } from './parse.js';
import { isHidden, jobOf, phaseTitle } from './query.js';

export const ICS_KINDS = {
  planned: 'Planned work days',
  milestones: 'Milestones',
  due: 'Task forecast finish dates',
};

/** Events the export would contain, before formatting. Exposed for the dialog's live count. */
export function calendarEvents(book, { focus = '', include = { planned: true, milestones: true, due: false }, done = false } = {}) {
  const out = [];
  for (const t of book.items) {
    if (isHidden(book, t) || (focus && t.jobId !== focus) || (t.status === 'done' && !done)) continue;
    const job = jobOf(book, t.jobId);
    const base = { item: t, job, phase: phaseTitle(book, t.phaseId) };
    if (include.planned && t.plannedDay && t.kind === 'task') {
      out.push({ ...base, kind: 'plan', date: t.plannedDay, summary: `${t.title}${t.effort && t.status !== 'done' ? ` (${fmtEffort(t.effort)})` : ''}` });
    }
    if (include.milestones && t.kind === 'milestone' && t.finish) {
      out.push({ ...base, kind: 'milestone', date: t.finish, summary: `◆ ${t.title}` });
    }
    if (include.due && t.kind === 'task' && t.finish) {
      out.push({ ...base, kind: 'due', date: t.finish, summary: `Forecast finish: ${t.title}` });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.summary.localeCompare(b.summary));
}

/** Builds the .ics text. `now` is injectable so tests are deterministic. */
export function buildIcs(book, options = {}, now = new Date(), version = '') {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // Minutes since 1970 always grows between exports, so clients that honour SEQUENCE take the newer copy.
  const sequence = Math.floor(now.getTime() / 60000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Selami Pazarbasi//Tas-Time ${version}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`Tas-Time — ${book.name}`)}`,
  ];
  for (const e of calendarEvents(book, options)) {
    const t = e.item;
    const details = [
      `${e.job.code ? `${e.job.code} · ` : ''}${e.job.title}${e.phase ? ` / ${e.phase}` : ''}`,
      e.kind === 'plan' ? 'Planned work day.' : e.kind === 'due' ? 'Forecast finish.' : 'Milestone.',
      t.effort && t.status !== 'done' ? `Effort left: ${fmtEffort(t.effort)}` : '',
      t.status === 'done' ? 'Status: done' : '',
      t.notes.trim() ? `\n${t.notes.trim().slice(0, 2000)}` : '',
      '\nExported from Tas-Time. Edit in Tas-Time and export again; changes made here are not read back.',
    ].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}-${e.kind}@tas-time`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${sequence}`,
      `DTSTART;VALUE=DATE:${e.date.replaceAll('-', '')}`,
      `DTEND;VALUE=DATE:${addDays(e.date, 1).replaceAll('-', '')}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `DESCRIPTION:${escapeText(details)}`,
      `CATEGORIES:${escapeText(e.job.code || e.job.title)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/** RFC 5545 §3.1: lines longer than 75 octets continue on lines starting with one space. Never splits a character. */
export function fold(line) {
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74; // continuation lines spend one octet on the leading space
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
