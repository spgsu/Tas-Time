// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
import { h } from './dom.js';
import { fmtEffort, parseEffort } from '../core/parse.js';
import { addPerson, patchPerson } from '../core/ops.js';
import { act, notify, store, ui, rerender } from './state.js';
import { btn } from './components.js';
import { showModal } from './overlay.js';

export function workPersonId() {
  return ['all', 'unassigned'].includes(ui.workPerson) || store.book.people.some(p => p.id === ui.workPerson) ? ui.workPerson : store.book.selfId;
}

export function personSelect(value, onChange, { id = '', label = 'Assignee', all = true } = {}) {
  return h('label', { class: 'person-filter' }, label, h('select', { id: id || null, 'aria-label': label, onchange: e => onChange(e.target.value) },
    all ? h('option', { value: 'all', selected: value === 'all' }, 'All people') : null,
    h('option', { value: all ? 'unassigned' : '', selected: value === (all ? 'unassigned' : '') }, 'Unassigned'),
    store.book.people.map(p => h('option', { value: p.id, selected: value === p.id }, `${p.name}${p.id === store.book.selfId ? ' (My work)' : ''}`))));
}

export function showPeople() {
  const content = h('div', { class: 'people-manager' });
  const refresh = () => {
    content.replaceChildren(h('p', { class: 'muted' }, 'People belong to this planning book. Rename Me to your name. Assign one responsible person per task; contacts stay separate. Weekly capacity can be overridden in Week.'));
    for (const p of store.book.people) {
      const name = h('input', { value: p.name, 'aria-label': `Name for ${p.name}`, maxlength: 200,
        onchange: e => { act('Rename person', d => patchPerson(d, p.id, { name: e.target.value.trim() })); refresh(); } });
      const capacity = h('input', { value: fmtEffort(p.capacity) || '0h', 'aria-label': `Default weekly capacity for ${p.name}`,
        onchange: e => {
          const minutes = parseEffort(e.target.value);
          if (minutes === null || minutes > 10080) { notify('Use hours or minutes, up to 168h per week.', { kind: 'warn' }); refresh(); return; }
          act('Default capacity', d => patchPerson(d, p.id, { capacity: minutes })); refresh();
        } });
      content.append(h('div', { class: 'person-editor' }, h('label', null, p.id === store.book.selfId ? 'Name (My work)' : 'Name', name), h('label', null, 'Default available / week', capacity)));
    }
    const input = h('input', { id: 'new-person-name', placeholder: 'e.g. David', maxlength: 200, 'aria-label': 'New person name' });
    const add = () => {
      if (!input.value.trim()) { input.focus(); return; }
      const p = act('Add person', d => addPerson(d, input.value));
      if (p) { refresh(); document.getElementById('new-person-name')?.focus(); }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    content.append(h('div', { class: 'phase-add-control' }, input, btn('Add person', add, { kind: 'primary', iconName: 'plus' })));
  };
  refresh();
  showModal('People & capacity', content);
}
