// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Human input: effort durations and the one-line quick-add syntax.
import { parseDayWord, todayIso } from './dates.js';

/** Explicit units avoid confusing hours with minutes. Returns minutes or null. */
export function parseEffort(input) {
  const s = String(input).trim().toLowerCase().replace(/\s+/g, '');
  if (s === '') return 0;
  let m = s.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m?)?$/);
  if (m) return Math.round(Number(m[1]) * 60 + Number(m[2] || 0));
  m = s.match(/^(\d+)(?:m|min|mins)$/);
  if (m) return Number(m[1]);
  m = s.match(/^(\d+(?:\.\d+)?)d$/);
  if (m) return Math.round(Number(m[1]) * 8 * 60);
  return null;
}

/** 0 → "", 45 → "45m", 90 → "1h 30m", 120 → "2h". */
export function fmtEffort(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** Hours with one decimal, for totals: 135 → "2.3h". */
export function fmtHours(min) {
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

const EFFORT_TOKEN = /^\d+(?:\.\d+)?h(?:\d+m?)?$|^\d+(?:m|min|mins|d)$/i;

/**
 * Quick add: "Draft literature review #phd 2h @tue !fri"
 *   #code   job (matches code or title start)   2h / 30m / 1h30   effort
 *   @day    plan to work on it that day          !day              forecast finish
 *   *       leading star marks a milestone
 */
export function parseQuickAdd(input, jobs, today = todayIso()) {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const out = { title: '', jobId: '', jobHint: '', effort: null, plannedDay: '', finish: '', kind: 'task', errors: [] };
  const words = [];
  for (const tok of tokens) {
    if (tok.length > 1 && tok[0] === '#') {
      out.jobHint = tok.slice(1);
      const job = matchJob(jobs, out.jobHint);
      if (job) out.jobId = job.id; else out.errors.push(`No unique job matches “${tok}”. Choose a job or use its full code`);
    } else if (tok.length > 1 && (tok[0] === '@' || tok[0] === '!')) {
      const day = parseDayWord(tok.slice(1), today);
      if (!day) { out.errors.push(`Unrecognised day “${tok}”`); continue; }
      if (tok[0] === '@') out.plannedDay = day; else out.finish = day;
    } else if (EFFORT_TOKEN.test(tok)) {
      out.effort = parseEffort(tok);
    } else words.push(tok);
  }
  if (words[0] === '*') { out.kind = 'milestone'; words.shift(); } else if (words[0]?.startsWith('*')) { out.kind = 'milestone'; words[0] = words[0].slice(1); }
  out.title = words.join(' ');
  return out;
}

export function matchJob(jobs, hint) {
  const h = hint.toLowerCase();
  const live = jobs.filter(j => !j.archived);
  const exact = live.filter(j => j.code.toLowerCase() === h || j.title.toLowerCase() === h);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const matches = live.filter(j => j.code.toLowerCase().startsWith(h) || j.title.toLowerCase().split(/\s+/).some(w => w.startsWith(h)));
  return matches.length === 1 ? matches[0] : undefined;
}
