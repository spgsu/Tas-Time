// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Calendar-day arithmetic on ISO dates (YYYY-MM-DD). All math is done in UTC
// day numbers so daylight-saving changes never shift a date.

const DAY_MS = 86400000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FULL_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Validation checks every date in the book on every edit; a book reuses few distinct dates.
const knownDates = new Set();

export function isIsoDate(value) {
  if (knownDates.has(value)) return true;
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1900 || y > 2200) return false;
  const ok = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value;
  if (ok && knownDates.size < 100000) knownDates.add(value);
  return ok;
}

export function todayIso(now = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function dayNum(iso) {
  if (!isIsoDate(iso)) throw new Error(`Not a valid date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function fromDayNum(n) { return new Date(n * DAY_MS).toISOString().slice(0, 10); }
export function addDays(iso, n) { return fromDayNum(dayNum(iso) + n); }
export function diffDays(a, b) { return dayNum(b) - dayNum(a); }
/** Same day n months later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}
export function weekday(iso) { return new Date(dayNum(iso) * DAY_MS).getUTCDay(); }
export function mondayOf(iso) { return addDays(iso, -((weekday(iso) + 6) % 7)); }

export function weekDays(monday) { return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); }

/** "Mon 20 Oct" — or "Mon 20 Oct 2027" outside the current year. */
export function fmtDate(iso, today = todayIso()) {
  if (!iso) return '';
  const n = new Date(dayNum(iso) * DAY_MS);
  const base = `${DAY_NAMES[n.getUTCDay()]} ${n.getUTCDate()} ${MONTHS[n.getUTCMonth()]}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${iso.slice(0, 4)}`;
}

/** "Saturday 17 October". */
export function fmtLong(iso) {
  const n = new Date(dayNum(iso) * DAY_MS);
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][n.getUTCMonth()];
  return `${FULL_WEEKDAYS[n.getUTCDay()][0].toUpperCase()}${FULL_WEEKDAYS[n.getUTCDay()].slice(1)} ${n.getUTCDate()} ${month}`;
}

export function fmtShort(iso) {
  if (!iso) return '';
  const n = new Date(dayNum(iso) * DAY_MS);
  return `${n.getUTCDate()} ${MONTHS[n.getUTCMonth()]}`;
}

/** Human distance from today: "today", "tomorrow", "in 3 days", "2 days ago". */
export function relDay(iso, today = todayIso()) {
  const d = diffDays(today, iso);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

/** Parses "today", "tomorrow", weekday names (next occurrence, today included) and ISO dates. */
export function parseDayWord(word, today = todayIso()) {
  const w = word.toLowerCase();
  if (w === 'today' || w === 'tod') return today;
  if (w === 'tomorrow' || w === 'tmr' || w === 'tom') return addDays(today, 1);
  const idx = WEEKDAYS.findIndex(d => w === d || w === FULL_WEEKDAYS[WEEKDAYS.indexOf(d)]);
  if (idx >= 0) return addDays(today, (idx - weekday(today) + 7) % 7);
  if (isIsoDate(word)) return word;
  return null;
}

export const MONTH_NAMES = MONTHS;
