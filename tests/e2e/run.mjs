// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// End-to-end checks against the built dist/Tas-Time.html in headless Edge/Chrome.
// Drives real input (keyboard, pointer, menus) and inspects the resulting book.
// Screenshots of every view land in .e2e/ for visual review.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = pathToFileURL(join(root, 'dist', 'Tas-Time.html')).href;
const shots = join(root, '.e2e');
mkdirSync(shots, { recursive: true });

const results = [];
async function check(name, fn) {
  console.log(`Checking: ${name}`);
  try { await fn(); results.push([true, name]); } catch (error) { results.push([false, name, error.message]); }
}

const page = await launch();
const ev = expr => page.eval(expr);
const text = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
async function waitForUi(expression, description) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (await ev(expression)) return;
    await page.wait(20);
  }
  assert.fail(`Timed out waiting for ${description}`);
}
/** The book as the app would save it, captured through a stubbed file picker. */
const STUB_FS = `(() => {
  window.confirm = () => true; window.prompt = (m, d) => d;
  window.__saved = [];
  // Delays let tests switch books while a permission check or write is still in flight.
  window.__permDelay = 0; window.__writeDelay = 0; window.__pickName = 'plan.json';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const handle = name => ({ name,
    queryPermission: async () => { await sleep(window.__permDelay); return 'granted'; },
    requestPermission: async () => { await sleep(window.__permDelay); return 'granted'; },
    createWritable: async () => { let buf = ''; return { write: async s => { buf += s; }, close: async () => { await sleep(window.__writeDelay); window.__saved.push({ name, raw: buf }); } }; } });
  window.showSaveFilePicker = async () => handle(window.__pickName);
  window.__openText = ''; window.__openName = 'old-v2.json';
  // Real browsers open files read-only: write access starts as __openPerm and becomes __openGrant once asked.
  window.__openPerm = 'granted'; window.__openGrant = 'granted';
  window.showOpenFilePicker = async () => {
    const name = window.__openName; let perm = window.__openPerm;
    return [{ ...handle(name), queryPermission: async () => perm, requestPermission: async () => (perm = window.__openGrant),
      getFile: async () => ({ name, text: async () => window.__openText }) }];
  };
  return true;
})()`;
const lastSaved = async (name = '') => JSON.parse(await ev(`window.__saved.filter(s => !${JSON.stringify(name)} || s.name === ${JSON.stringify(name)}).at(-1)?.raw || "null"`));
const recoveryBook = () => ev(`JSON.parse(localStorage.getItem('tas-time:recovery:v3')).book`);
const fileMenu = async label => { await ev('document.querySelector("#file-menu").click(); true'); await page.clickText('.menu-item', label); };
const quickAdd = async line => {
  await ev('document.activeElement?.blur(); true');
  await page.key('n', { keyCode: 78 });
  await page.type(line);
  await page.key('Enter', { keyCode: 13 });
};
const nav = async n => { await page.click(`.nav-item:nth-child(${n})`); await page.wait(120); };
const today = await ev('(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()');
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

try {
  await page.goto(app);
  await ev('localStorage.clear(); indexedDB.deleteDatabase("tas-time"); true');
  await page.reload();
  await ev(STUB_FS);

  await check('starts on the welcome screen with no errors', async () => {
    assert.ok(await text('.welcome h1'));
    assert.deepEqual(page.errors, []);
  });
  await page.screenshot(join(shots, '00-welcome.png'), { full: false });

  await check('create first job opens the job panel with the name selected', async () => {
    await page.clickText('.welcome .btn', 'Create your first job');
    assert.equal(await ev('document.activeElement.id'), 'd-title');
    await page.type('Garden shed');
    await page.key('Tab', { keyCode: 9 });
    await page.wait(100);
    assert.equal(await text('.job-link .job-name'), 'Garden shed');
    await page.clickText('.drawer .btn', 'Add standard phases');
    assert.equal(await count('.phase-list li'), 4);
    await page.key('Escape', { keyCode: 27 });
    assert.equal(await count('.drawer'), 0);
  });

  await page.clickText('.menu-item, button', '') .catch(() => {});
  await ev('document.querySelector("#file-menu").click(); true');
  await page.clickText('.menu-item', 'Load example book');
  await check('example book loads into Today', async () => {
    assert.equal(await text('.page-head .eyebrow'), 'Today');
    assert.ok(await count('.today-main .row-item') >= 2);
  });

  for (const [i, v] of ['today', 'week', 'plan', 'board', 'notes'].entries()) {
    await nav(i + 1);
    await page.screenshot(join(shots, `0${i + 1}-${v}.png`));
  }
  await check('every view renders without page errors', async () => assert.deepEqual(page.errors, []));

  await check('quick add parses job, effort, plan day and due date (keyboard only)', async () => {
    await nav(1);
    await page.key('n', { keyCode: 78 });
    assert.equal(await ev('document.activeElement.id'), 'quick-add');
    await page.type('Order timber samples #home 90m @tomorrow !fri');
    await page.wait(100);
    assert.match(await text('#quick-preview'), /Kitchen refit/);
    await page.key('Enter', { keyCode: 13 });
    await page.wait(600); // recovery copy is written after a short debounce
    const t = await ev(`(() => { const b = JSON.parse(localStorage.getItem('tas-time:recovery:v3')).book; const t = b.items.find(i => i.title === 'Order timber samples'); return t && { job: b.jobs.find(j => j.id === t.jobId).code, effort: t.effort, plannedDay: t.plannedDay, finish: t.finish }; })()`);
    assert.deepEqual({ job: t.job, effort: t.effort, plannedDay: t.plannedDay }, { job: 'HOME', effort: 90, plannedDay: addDays(today, 1) });
    assert.ok(t.finish >= today);
  });

  await check('editing in the panel saves as you type; undo restores', async () => {
    await page.clickText('.today-main .row-title', 'Write scope brief');
    assert.equal(await count('.drawer'), 1);
    await ev(`(() => { const el = document.getElementById('d-effort'); el.value = '3h'; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await page.wait(80);
    assert.equal(await ev(`document.getElementById('d-effort').value`), '3h');
    await page.click('#d-title');
    await ev(`document.getElementById('d-title').select(); true`);
    await page.type('Write the scope brief');
    await page.key('Tab', { keyCode: 9 });
    await page.wait(100);
    assert.ok(await ev(`[...document.querySelectorAll('.row-title')].some(b => b.textContent === 'Write the scope brief')`));
    await page.key('Escape', { keyCode: 27 });
    await page.key('z', { modifiers: 2, keyCode: 90 });
    await page.wait(100);
    assert.ok(await ev(`[...document.querySelectorAll('.row-title')].some(b => b.textContent === 'Write scope brief')`), 'title undo');
  });

  await check('a task with an open prerequisite cannot be ticked done', async () => {
    await nav(3);
    const disabled = await ev(`[...document.querySelectorAll('.prow-item')].find(r => r.textContent.includes('Full chapter draft')).querySelector('.tick').disabled`);
    assert.equal(disabled, true);
  });

  await check('dragging a Gantt bar moves the task by whole days', async () => {
    const before = await ev(`JSON.parse(localStorage.getItem('tas-time:recovery:v3')).book.items.find(i => i.title === 'Limitations table').start`);
    const box = await page.box(`[data-item] .bar[aria-label^="Limitations table"]`);
    const px = await ev(`parseFloat(getComputedStyle(document.querySelector('.plan-grid')).getPropertyValue('--px'))`);
    const y = box.y + box.h / 2;
    const x = box.x + 10;
    await page.mouse('mousePressed', x, y);
    await page.mouse('mouseMoved', x + px, y);
    await page.mouse('mouseMoved', x + 2 * px + 2, y);
    await page.mouse('mouseReleased', x + 2 * px + 2, y);
    await page.wait(600);
    const after = await ev(`JSON.parse(localStorage.getItem('tas-time:recovery:v3')).book.items.find(i => i.title === 'Limitations table').start`);
    assert.equal(after, addDays(before, 2));
  });

  await check('arrow keys on a focused bar nudge it; Shift+arrow extends the finish', async () => {
    const get = () => ev(`JSON.parse(localStorage.getItem('tas-time:recovery:v3')).book.items.find(i => i.title === 'Limitations table')`);
    const before = await get();
    await ev(`document.querySelector('.bar[aria-label^="Limitations table"]').focus(); true`);
    await page.key('ArrowLeft', { keyCode: 37 });
    await page.wait(500);
    await page.key('ArrowRight', { keyCode: 39, modifiers: 8 });
    await page.wait(500);
    const after = await get();
    assert.equal(after.start, addDays(before.start, -1));
    assert.equal(after.finish, before.finish);
  });

  await check('week: plan an unplanned task onto a day from its menu', async () => {
    await nav(2);
    const title = await text('.tray .wcard-title');
    await ev(`document.querySelector('.tray .wcard-menu').click(); true`);
    await page.wait(80);
    await ev(`document.querySelectorAll('.menu .menu-item')[0].click(); true`);
    await page.wait(150);
    assert.ok(await ev(`[...document.querySelectorAll('.day .wcard-title')].some(e => e.textContent === ${JSON.stringify(title)})`));
  });

  await check('week: capacity accepts hours and updates the meter', async () => {
    await ev(`(() => { const el = document.getElementById('week-capacity'); el.value = '12h'; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await page.wait(80);
    assert.match(await text('.week-summary .meter-label'), /of 12h/);
  });

  await check('board: dropping a card on Doing changes its status; Blocked asks for a reason', async () => {
    await nav(4);
    const drop = (title, col) => ev(`(() => {
      const card = [...document.querySelectorAll('.bcard')].find(c => c.textContent.includes(${JSON.stringify(title)}));
      const dt = new DataTransfer(); dt.setData('application/x-tas-time-item', card.dataset.item);
      document.querySelector('.col-${col}').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      return true; })()`);
    await drop('Write the scope brief', 'doing').catch(() => drop('Write scope brief', 'doing'));
    await page.wait(100);
    assert.ok(await ev(`[...document.querySelectorAll('.col-doing .bcard')].some(c => c.textContent.includes('scope brief'))`));
    await drop('Order timber samples', 'blocked');
    await page.wait(150);
    assert.equal(await ev('document.activeElement.id'), 'd-blocker', 'dropping on Blocked focuses its reason');
    await page.type('Supplier closed until Monday');
    await page.key('Escape', { keyCode: 27 });
    await page.wait(100);
    assert.ok(await ev(`[...document.querySelectorAll('.col-blocked .bcard')].some(c => c.textContent.includes('Order timber samples'))`));
  });

  await check('notes save as you type', async () => {
    await nav(5);
    await page.clickText('.tabs button', 'Working notes');
    await ev(`document.getElementById('note-text').focus(); true`); // element.click() does not focus a textarea
    await page.type('Method B needs a larger sample.');
    await page.wait(500);
    const job = await text('.notes-job.on span:nth-child(2)');
    const saved = await ev(`JSON.parse(localStorage.getItem('tas-time:recovery:v3')).book.jobs.find(j => j.title === ${JSON.stringify(job)}).notes.working`);
    assert.equal(saved, 'Method B needs a larger sample.', `job ${job}`);
  });

  await check('hostile text is shown as text, never executed', async () => {
    await ev('document.activeElement.blur(); true'); // N types a letter while a text field has focus
    await page.key('n', { keyCode: 78 });
    await page.type('<img src=x onerror="window.__pwned=1"> <b>bold</b>');
    await page.key('Enter', { keyCode: 13 });
    await nav(3);
    await page.wait(200);
    assert.equal(await ev('window.__pwned ?? 0'), 0);
    assert.equal(await count('#main img, #main b'), 0);
    assert.ok(await ev(`[...document.querySelectorAll('.item-title')].some(e => e.textContent.includes('<img src=x'))`));
  });

  await check('Save writes a valid book to the chosen file, then autosaves edits', async () => {
    await page.key('s', { modifiers: 2, keyCode: 83 });
    await page.wait(300);
    const first = await lastSaved();
    assert.equal(first.format, 'tas-time-planning-book');
    assert.equal(first.version, 4);
    assert.match(await text('.status'), /Saved · plan\.json/);
    const writes = await ev('window.__saved.length');
    await nav(1);
    await page.key('n', { keyCode: 78 });
    await page.type('Autosaved task @today');
    await page.key('Enter', { keyCode: 13 });
    await page.wait(1800);
    assert.equal(await ev('window.__saved.length'), writes + 1);
    assert.ok((await lastSaved()).items.some(i => i.title === 'Autosaved task'));
  });

  await check('autosave keeps the task editor in place without replaying an animation', async () => {
    await page.clickText('.today-main .row-title', 'Autosaved task');
    await ev('document.getElementById("d-owner").focus(); window.__editor = document.getElementById("drawer"); window.__editorY = window.__editor.scrollTop; true');
    await page.type('Myself');
    await page.wait(1800);
    assert.equal(await ev('document.getElementById("drawer") === window.__editor'), true, 'editor DOM is preserved');
    assert.equal(await ev('document.activeElement.id'), 'd-owner', 'typing focus stays in the editor');
    assert.equal(await ev('document.getElementById("d-owner").value'), 'Myself', 'typed value is preserved');
    assert.equal(await ev('document.getElementById("drawer").scrollTop === window.__editorY'), true, 'scroll stays in place');
    assert.equal(await ev('getComputedStyle(document.getElementById("drawer")).animationName'), 'none', 'no repeated opening animation');
    await page.key('Escape', { keyCode: 27 });
  });

  await check('Tomorrow explains where the task went and lets the move be undone', async () => {
    const before = await recoveryBook();
    const task = before.items.find(t => t.title === 'Autosaved task');
    await page.clickText(`[data-item="${task.id}"] .row-actions .btn`, 'Tomorrow');
    await page.wait(600);
    const after = await recoveryBook();
    assert.equal(after.items.length, before.items.length);
    assert.equal(after.items.find(t => t.id === task.id).plannedDay, addDays(today, 1));
    assert.match(await text('.toasts'), /Moved to tomorrow\. See it in Week\./);
    assert.equal(await count(`.today-main [data-item="${task.id}"]`), 0);
    await nav(2);
    assert.equal(await count(`.day [data-item="${task.id}"]`), 1);
    await page.click('.toast:last-child .toast-action');
    await nav(1);
    assert.equal(await count(`.today-main [data-item="${task.id}"]`), 1);
  });

  await check('unsaved work survives a reload (recovery copy)', async () => {
    await ev('window.showSaveFilePicker = undefined; true');
    await page.reload();
    assert.ok(await ev(`[...document.querySelectorAll('.row-title')].some(e => e.textContent === 'Autosaved task')`));
    assert.equal(await text('.book-name'), 'Example planning book');
    await ev(STUB_FS);
  });

  await check('opening a version 2 file upgrades it without linking the original', async () => {
    const v2 = { format: 'tas-time-planning-book', version: 2, name: 'Old book', baselineDate: '', weeks: {},
      jobs: [{ id: 'j', title: 'Legacy job', code: 'OLD', outcome: '', color: 'plum', status: 'Active', archived: false, notes: { scope: '', decisions: '', working: '', references: '', restart: 'From v2' } }],
      phases: [], items: [{ id: 'a', jobId: 'j', phaseId: '', title: 'Legacy action', kind: 'Action', owner: '', start: '', finish: '', remaining: 30, status: 'In progress', archived: false, predecessors: [], blocker: '', plannedDay: today, baselineStart: '', baselineFinish: '', acceptedOn: '', notes: '' }] };
    await ev(`window.__openText = ${JSON.stringify(JSON.stringify(v2))}; true`);
    await page.key('o', { modifiers: 2, keyCode: 79 });
    await page.wait(300);
    assert.equal(await text('.book-name'), 'Old book');
    assert.ok(await ev(`[...document.querySelectorAll('.row-title')].some(e => e.textContent === 'Legacy action')`));
    assert.match(await text('.status'), /Not saved to a file/);
    assert.match(await ev(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' ')`), /Upgraded from version 2/);
  });

  await check('quick add with an unknown #job or day is refused and the text kept', async () => {
    await nav(1);
    await quickAdd('Critical review #missing !nonsense');
    await page.wait(600);
    assert.equal(await ev(`document.getElementById('quick-add').value`), 'Critical review #missing !nonsense');
    assert.ok(!(await recoveryBook()).items.some(i => i.title.startsWith('Critical review')));
    assert.match(await ev(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' ')`), /Not added/);
    await ev(`document.getElementById('quick-add').value = ''; true`);
  });

  await check('switching books during the autosave delay saves the edits first', async () => {
    await ev(`window.__pickName = 'plan.json'; true`);
    await fileMenu('Load example book');
    await page.key('s', { modifiers: 2, keyCode: 83 });
    await page.wait(300);
    assert.match(await text('.status'), /Saved · plan\.json/);
    await quickAdd('Edit before switch');
    await fileMenu('Load example book'); // inside the 1.2 s autosave window
    await page.wait(600);
    assert.ok((await lastSaved('plan.json')).items.some(i => i.title === 'Edit before switch'), 'edit reached plan.json');
    assert.match(await text('.status'), /Not saved to a file/, 'new book is not linked to plan.json');
  });

  await check('opening a current file asks for write access once, then autosaves without Reconnect', async () => {
    await ev(`window.__openText = window.__saved.filter(s => s.name === 'plan.json').at(-1).raw; window.__openName = 'opened.json'; window.__openPerm = 'prompt'; true`);
    await page.key('o', { modifiers: 2, keyCode: 79 });
    await page.wait(300);
    assert.doesNotMatch(await text('.status'), /Reconnect/);
    await quickAdd('Edit after open');
    await page.wait(1600);
    assert.ok((await lastSaved('opened.json')).items.some(i => i.title === 'Edit after open'), 'edit reached opened.json');
    assert.match(await text('.status'), /Saved · opened\.json/);
  });

  await check('opening a file whose write access is refused shows Reconnect straight away', async () => {
    await ev(`window.__openName = 'refused.json'; window.__openPerm = 'prompt'; window.__openGrant = 'denied'; true`);
    await page.key('o', { modifiers: 2, keyCode: 79 });
    await page.wait(300);
    assert.match(await text('.status'), /Reconnect refused\.json/);
    await ev(`window.__openName = 'old-v2.json'; window.__openPerm = 'granted'; window.__openGrant = 'granted'; true`);
  });

  await check('a slow permission check never writes another book into the file', async () => {
    await ev(`window.__pickName = 'original.json'; window.__permDelay = 800; true`);
    await page.key('s', { modifiers: 2, keyCode: 83 }); // example book, picker → original.json, permission pending
    await page.wait(100);
    await fileMenu('New book');
    await page.wait(1200);
    await ev('window.__permDelay = 0; true');
    assert.equal(await lastSaved('original.json'), null, 'nothing written to original.json');
    assert.equal(await text('.book-name'), 'My planning book');
    assert.doesNotMatch(await text('.status'), /original\.json/);
  });

  await check('a slow write finishes with the old book and leaves the new book unlinked', async () => {
    await ev(`window.__pickName = 'slow.json'; true`);
    await fileMenu('Load example book');
    await page.key('s', { modifiers: 2, keyCode: 83 });
    await page.wait(300);
    await quickAdd('Last edit before switch');
    await ev('window.__writeDelay = 800; true');
    await page.key('s', { modifiers: 2, keyCode: 83 }); // write in flight
    await page.wait(100);
    await fileMenu('New book'); // waits for both queued writes before switching
    await page.wait(2500);
    await ev('window.__writeDelay = 0; true');
    const saved = await lastSaved('slow.json');
    assert.equal(saved.name, 'Example planning book');
    assert.ok(saved.items.some(i => i.title === 'Last edit before switch'));
    assert.equal(await ev(`window.__saved.filter(s => JSON.parse(s.raw).name === 'My planning book').length`), 0);
    assert.equal(await text('.book-name'), 'My planning book');
    assert.doesNotMatch(await text('.status'), /slow\.json/);
  });

  await check('calendar export: dialog counts events and downloads a valid .ics', async () => {
    await fileMenu('Load example book');
    await ev(`window.__blobs = []; const orig = URL.createObjectURL; URL.createObjectURL = b => { window.__blobs.push(b); return orig.call(URL, b); }; true`);
    await fileMenu('Export to calendar');
    const countText = () => text('.export-count');
    const before = await countText();
    assert.match(before, /^\d+ events? will be exported/);
    await page.clickText('.check-row', 'Task forecast finish dates');
    assert.notEqual(await countText(), before, 'count follows the checkboxes');
    await page.clickText('.modal .btn', 'Download .ics file');
    await page.wait(150);
    const ics = await ev(`window.__blobs.at(-1).text()`);
    writeFileSync(join(shots, 'export.ics'), ics); // for manual import tests and external validation
    const type = await ev(`window.__blobs.at(-1).type`);
    assert.equal(type, 'text/calendar;charset=utf-8');
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /SUMMARY:◆ Contractor chosen\r\n/);
    assert.match(ics, /SUMMARY:Forecast finish: /);
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, Number((await countText()).match(/\d+/)[0]));
    await page.clickText('.export-help summary', 'How to import');
    await page.screenshot(join(shots, 'x1-calendar-export.png'), { full: false });
    await ev(`document.querySelector('dialog').close(); true`);
  });

  await check('appearance: style and theme switch from the menu and persist across reloads', async () => {
    const bg = () => ev('getComputedStyle(document.body).backgroundColor');
    const pickAppearance = async label => { await page.click('#appearance'); await page.clickText('.menu-item', label); await page.wait(80); };
    assert.equal(await ev('document.documentElement.dataset.style'), 'fluent', 'Fluent is the default');
    const fluentLight = await bg();
    await pickAppearance('Notebook');
    assert.equal(await ev('document.documentElement.dataset.style'), 'notebook');
    assert.notEqual(await bg(), fluentLight);
    await nav(1);
    await page.screenshot(join(shots, 's1-today-notebook.png'), { full: false });
    await pickAppearance('Dark');
    assert.equal(await ev('document.documentElement.dataset.scheme'), 'dark');
    const darkBg = await bg();
    await page.reload();
    await ev(STUB_FS);
    assert.equal(await ev('document.documentElement.dataset.style'), 'notebook', 'style persisted');
    assert.equal(await bg(), darkBg, 'theme persisted');
    await pickAppearance('Fluent');
    await pickAppearance('Match Windows');
    assert.equal(await ev('document.documentElement.dataset.scheme ?? "none"'), 'none');
    assert.equal(await bg(), fluentLight);
  });

  await check('beginner’s guide opens offline from welcome, sidebar and help — no online links', async () => {
    await fileMenu('New book');
    const openAndInspect = async () => {
      await page.wait(150);
      const info = await ev(`(async () => {
        const d = document.querySelector('dialog.guide-modal');
        const imgs = [...d.querySelectorAll('.guide img')];
        for (const i of imgs) { i.loading = 'eager'; await i.decode().catch(() => {}); }
        return { sections: d.querySelectorAll('.guide h2').length, toc: d.querySelectorAll('.guide-toc a').length,
          images: imgs.length, loaded: imgs.filter(i => i.naturalWidth > 0).length,
          online: [...d.querySelectorAll('a[href]')].filter(a => !a.getAttribute('href').startsWith('#')).length };
      })()`);
      return info;
    };
    await page.clickText('.welcome .guide-open', 'beginner');
    const info = await openAndInspect();
    assert.ok(info.sections >= 10, `sections: ${info.sections}`);
    assert.equal(info.toc, info.sections, 'one contents entry per section');
    assert.equal(info.images, 3);
    assert.equal(info.loaded, 3, 'embedded diagrams render without a network');
    assert.equal(info.online, 0, 'no links leave the app');
    await page.clickText('.guide-toc a', 'Step 9');
    // Smooth scrolling over ~12,000 px takes a moment: wait until the pane stops moving.
    const settled = await ev(`new Promise(resolve => { const g = document.querySelector('dialog.guide-modal .guide'); let last = -1; const tick = () => { if (g.scrollTop === last) return resolve(true); last = g.scrollTop; setTimeout(tick, 150); }; setTimeout(tick, 150); })`);
    assert.ok(settled);
    const offset = await ev(`(() => { const d = document.querySelector('dialog.guide-modal'); const a = [...d.querySelectorAll('.guide-toc a')].find(x => x.textContent.startsWith('Step 9')); return Math.round(d.querySelector('#' + CSS.escape(a.dataset.goto)).getBoundingClientRect().top - d.querySelector('.guide').getBoundingClientRect().top); })()`);
    assert.ok(offset >= 0 && offset < 40, `contents link scrolls to its section (heading ${offset}px below the pane top)`);
    assert.ok(!(await ev('location.hash')), 'page address unchanged');
    await page.screenshot(join(shots, 'g1-guide.png'), { full: false });
    await ev(`document.querySelector('dialog').close(); true`);
    await page.click('#guide');
    assert.equal((await openAndInspect()).images, 3, 'sidebar entry opens it too');
    await ev(`document.querySelector('dialog').close(); true`);
    await page.click('.foot-link:last-child');
    await page.clickText('.modal .guide-open', 'beginner');
    assert.equal(await count('dialog.guide-modal'), 1, 'help opens it');
    await ev(`for (const d of document.querySelectorAll('dialog')) d.close(); true`);
  });

  await check('resume note still shows when nothing is planned for today', async () => {
    await fileMenu('Load example book');
    // Clear today's plan so only the fallback can supply a resume note.
    const titles = await ev(`[...document.querySelectorAll('.today-main section:first-child .row-title')].map(b => b.textContent)`);
    for (const title of titles) {
      await page.clickText('.today-main .row-title', title);
      await ev(`(() => { const el = document.getElementById('d-plannedDay'); el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await page.key('Escape', { keyCode: 27 });
    }
    await nav(1);
    assert.match(await text('.today-main section:first-child'), /Nothing planned for today/, 'nothing planned today (suggestions shown instead)');
    assert.ok(await count('.today-side .resume') >= 1, 'a resume note is shown');
  });

  await check('notebook: Lessons learned page, earlier jobs’ lessons, breakdown hint', async () => {
    await nav(5);
    await page.clickText('.tabs button', 'Working notes');
    assert.match(await ev(`document.getElementById('note-text').placeholder`), /fishbone/i);
    await page.clickText('.tabs button', 'Lessons learned');
    await ev(`document.getElementById('note-text').focus(); true`);
    await page.type('Double estimates for writing.');
    await page.wait(200);
    await page.clickText('.notes-job', 'Kitchen refit');
    await page.clickText('.tabs button', 'Lessons learned');
    await page.click('.earlier-lessons summary');
    assert.match(await text('.earlier-lessons'), /Methodology chapter[\s\S]*Double estimates for writing\./);
    await page.screenshot(join(shots, 'n1-lessons.png'), { full: false });
  });

  await check('shortcut hints follow the platform: Ctrl on Windows, ⌘ on macOS', async () => {
    const helpKeys = async () => {
      await page.click('.foot-link:last-child');
      const t = await ev(`[...document.querySelectorAll('.modal kbd')].map(k => k.textContent).join(' ')`);
      await ev(`document.querySelector('dialog').close(); true`);
      return t;
    };
    assert.match(await helpKeys(), /Ctrl\+S Ctrl\+Shift\+S/);
    const ua = await ev('navigator.userAgent');
    const mac = ua.replace(/\(Windows[^)]*\)/, '(Macintosh; Intel Mac OS X 10_15_7)');
    await page.send('Emulation.setUserAgentOverride', { userAgent: mac, platform: 'MacIntel', userAgentMetadata: { platform: 'macOS', platformVersion: '14.0.0', architecture: 'arm', model: '', mobile: false } });
    await page.reload();
    await ev(STUB_FS);
    const macKeys = await helpKeys();
    await page.send('Emulation.setUserAgentOverride', { userAgent: ua });
    await page.reload();
    await ev(STUB_FS);
    assert.match(macKeys, /⌘S ⇧⌘S/);
    assert.match(macKeys, /⌘Z ⇧⌘Z/);
    assert.doesNotMatch(macKeys, /Ctrl/);
  });

  await check('UX: create a job, phase and task without quick-add syntax', async () => {
    await fileMenu('New book');
    await nav(3);
    await page.clickText('.welcome .btn', 'Create your first job');
    await page.type('Kitchen UX');
    await page.key('Tab', { keyCode: 9 });
    await page.wait(100);
    await ev('document.getElementById("d-phases").focus(); true');
    await page.type('Preparation');
    await page.clickText('.phase-add-control .btn', 'Add phase');
    assert.equal(await count('.phase-list li'), 1);
    await page.clickText('.phase-list .btn', 'Add task');
    assert.equal(await ev('document.activeElement.id'), 'd-title');
    await page.type('Measure kitchen');
    await page.key('Tab', { keyCode: 9 });
    await page.wait(600);
    const b = await recoveryBook();
    const t = b.items.find(t => t.title === 'Measure kitchen');
    assert.equal(t.phaseId, b.phases[0].id);
    assert.equal(t.jobId, b.jobs[0].id);
    assert.equal(t.plannedDay, '');
    assert.match(await text('.drawer'), /Forecast finish/);
    await page.key('Escape', { keyCode: 27 });
    assert.match(await text('.focus-banner'), /Showing: Kitchen UX/);
    assert.equal(await ev('getComputedStyle(document.querySelector(".plan-scroll .add-inline")).opacity'), '1');
    await page.click('.plan-scroll .phase-toggle');
    assert.equal(await count('.plan-scroll .prow-item'), 0);
    await page.click('.plan-scroll .phase-toggle');
    assert.equal(await count('.plan-scroll .prow-item'), 1);
  });

  await check('UX: quick add respects selectors, same-job phase and consistent work-day defaults', async () => {
    const b = await recoveryBook();
    await ev(`(() => { const e = document.getElementById('quick-phase'); e.value = ${JSON.stringify(b.phases[0].id)}; e.dispatchEvent(new Event('change')); return true; })()`);
    await nav(1);
    await quickAdd('Measure again #kitchen 10h');
    await page.wait(600);
    let t = (await recoveryBook()).items.find(t => t.title === 'Measure again');
    assert.equal(t.phaseId, b.phases[0].id);
    assert.equal(t.plannedDay, '', 'Today does not silently schedule global quick add');
    assert.equal(t.effort, 600);
    await ev('document.getElementById("quick-add").focus(); true');
    await page.type('Button-created task');
    await page.clickText('#quick-destination .btn', 'Add task');
    await page.wait(600);
    assert.ok((await recoveryBook()).items.some(t => t.title === 'Button-created task'));
    await nav(2);
    await page.click('[aria-label="Next week"]');
    const buttonDay = await ev('document.querySelector(".day .btn").getAttribute("aria-label").slice(-10)');
    await page.click('.day .btn');
    await page.type('Next week task');
    await page.key('Tab', { keyCode: 9 });
    await page.wait(600);
    t = (await recoveryBook()).items.find(t => t.title === 'Next week task');
    assert.equal(t.plannedDay, buttonDay);
    await page.key('Escape', { keyCode: 27 });
    await nav(1);
    await page.clickText('.today .panel-head .btn', 'Add task for today');
    await page.type('Today task');
    await page.key('Tab', { keyCode: 9 });
    await page.wait(600);
    assert.equal((await recoveryBook()).items.find(t => t.title === 'Today task').plannedDay, today);
    await page.key('Escape', { keyCode: 27 });
  });

  await check('UX: pausing and completing a job preserve tasks and explain their visibility', async () => {
    await page.clickText('.focus-banner .btn', 'Edit job');
    await page.clickText('.drawer [role="radio"]', 'On hold');
    assert.equal(await count('.today-main .row-item'), 0);
    assert.match(await text('.focus-banner'), /On hold/);
    await page.clickText('.drawer [role="radio"]', 'Active');
    assert.ok(await count('.today-main .row-item') > 0);
    await ev('window.__confirmText = ""; window.confirm = m => { window.__confirmText = m; return false; }; true');
    await page.clickText('.drawer [role="radio"]', 'Complete');
    assert.match(await ev('window.__confirmText'), /unfinished task/);
    assert.equal(await ev('document.querySelector(".drawer [role=radio][aria-checked=true]").textContent'), 'Active');
    await ev('window.confirm = () => true; true');
    await page.clickText('.drawer [role="radio"]', 'Complete');
    assert.equal(await count('.today-main .row-item'), 0);
    await page.clickText('.drawer [role="radio"]', 'Active');
    await page.key('Escape', { keyCode: 27 });
  });

  await check('UX: blocked moves explain rejection and Resolve blocker clears the constraint', async () => {
    await nav(4);
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.clickText('.bcard-title', 'Today task');
      await ev('document.getElementById("d-blocker").focus(); true');
      await page.type('Awaiting access');
      await page.key('Escape', { keyCode: 27 });
      await ev(`(() => { const card = [...document.querySelectorAll('.col-blocked .bcard')].find(c => c.textContent.includes('Today task')); const dt = new DataTransfer(); dt.setData('application/x-tas-time-item', card.dataset.item); document.querySelector('.col-todo').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true })); return true; })()`);
      assert.match(await text('.toasts'), /Still blocked/);
      await page.clickText('.col-blocked .btn', 'Resolve blocker');
      await waitForUi('document.activeElement.id === "d-blocker"', 'Resolve blocker to focus its reason');
      await ev('document.getElementById("d-blocker").select(); true');
      await page.key('Backspace', { keyCode: 8 });
      await waitForUi('document.getElementById("d-blocker")?.value === ""', 'the reason to be cleared');
      await page.key('Escape', { keyCode: 27 });
      await waitForUi('document.querySelectorAll(".col-blocked .bcard").length === 0', 'the resolved card to leave Blocked');
    }
  });

  await check('UX: phone Plan shows readable task dates and mobile controls remain available', async () => {
    await page.size(390, 844);
    await nav(3);
    assert.equal(await ev('getComputedStyle(document.querySelector(".plan-list")).display'), 'block');
    assert.equal(await ev('getComputedStyle(document.querySelector(".plan-scroll")).display'), 'none');
    assert.match(await text('.plan-list'), /Measure kitchen/);
    assert.match(await text('.plan-list'), /Forecast:/);
    assert.notEqual(await ev('getComputedStyle(document.querySelector(".status-text")).display'), 'none');
    await page.clickText('.mobile-plan-toggle', 'Show timeline');
    assert.notEqual(await ev('getComputedStyle(document.querySelector(".plan-scroll")).display'), 'none');
    await page.clickText('.mobile-plan-toggle', 'Show task list');
    await page.click('#file-menu');
    assert.match(await text('.menu'), /Beginner’s guide/);
    assert.match(await text('.menu'), /Appearance/);
    assert.match(await text('.menu'), /New job/);
    await page.key('Escape', { keyCode: 27 });
    await page.size(1440, 900);
  });

  await check('assignments: add David, assign a task, preserve contacts and separate personal workload', async () => {
    await nav(6);
    await page.clickText('.assignments .btn', 'People & capacity');
    await ev('document.getElementById("new-person-name").focus(); true');
    await page.type('David');
    await page.clickText('.people-manager .btn', 'Add person');
    await page.wait(600);
    const b = await recoveryBook();
    const david = b.people.find(p => p.name === 'David');
    assert.ok(david?.id);
    await ev('document.querySelector("dialog").close(); true');
    await nav(4);
    await page.clickText('.bcard-title', 'Today task');
    await ev(`(() => { const e = document.getElementById('d-assignee'); e.value = ${JSON.stringify(david.id)}; e.dispatchEvent(new Event('change')); return true; })()`);
    await ev(`(() => { const e = document.getElementById('d-effort'); e.value = '2h'; e.dispatchEvent(new Event('change')); return true; })()`);
    await ev('document.getElementById("d-owner").focus(); true');
    await page.type('Supplier contact');
    await page.key('Escape', { keyCode: 27 });
    await nav(1);
    assert.equal(await count('.today-main [data-item="' + b.items.find(t => t.title === 'Today task').id + '"]'), 0);
    await ev(`(() => { const e = document.getElementById('today-person'); e.value = ${JSON.stringify(david.id)}; e.dispatchEvent(new Event('change')); return true; })()`);
    assert.match(await text('.today-main'), /Today task/);
    await nav(2);
    await page.clickText('.page-actions .btn', 'This week');
    await ev(`(() => { const e = document.getElementById('week-capacity'); e.value = '3h'; e.dispatchEvent(new Event('change')); return true; })()`);
    await page.wait(600);
    const after = await recoveryBook();
    const monday = Object.keys(after.weeks).find(k => after.weeks[k].people?.[david.id] === 180);
    assert.ok(monday);
    assert.equal(after.items.find(t => t.title === 'Today task').owner, 'Supplier contact');
    assert.equal(after.items.find(t => t.title === 'Today task').assigneeId, david.id);
    assert.match(await text('.week-summary .meter-label'), /2h planned of 3h/);
  });

  await check('assignments: David report spans jobs, exports its selection and survives save/reload', async () => {
    const david = (await recoveryBook()).people.find(p => p.name === 'David');
    await fileMenu('New job');
    await page.type('Office assignments');
    await page.key('Tab', { keyCode: 9 });
    await page.wait(100);
    await page.key('Escape', { keyCode: 27 });
    await ev(`(() => { const e = document.getElementById('quick-assignee'); e.value = ${JSON.stringify(david.id)}; e.dispatchEvent(new Event('change')); return true; })()`);
    await quickAdd('Office David task');
    await fileMenu('All jobs');
    await nav(6);
    await ev(`(() => { const e = document.getElementById('assignment-person'); e.value = ${JSON.stringify(david.id)}; e.dispatchEvent(new Event('change')); return true; })()`);
    assert.match(await text('.assignments h1'), /David’s assignments/);
    assert.equal(await count('.assignment-group .row-item'), 2);
    assert.match(await text('.assignments'), /Kitchen UX/);
    assert.match(await text('.assignments'), /Office assignments/);
    await ev(`(() => { const e = document.getElementById('assignment-status'); e.value = 'done'; e.dispatchEvent(new Event('change')); return true; })()`);
    assert.equal(await count('.assignment-group .row-item'), 0);
    await ev(`(() => { const e = document.getElementById('assignment-status'); e.value = 'open'; e.dispatchEvent(new Event('change')); return true; })()`);
    await ev(`window.__assignmentBlobs = []; const original = URL.createObjectURL; URL.createObjectURL = b => { window.__assignmentBlobs.push(b); return original.call(URL, b); }; true`);
    await page.clickText('.assignments .btn', 'Export CSV');
    const csv = await ev('window.__assignmentBlobs.at(-1).text()');
    assert.match(csv, /Today task/);
    assert.match(csv, /Office David task/);
    assert.doesNotMatch(csv, /Measure kitchen/);
    writeFileSync(join(shots, 'assignments.csv'), csv);
    await page.screenshot(join(shots, '06-assignments.png'), { full: false });
    await page.send('Emulation.setEmulatedMedia', { media: 'print' });
    assert.equal(await ev('getComputedStyle(document.querySelector(".assignment-filter-panel")).display'), 'none');
    assert.equal(await ev('getComputedStyle(document.querySelector(".assignments .page-actions")).display'), 'none');
    assert.equal(await count('.assignment-group .row-item'), 2);
    await page.screenshot(join(shots, 'p6-assignments-print.png'), { full: false });
    await page.send('Emulation.setEmulatedMedia', { media: '' });
    await page.size(390, 844);
    await nav(6);
    assert.ok(await ev('document.documentElement.scrollWidth <= document.documentElement.clientWidth'));
    await page.screenshot(join(shots, 'm6-assignments-phone.png'), { full: false });
    await page.size(1440, 900);
    await page.key('s', { modifiers: 2, keyCode: 83 });
    await page.wait(400);
    assert.equal((await lastSaved()).people.find(p => p.id === david.id).name, 'David');
    await page.reload();
    await ev(STUB_FS);
    assert.match(await ev('document.querySelector(".nav-item.on").textContent.trim()'), /^Assignments/);
    assert.equal(await ev('document.getElementById("assignment-person").value'), david.id);
    assert.equal(await count('.assignment-group .row-item'), 2);
  });

  await check('relaunch restores the selected job, notes page and open job panel after navigation only', async () => {
    await page.click('.job-link');
    const selectedJob = await text('.job-link.on .job-name');
    await nav(5);
    await page.clickText('.tabs button', 'Working');
    await page.clickText('.focus-banner .btn', 'Edit job');
    const title = await ev('document.getElementById("d-title").value');
    await page.reload();
    await ev(STUB_FS);
    assert.equal(await text('.job-link.on .job-name'), selectedJob);
    assert.match(await ev('document.querySelector(".nav-item.on").textContent.trim()'), /^Notes/);
    assert.match(await ev('document.getElementById("note-text").getAttribute("aria-label")'), /Working/);
    assert.equal(await ev('document.getElementById("d-title").value'), title);
    await page.key('Escape', { keyCode: 27 });
  });

  await check('no page errors during the whole session', async () => assert.deepEqual(page.errors, []));

  // Visual checks at other sizes and themes.
  await ev('document.querySelector("#file-menu").click(); true');
  await page.clickText('.menu-item', 'Load example book');
  await page.size(390, 844);
  for (const [n, v] of [[1, 'today'], [2, 'week'], [3, 'plan']]) {
    await nav(n);
    await page.screenshot(join(shots, `m${n}-${v}-phone.png`), { full: false });
  }
  await check('no horizontal page overflow at phone width', async () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await nav(n);
      const over = await ev('document.documentElement.scrollWidth - document.documentElement.clientWidth');
      assert.ok(over <= 0, `view ${n} overflows by ${over}px`);
    }
  });
  await page.size(1440, 900);
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await nav(3);
  await page.screenshot(join(shots, 'd3-plan-dark.png'), { full: false });
  await nav(1);
  await page.clickText('.today-main .row-title', 'Compare methods');
  await page.screenshot(join(shots, 'd1-today-drawer-dark.png'), { full: false });
} finally {
  await page.close();
}

const failed = results.filter(r => !r[0]);
for (const [ok, name, why] of results) console.log(`${ok ? '✔' : '✖'} ${name}${why ? `\n    ${why}` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed. Screenshots: .e2e/`);
process.exit(failed.length ? 1 : 0);
