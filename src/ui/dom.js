// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Tiny DOM builder. User text only ever becomes text nodes or attribute values,
// never markup, so the app has no HTML-injection surface.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'line', 'polyline', 'rect', 'circle', 'g', 'polygon', 'defs', 'marker']);

export function h(tag, props, ...children) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
      else if (key === 'style' && typeof value === 'object') {
        // setProperty is required for custom properties (--job); plain assignment drops them silently.
        for (const [prop, v] of Object.entries(value)) {
          if (v === null || v === undefined) continue;
          if (prop.startsWith('--')) el.style.setProperty(prop, v); else el.style[prop] = v;
        }
      }
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value' && 'value' in el && !SVG_TAGS.has(tag)) el.value = value;
      else if (key === 'checked' || key === 'selected' || key === 'indeterminate') el[key] = !!value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === '') continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replaces el's children, skipping null/false and flattening arrays (unlike replaceChildren). */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

const ICONS = {
  today: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  week: 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4M8 13h2M11 13h2M14 13h2M8 16h2M11 16h2',
  plan: 'M4 6h7M7 11h9M10 16h10M4 3v18',
  board: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  notes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  open: 'M3 7h6l2 2h10v10H3zM3 7V5h6',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  focus: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  diamond: 'M12 3l9 9-9 9-9-9z',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.3-1.7-.3-.9.3-1.8 1.3-1.8H17a4 4 0 0 0 4-4c0-5-4-8.5-9-8.5M7.5 11h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01',
  help:'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 1-1 1.7v.5M12 17h.01',
};

export function icon(name, size = 18) {
  return h('svg', { class: 'icon', width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    h('path', { d: ICONS[name] }));
}

const NATIVE_AUTOSIZE = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

/** The app icon is embedded by the build so it also works offline. */
export function appMark(size = 28) {
  return h('img', { class: 'app-mark', width: size, height: size, src: '{{APP_ICON}}', alt: '', 'aria-hidden': 'true' });
}

/** Grows a textarea to fit its content (only where CSS field-sizing is unavailable). */
export function autosize(el) {
  if (NATIVE_AUTOSIZE) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
