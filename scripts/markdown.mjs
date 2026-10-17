// Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
// Minimal Markdown → HTML for the bundled beginner's guide (build time only).
// Supports the subset the guide uses: headings, paragraphs, bold/italic/code, images,
// ordered/unordered/task lists (nested by indentation), pipe tables and rules.
// Links are rendered as their text only: the app never navigates online.

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slug(text) {
  return 'g-' + text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Inline formatting. `image(src, alt)` returns the <img> HTML for an image reference. */
export function inline(text, image) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => image(src, alt));
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label) => label);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
}

const LIST_RE = /^(\s*)(\d+\.|-)\s+(\[[ xX]\]\s+)?(.*)$/;

export function markdownToHtml(md, { image = (src, alt) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">` } = {}) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const toc = [];
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), image)}</p>`); para = []; } };
  const fmt = t => inline(t, image);

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { flushPara(); i++; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      const html = fmt(h[2]);
      const id = slug(html);
      if (level === 2) toc.push({ id, html });
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      i++; continue;
    }

    if (/^-{3,}\s*$/.test(line)) { flushPara(); out.push('<hr>'); i++; continue; }

    if (line.trim().startsWith('|')) {
      flushPara();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const [head, , ...body] = rows;
      out.push('<div class="table-wrap"><table><thead><tr>' + cells(head).map(c => `<th>${fmt(c)}</th>`).join('') + '</tr></thead><tbody>'
        + body.map(r => '<tr>' + cells(r).map(c => `<td>${fmt(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }

    if (LIST_RE.test(line)) {
      flushPara();
      // Stack of open lists by indentation; items close when a shallower item appears.
      const stack = [];
      let html = '';
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const [, indent, marker, task, text] = lines[i].match(LIST_RE);
        const depth = indent.length;
        const tag = marker === '-' ? 'ul' : 'ol';
        while (stack.length && depth < stack.at(-1).depth) html += `</li></${stack.pop().tag}>`;
        if (!stack.length || depth > stack.at(-1).depth) {
          stack.push({ depth, tag });
          html += `<${tag}${task ? ' class="tasks"' : ''}>`;
        } else html += '</li>';
        const box = task ? `<span class="task-box${/x/i.test(task) ? ' on' : ''}" aria-hidden="true"></span>` : '';
        html += `<li>${box}${fmt(text)}`;
        i++;
      }
      while (stack.length) html += `</li></${stack.pop().tag}>`;
      out.push(html);
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara();
  return { html: out.join('\n'), toc };
}
