// Markdown rendering: marked (GFM) → DOMPurify → enhancements
// (heading anchors, syntax highlighting, copy buttons, TOC data).

/* global marked, DOMPurify, hljs */

marked.use({ gfm: true, breaks: false });

// YAML frontmatter (--- ... ---) is metadata, not content — agent-written
// files often start with it, and marked would render the fences as a
// horizontal rule plus a stray heading.
function stripFrontmatter(text) {
  const m = text.match(/^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  return m ? text.slice(m[0].length) : text;
}

export function renderMarkdownInto(container, text) {
  const raw = marked.parse(stripFrontmatter(text));
  container.innerHTML = DOMPurify.sanitize(raw);
  addHeadingAnchors(container);
  highlightCode(container);
  markTaskLists(container);
  return collectHeadings(container);
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || 'section';
}

function addHeadingAnchors(container) {
  const used = new Map();
  for (const h of container.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    let id = slugify(h.textContent);
    const n = used.get(id) || 0;
    used.set(id, n + 1);
    if (n > 0) id = `${id}-${n}`;
    h.id = id;
    const a = document.createElement('a');
    a.className = 'h-anchor';
    a.href = `#${id}`;
    a.textContent = '#';
    a.setAttribute('aria-label', 'Link to this section');
    h.appendChild(a);
  }
}

function highlightCode(container) {
  for (const code of container.querySelectorAll('pre > code')) {
    try {
      hljs.highlightElement(code);
    } catch { /* unknown language — leave as plain text */ }
    wrapWithCopyButton(code.parentElement);
  }
}

function wrapWithCopyButton(pre) {
  const wrap = document.createElement('div');
  wrap.className = 'codeblock';
  pre.parentNode.insertBefore(wrap, pre);
  wrap.appendChild(pre);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy-btn';
  btn.textContent = 'Copy';
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector('code').innerText);
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 1600);
    } catch {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    }
  });
  wrap.appendChild(btn);
}

function markTaskLists(container) {
  for (const input of container.querySelectorAll('li > input[type="checkbox"]')) {
    input.closest('li').classList.add('task-item');
    input.closest('ul')?.classList.add('task-list');
  }
}

function collectHeadings(container) {
  return [...container.querySelectorAll('h2, h3')].map((h) => ({
    id: h.id,
    level: Number(h.tagName[1]),
    text: h.textContent.replace(/#$/, '').trim(),
    el: h,
  }));
}

// ---------- Table of contents + scroll-spy ----------

let spyObserver = null;

export function buildToc(tocEl, outlineEl, headings) {
  tocEl.innerHTML = '';
  if (spyObserver) { spyObserver.disconnect(); spyObserver = null; }

  if (headings.length < 2) {
    outlineEl.hidden = true;
    return;
  }
  outlineEl.hidden = false;

  const links = new Map();
  for (const h of headings) {
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.text;
    a.className = `toc-link toc-h${h.level}`;
    tocEl.appendChild(a);
    links.set(h.id, a);
  }

  const visible = new Set();
  const setActive = (id) => {
    for (const [key, a] of links) a.classList.toggle('active', key === id);
  };

  spyObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      if (visible.size) {
        // Highlight the topmost visible heading.
        const first = headings.find((h) => visible.has(h.id));
        if (first) setActive(first.id);
      } else {
        // Nothing in view: highlight the last heading above the viewport.
        let last = null;
        for (const h of headings) {
          if (h.el.getBoundingClientRect().top < 120) last = h;
        }
        if (last) setActive(last.id);
      }
    },
    { rootMargin: '-64px 0px -60% 0px' }
  );
  for (const h of headings) spyObserver.observe(h.el);
}
