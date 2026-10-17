// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inline, markdownToHtml } from '../scripts/markdown.mjs';

const img = (src, alt) => `<img src="${src}" alt="${alt}">`;

test('inline: bold, italic, code, links as text, HTML escaped', () => {
  assert.equal(inline('**Save** then *wait*', img), '<strong>Save</strong> then <em>wait</em>');
  assert.equal(inline('type `*milestone` and `#sci`', img), 'type <code>*milestone</code> and <code>#sci</code>');
  assert.equal(inline('see [the repo](https://example.com)', img), 'see the repo', 'no links into the app');
  assert.equal(inline('a <script> & b', img), 'a &lt;script&gt; &amp; b');
  assert.equal(inline('**[** and **]**', img), '<strong>[</strong> and <strong>]</strong>');
});

test('blocks: headings with ids, nested lists, task lists, tables, images', () => {
  const md = '## Step 1 — Go\n\n1. First\n   - inner\n2. Second\n\n- [ ] Tick me\n\n| A | B |\n| --- | --- |\n| 1 | **2** |\n\n![Alt](img/x.png)\n';
  const { html, toc } = markdownToHtml(md, { image: (src, alt) => `<img src="DATA:${src}" alt="${alt}">` });
  assert.deepEqual(toc.map(t => t.id), ['g-step-1-go']);
  assert.match(html, /<ol><li>First<ul><li>inner<\/li><\/ul><\/li><li>Second<\/li><\/ol>/);
  assert.match(html, /<ul class="tasks"><li><span class="task-box" aria-hidden="true"><\/span>Tick me<\/li><\/ul>/);
  assert.match(html, /<th>A<\/th><th>B<\/th>.*<td>1<\/td><td><strong>2<\/strong><\/td>/s);
  assert.match(html, /<img src="DATA:img\/x.png" alt="Alt">/);
});

test('the real guide converts with every section, table and image', () => {
  const md = readFileSync(new URL('../docs/TUTORIAL.md', import.meta.url), 'utf8');
  const { html, toc } = markdownToHtml(md);
  assert.equal(toc.length, (md.match(/^## /gm) || []).length);
  assert.equal((html.match(/<table>/g) || []).length, (md.match(/^\| --- /gm) || []).length);
  assert.equal((html.match(/<img /g) || []).length, 3);
  assert.ok(!/href=/.test(html), 'no links in the bundled guide');
  assert.ok(!/\*\*|\]\(/.test(html.replace(/<code>.*?<\/code>/g, '')), 'no unconverted markdown left');
});
