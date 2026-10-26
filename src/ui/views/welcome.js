// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// First-run screen, shown whenever the open book has no jobs.
import { h } from '../dom.js';
import { btn } from '../components.js';
import { createJob } from '../commands.js';
import { loadExample, openFile } from '../files.js';
import { today } from '../state.js';
import { guideButton } from '../guide.js';

export function welcome() {
  const step = (n, title, body) => h('li', null, h('span', { class: 'step-n' }, n), h('div', null, h('strong', null, title), h('p', null, body)));
  return h('div', { class: 'view welcome' },
    h('div', { class: 'welcome-card' },
      h('p', { class: 'eyebrow' }, 'Tas-Time'),
      h('h1', null, 'From the long view to today’s next step.'),
      h('p', { class: 'lead' }, 'Plan jobs in phases like a construction programme, then commit to a realistic week and a focused day. Everything stays in one file that you control.'),
      h('div', { class: 'welcome-actions' },
        btn('Create your first job', () => createJob(), { kind: 'primary lg', iconName: 'plus' }),
        btn('Open a planning book', openFile, { kind: 'lg', iconName: 'open' }),
        btn('Explore an example', () => loadExample(today()), { kind: 'ghost lg' })),
      h('p', { class: 'guide-link' }, 'Never planned your time before? ', guideButton(), ' first — about an hour, start to finish.'),
      h('ol', { class: 'steps' },
        step('1', 'Job → Phase → Task', 'A job is your project. Optional phases group its tasks. Example: Kitchen refit → Preparation → Measure kitchen. Use Add task to enter actual work.'),
        step('2', 'Plan', 'Give tasks dates and prerequisites. Drag bars on the programme to re-forecast.'),
        step('3', 'Week & Today', 'Set the hours you really have, then pick what fits. Leave a resume note when you stop.')),
      h('p', { class: 'fine' }, 'Nothing leaves this computer. No account, server or internet connection is used.')));
}
