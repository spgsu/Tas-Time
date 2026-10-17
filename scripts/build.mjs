// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Bundles src/ into dist/: one offline HTML file plus the Edge app-window launcher.
//
// The bundler is deliberately tiny: modules share one scope in dependency order,
// with `import` lines removed and `export` keywords stripped. That only works if
// every top-level name is unique across modules, so duplicates fail the build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const entry = join(src, 'ui', 'main.js');
const outDir = join(root, 'dist');

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)';\s*$/;

function collect(file, order = [], seen = new Set()) {
  if (seen.has(file)) return order;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  for (const line of source.split('\n')) {
    if (!line.startsWith('import')) continue;
    const m = line.trim().match(IMPORT_RE);
    if (!m) throw new Error(`${relative(root, file)}: unsupported import form: ${line.trim()}`);
    if (/\bas\b/.test(m[1])) throw new Error(`${relative(root, file)}: import aliases are not supported by the bundler.`);
    collect(resolve(dirname(file), m[2]), order, seen);
  }
  order.push(file);
  return order;
}

function strip(file) {
  const source = readFileSync(file, 'utf8');
  if (/^export\s+default\b/m.test(source)) throw new Error(`${relative(root, file)}: default exports are not supported.`);
  return source
    .split('\n')
    .filter(line => !line.startsWith('import ') && !line.startsWith('// Copyright (c)'))
    .map(line => line.replace(/^export\s+(?=(async\s+)?function|const|let|class)/, ''))
    .join('\n');
}

function topLevelNames(code) {
  const names = [];
  for (const m of code.matchAll(/^(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)|(?:const|let|class)\s+([A-Za-z_$][\w$]*))/gm)) names.push(m[1] || m[2]);
  return names;
}

const files = collect(entry);
const seenNames = new Map();
const parts = [];
for (const file of files) {
  const code = strip(file);
  for (const name of topLevelNames(code)) {
    if (seenNames.has(name)) throw new Error(`Top-level name "${name}" is declared in both ${seenNames.get(name)} and ${relative(root, file)}.`);
    seenNames.set(name, relative(root, file));
  }
  parts.push(`// ── ${relative(src, file).replaceAll('\\', '/')} ──\n${code.trim()}\n`);
}
const script = `(() => {\n'use strict';\n${parts.join('\n')}\n})();`;
if (/<\/script/i.test(script)) throw new Error('Bundled script contains a closing script tag.');

const css = readFileSync(join(src, 'styles.css'), 'utf8');
const license = readFileSync(join(root, 'LICENSE'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const template = readFileSync(join(src, 'index.html'), 'utf8');
const html = template
  .replace('/*STYLES*/', () => css)
  .replace('/*SCRIPT*/', () => script)
  .replace('<!--LICENSE-->', () => `<!--\n${license.trim()}\n-->`)
  .replaceAll('{{VERSION}}', pkg.version);

for (const marker of ['/*STYLES*/', '/*SCRIPT*/', '<!--LICENSE-->', '{{VERSION}}']) {
  if (html.includes(marker)) throw new Error(`Template marker ${marker} was not replaced.`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'Tas-Time.html'), html);
writeFileSync(join(outDir, 'Open Tas-Time.cmd'), readFileSync(join(root, 'launcher', 'Open Tas-Time.cmd'), 'utf8').replace(/\r?\n/g, '\r\n'));
console.log(`Built dist/Tas-Time.html (${(html.length / 1024).toFixed(1)} KB, ${files.length} modules) and dist/Open Tas-Time.cmd`);
