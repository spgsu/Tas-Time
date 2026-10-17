// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Minimal Chrome DevTools Protocol driver for headless Edge/Chrome. No dependencies:
// uses Node's built-in fetch and WebSocket (Node 22+).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);

const wait = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ width = 1440, height = 900 } = {}) {
  const exe = CANDIDATES.find(p => existsSync(p));
  if (!exe) throw new Error('No Edge/Chrome found. Set BROWSER to a Chromium executable.');
  const profile = mkdtempSync(join(tmpdir(), 'tastime-e2e-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 80 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await wait(150); }
  }
  if (!targets) throw new Error('Browser did not start.');
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, m => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');

  const page = {
    errors,
    send,
    async size(w, h) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); },
    async goto(url) { await send('Page.navigate', { url }); await wait(900); },
    async reload() { await send('Page.reload'); await wait(900); },
    /** Evaluates an expression (or async IIFE body) in the page; throws on page exceptions. */
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async click(selector) {
      const ok = await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
      if (!ok) throw new Error(`No element for ${selector}`);
      await wait(60);
    },
    async clickText(selector, text) {
      const ok = await page.eval(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim().includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`);
      if (!ok) throw new Error(`No ${selector} containing "${text}"`);
      await wait(60);
    },
    /** Real keyboard input through the browser, so input/keydown handlers run as for a user. */
    async type(text) { await send('Input.insertText', { text }); await wait(30); },
    async key(key, { code = key, modifiers = 0, keyCode = 0 } = {}) {
      const base = { key, code, modifiers, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
      if (key.length === 1 && !modifiers) await send('Input.dispatchKeyEvent', { type: 'char', text: key, ...base });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await wait(40);
    },
    async mouse(type, x, y) { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }); },
    async box(selector) {
      return page.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    },
    async screenshot(path, { full = true } = {}) {
      if (full) {
        const height = await page.eval('Math.max(document.documentElement.scrollHeight, document.getElementById("main")?.scrollHeight + 60 || 0)');
        await page.size(page.width, Math.min(Math.max(page.height, height), 4000));
      }
      await wait(250);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(r.data, 'base64'));
      if (full) await page.size(page.width, page.height);
    },
    wait,
    width, height,
    async close() {
      try { ws.close(); } catch { /* already closed */ }
      proc.kill();
      await wait(300);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* browser may still hold files */ }
    },
  };
  await page.size(width, height);
  return page;
}
