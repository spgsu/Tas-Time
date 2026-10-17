// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Toasts, popover menus and the small modal used for help.
import { h, icon } from './dom.js';
import { onNotify } from './state.js';

// ── Toasts ──

export function initToasts() {
  const host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  document.body.append(host);
  onNotify((message, { kind = '', action = null, timeout = kind === 'error' ? 8000 : 4500 } = {}) => {
    const el = h('div', { class: ['toast', kind] },
      kind === 'error' || kind === 'warn' ? icon('alert', 16) : icon('check', 16),
      h('span', null, message),
      action ? h('button', { class: 'toast-action', onclick: () => { action.run(); el.remove(); } }, action.label) : null,
      h('button', { class: 'toast-close', 'aria-label': 'Dismiss', onclick: () => el.remove() }, icon('x', 14)));
    host.append(el);
    while (host.children.length > 3) host.firstChild.remove();
    setTimeout(() => el.remove(), timeout);
  });
}

// ── Popover menu ──

let openMenu = null;

export function closeMenu() {
  if (!openMenu) return;
  openMenu.el.remove();
  openMenu.anchor.setAttribute('aria-expanded', 'false');
  openMenu.anchor.focus({ preventScroll: true });
  openMenu = null;
}

/** items: [{ label, icon?, hint?, run, danger?, disabled? } | 'separator' | { heading }] */
export function showMenu(anchor, items, { align = 'end' } = {}) {
  if (openMenu?.anchor === anchor) { closeMenu(); return; }
  closeMenu();
  const el = h('div', { class: 'menu', role: 'menu' }, items.map(it => {
    if (it === 'separator') return h('div', { class: 'menu-sep', role: 'separator' });
    if (it.heading) return h('div', { class: 'menu-heading' }, it.heading);
    return h('button', {
      role: 'menuitem', class: ['menu-item', it.danger && 'danger'], disabled: it.disabled || null,
      onclick: () => { closeMenu(); it.run(); },
    }, it.icon ? icon(it.icon, 16) : h('span', { class: 'icon-gap' }), h('span', null, it.label), it.hint ? h('kbd', null, it.hint) : null);
  }));
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const left = align === 'end' ? r.right - w : r.left;
  el.style.left = `${Math.max(8, Math.min(left, innerWidth - w - 8))}px`;
  const below = r.bottom + 6;
  el.style.top = `${below + el.offsetHeight > innerHeight - 8 ? Math.max(8, r.top - el.offsetHeight - 6) : below}px`;
  anchor.setAttribute('aria-expanded', 'true');
  openMenu = { el, anchor };
  el.querySelector('button:not([disabled])')?.focus();
  el.addEventListener('keydown', event => {
    const buttons = [...el.querySelectorAll('button:not([disabled])')];
    const i = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') { event.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); }
    if (event.key === 'Tab') closeMenu();
  });
}

document.addEventListener('pointerdown', event => {
  if (openMenu && !openMenu.el.contains(event.target) && !openMenu.anchor.contains(event.target)) closeMenu();
});

// ── Modal ──

export function showModal(title, body, { wide = false } = {}) {
  const dialog = h('dialog', { class: ['modal', wide && 'wide'], 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', null, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('x', 18))),
    h('div', { class: 'modal-body' }, body));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
