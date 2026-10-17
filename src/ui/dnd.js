// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// HTML5 drag and drop for item cards. Every drop target also has a keyboard/menu alternative.
const MIME = 'application/x-tas-time-item';

export function makeDraggable(el, id) {
  el.draggable = true;
  el.addEventListener('dragstart', event => {
    event.dataTransfer.setData(MIME, id);
    event.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => el.classList.add('dragging'));
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  return el;
}

export function makeDropZone(el, onDrop) {
  el.addEventListener('dragover', event => {
    if (!event.dataTransfer.types.includes(MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    el.classList.add('drop-over');
  });
  el.addEventListener('dragleave', event => { if (!el.contains(event.relatedTarget)) el.classList.remove('drop-over'); });
  el.addEventListener('drop', event => {
    el.classList.remove('drop-over');
    const id = event.dataTransfer.getData(MIME);
    if (!id) return;
    event.preventDefault();
    onDrop(id);
  });
  return el;
}
