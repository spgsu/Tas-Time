// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// The beginner's guide, bundled into the page at build time (docs/TUTORIAL.md) and shown
// offline in a reading window. The build places it in <template id="guide-content">.
import { h } from './dom.js';
import { showModal } from './overlay.js';

export function showGuide() {
  const source = document.getElementById('guide-content');
  if (!source) return;
  const body = source.content.cloneNode(true);
  const dialog = showModal('Beginner’s guide', [body], { wide: true });
  dialog.classList.add('guide-modal');
  // Contents entries scroll within the window instead of changing the page address.
  dialog.addEventListener('click', event => {
    const target = event.target.closest('[data-goto]');
    if (!target) return;
    event.preventDefault();
    // Scroll only the reading pane; scrollIntoView would also nudge the dialog and the page.
    const pane = dialog.querySelector('.guide');
    const heading = dialog.querySelector(`#${CSS.escape(target.dataset.goto)}`);
    if (pane && heading) pane.scrollTo({ top: pane.scrollTop + heading.getBoundingClientRect().top - pane.getBoundingClientRect().top - 8, behavior: 'smooth' });
  });
}

/** "Read the beginner's guide" as an in-app button, styled like a link. */
export function guideButton(label = 'Read the beginner’s guide') {
  return h('button', { class: 'link guide-open', onclick: showGuide }, label);
}
