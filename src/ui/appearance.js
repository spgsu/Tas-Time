// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Visual style and light/dark choice. Stored per browser, like a window preference;
// it is not part of the planning book.
import { prefs, setPref } from './files.js';
import { showMenu } from './overlay.js';

export const STYLES = [['fluent', 'Fluent (Microsoft 365)'], ['notebook', 'Notebook']];
export const SCHEMES = [['system', 'Match Windows'], ['light', 'Light'], ['dark', 'Dark']];

export function applyAppearance() {
  const p = prefs();
  const root = document.documentElement;
  root.dataset.style = STYLES.some(([k]) => k === p.style) ? p.style : 'fluent';
  if (p.scheme === 'light' || p.scheme === 'dark') root.dataset.scheme = p.scheme;
  else delete root.dataset.scheme;
}

export function appearanceMenu(anchor) {
  const p = prefs();
  const style = document.documentElement.dataset.style;
  const scheme = p.scheme || 'system';
  const pick = (key, value) => { setPref(key, value); applyAppearance(); };
  showMenu(anchor, [
    { heading: 'Style' },
    ...STYLES.map(([k, label]) => ({ label, icon: k === style ? 'check' : '', run: () => pick('style', k) })),
    'separator',
    { heading: 'Theme' },
    ...SCHEMES.map(([k, label]) => ({ label, icon: k === scheme ? 'check' : '', run: () => pick('scheme', k) })),
  ], { align: 'start' });
}
