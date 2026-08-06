import {
  supportsFS, isMarkdownName,
  saveDirHandle, loadDirHandle, clearDirHandle, verifyPermission,
  buildTree, treeFromFileList, findByPath, firstFile, readNode,
} from './fs.js';
import { renderMarkdownInto, buildToc } from './render.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  sidebar: $('#sidebar'),
  tree: $('#file-tree'),
  welcome: $('#welcome'),
  content: $('#content'),
  outline: $('#outline'),
  toc: $('#toc'),
  fileName: $('#current-file-name'),
  toastRoot: $('#toast-root'),
  dropVeil: $('#drop-veil'),
  dirInput: $('#dir-fallback-input'),
  fileInput: $('#file-fallback-input'),
};

// Storage keys keep their original 'folio-' names (the app's former name)
// so existing users' preferences survive the rename to Mull Reader.
const LAST_FILE_KEY = 'folio-last-file';
const THEME_KEY = 'folio-theme';
const SIDEBAR_KEY = 'folio-sidebar';
const OUTLINE_KEY = 'folio-outline';
const READER_KEY = 'folio-reader';
const EINK_KEY = 'folio-eink';
const TEXT_SIZE_KEY = 'folio-text-size';
const DIM_KEY = 'folio-brightness';

const PROSE_SIZES = [14.5, 16, 17.5, 19, 21, 23.5, 26, 29, 32];
const DEFAULT_SIZE_INDEX = 2;

// Software brightness: opacity of the black veil over the page, 0 = full brightness.
const DIM_LEVELS = [0, 0.12, 0.24, 0.36, 0.48, 0.6];

// Color temperature: multiply-blended tint from cold (blue) through neutral to
// warm (amber = blue-light filter) and on into red for night reading.
const TONE_KEY = 'folio-tone';
const TONE_LEVELS = [
  { c: '#8ab4ff', o: 0.39 },   // coldest
  { c: '#8ab4ff', o: 0.26 },
  { c: '#8ab4ff', o: 0.13 },
  { c: 'transparent', o: 0 },  // neutral
  { c: '#ffb45e', o: 0.18 },   // gentle warmth
  { c: '#ff9632', o: 0.3 },    // blue-light filter
  { c: '#ff9632', o: 0.45 },
  { c: '#ff5a1f', o: 0.5 },    // red-light
  { c: '#ff2d00', o: 0.6 },    // deepest night mode
];
const TONE_NEUTRAL_INDEX = 3;

let tree = null;          // current folder tree (or null)
let current = null;       // { node, name, lastModified }

// ---------- Toasts ----------

let activeToast = null;

function toast(message) {
  // Rate limit: while a toast with this exact message is showing (e.g. from
  // repeated taps on the topbar file name), don't stack another one.
  if (activeToast?.isConnected && activeToast.textContent === message) return;
  const el = document.createElement('div');
  activeToast = el;
  el.className = 'toast';
  el.textContent = message;
  els.toastRoot.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

// ---------- Theme ----------

function effectiveTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.dataset.theme = stored;
  } else {
    delete document.documentElement.dataset.theme;
  }
  const eink = document.documentElement.hasAttribute('data-eink');
  const bg = eink ? '#ffffff' : effectiveTheme() === 'dark' ? '#1c1b1a' : '#faf9f7';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', bg);
  }
}

function toggleTheme() {
  localStorage.setItem(THEME_KEY, effectiveTheme() === 'dark' ? 'light' : 'dark');
  applyTheme();
}

// ---------- E-ink mode ----------

function applyEink() {
  const on = localStorage.getItem(EINK_KEY) === 'on';
  document.documentElement.toggleAttribute('data-eink', on);
  $('#eink-toggle').setAttribute('aria-pressed', String(on));
  applyTheme();
  updateProgress();
}

function toggleEink() {
  localStorage.setItem(EINK_KEY, localStorage.getItem(EINK_KEY) === 'on' ? 'off' : 'on');
  applyEink();
}

// ---------- Text size ----------

function textSizeIndex() {
  const stored = parseInt(localStorage.getItem(TEXT_SIZE_KEY), 10);
  if (!Number.isInteger(stored)) return DEFAULT_SIZE_INDEX;
  return Math.min(Math.max(stored, 0), PROSE_SIZES.length - 1);
}

function applyTextSize() {
  const idx = textSizeIndex();
  document.documentElement.style.setProperty('--prose-size', `${PROSE_SIZES[idx]}px`);
  $('#font-dec').disabled = idx === 0;
  $('#font-inc').disabled = idx === PROSE_SIZES.length - 1;
}

function stepTextSize(delta) {
  localStorage.setItem(TEXT_SIZE_KEY, String(textSizeIndex() + delta));
  applyTextSize();
}

// ---------- Brightness (software dimmer) ----------

function dimIndex() {
  const stored = parseInt(localStorage.getItem(DIM_KEY), 10);
  if (!Number.isInteger(stored)) return 0;
  return Math.min(Math.max(stored, 0), DIM_LEVELS.length - 1);
}

function applyDim() {
  const idx = dimIndex();
  document.documentElement.style.setProperty('--dim', String(DIM_LEVELS[idx]));
  $('#dim-inc').disabled = idx === 0;
  $('#dim-dec').disabled = idx === DIM_LEVELS.length - 1;
}

// delta is in brightness terms: +1 brighter (less veil), -1 dimmer (more veil).
function stepDim(delta) {
  localStorage.setItem(DIM_KEY, String(dimIndex() - delta));
  applyDim();
}

// ---------- Color temperature (blue-light / red-light filter) ----------

function toneIndex() {
  const stored = parseInt(localStorage.getItem(TONE_KEY), 10);
  if (!Number.isInteger(stored)) return TONE_NEUTRAL_INDEX;
  return Math.min(Math.max(stored, 0), TONE_LEVELS.length - 1);
}

function applyTone() {
  const idx = toneIndex();
  const { c, o } = TONE_LEVELS[idx];
  document.documentElement.style.setProperty('--tone-color', c);
  document.documentElement.style.setProperty('--tone-opacity', String(o));
  $('#tone-dec').disabled = idx === 0;
  $('#tone-inc').disabled = idx === TONE_LEVELS.length - 1;
}

function stepTone(delta) {
  localStorage.setItem(TONE_KEY, String(toneIndex() + delta));
  applyTone();
}

// ---------- Sidebar ----------

const isPhone = () => matchMedia('(max-width: 720px)').matches;

function applySidebarState() {
  // On phones the sidebar is a fixed overlay that would cover the page,
  // so it always starts closed there regardless of the stored preference.
  const collapsed = isPhone() || localStorage.getItem(SIDEBAR_KEY) === 'closed';
  document.body.classList.toggle('sidebar-collapsed', collapsed);
}

function toggleSidebar() {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  // The two overlays would cover each other on a phone — opening one closes the other.
  if (!collapsed && isPhone() && !document.body.classList.contains('outline-collapsed')) {
    toggleOutline();
  }
  // Phone toggles are transient overlay show/hides — don't let them
  // overwrite the desktop preference.
  if (!isPhone()) localStorage.setItem(SIDEBAR_KEY, collapsed ? 'closed' : 'open');
}

// Below this width the outline is a fixed overlay rather than a column.
const isNarrow = () => matchMedia('(max-width: 1099px)').matches;

function applyOutlineState() {
  // Like the phone sidebar, the outline overlay always starts closed.
  const collapsed = isNarrow() || localStorage.getItem(OUTLINE_KEY) === 'closed';
  document.body.classList.toggle('outline-collapsed', collapsed);
}

function toggleOutline() {
  const collapsed = document.body.classList.toggle('outline-collapsed');
  if (!collapsed && isPhone() && !document.body.classList.contains('sidebar-collapsed')) {
    toggleSidebar();
  }
  if (!isNarrow()) localStorage.setItem(OUTLINE_KEY, collapsed ? 'closed' : 'open');
}

// ---------- Reader mode ----------

function applyReaderState() {
  const on = localStorage.getItem(READER_KEY) === 'on';
  document.body.classList.toggle('reader-mode', on);
  if (on) document.body.classList.add('reader-bar-show');
  $('#reader-toggle').setAttribute('aria-pressed', String(on));
  updateProgress();
}

function toggleReader() {
  localStorage.setItem(READER_KEY, localStorage.getItem(READER_KEY) === 'on' ? 'off' : 'on');
  applyReaderState();
}

// On touch screens the reader-mode topbar can't be revealed by hover, so it
// follows scroll: hidden while reading down, back when scrolling up or at the top.
function setupTouchReaderBar() {
  if (!matchMedia('(hover: none)').matches) return;
  let lastY = window.scrollY;
  document.body.classList.add('reader-bar-show');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y < 8 || y < lastY - 4) document.body.classList.add('reader-bar-show');
    else if (y > lastY + 4) document.body.classList.remove('reader-bar-show');
    lastY = y;
  }, { passive: true });
}

// ---------- Kindle-style reading aids ----------

const readingAidsActive = () =>
  document.documentElement.hasAttribute('data-eink') || document.body.classList.contains('reader-mode');

function updateProgress() {
  const el = $('#progress');
  const active = !els.content.hidden && readingAidsActive();
  el.hidden = !active;
  if (!active) return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  el.textContent = `${max > 0 ? Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100))) : 100}%`;
}

// ---------- File tree ----------

function renderTree() {
  els.tree.innerHTML = '';
  if (!tree || !tree.children.length) {
    const empty = document.createElement('div');
    empty.className = 'tree-empty';
    empty.textContent = tree ? 'No markdown files in this folder.' : 'No folder open.';
    els.tree.appendChild(empty);
    return;
  }
  const rootLabel = document.createElement('div');
  rootLabel.className = 'tree-root-name';
  rootLabel.textContent = tree.name || 'Files';
  els.tree.appendChild(rootLabel);
  els.tree.appendChild(renderChildren(tree));
  highlightCurrentInTree();
}

function renderChildren(dirNode) {
  const list = document.createElement('div');
  list.className = 'tree-children';
  for (const child of dirNode.children) {
    if (child.kind === 'dir') {
      const details = document.createElement('details');
      details.className = 'tree-dir';
      details.open = true;
      const summary = document.createElement('summary');
      summary.textContent = child.name;
      details.appendChild(summary);
      details.appendChild(renderChildren(child));
      list.appendChild(details);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tree-file';
      btn.textContent = child.name.replace(/\.(md|markdown)$/i, '');
      btn.dataset.path = child.path;
      btn.addEventListener('click', () => openNode(child));
      list.appendChild(btn);
    }
  }
  return list;
}

function highlightCurrentInTree() {
  const path = current?.node?.path;
  for (const btn of els.tree.querySelectorAll('.tree-file')) {
    const active = !!path && btn.dataset.path === path;
    btn.classList.toggle('active', active);
    if (active) {
      let parent = btn.parentElement;
      while (parent && parent !== els.tree) {
        if (parent.tagName === 'DETAILS') parent.open = true;
        parent = parent.parentElement;
      }
    }
  }
}

// ---------- Welcome / empty states ----------

function showWelcome(mode = 'default', dirName = '') {
  els.content.hidden = true;
  els.outline.hidden = true;
  els.welcome.hidden = false;
  els.fileName.textContent = '';
  els.fileName.removeAttribute('title');
  updateProgress();
  document.title = 'Mull Reader — Markdown Reader';
  const inner = els.welcome.querySelector('.welcome-inner');
  const cta = inner.querySelector('.cta');
  const sub = inner.querySelector('.welcome-sub');
  if (mode === 'reconnect') {
    sub.innerHTML = `Welcome back. Reconnect to <strong>${escapeHtml(dirName)}</strong> to keep reading.`;
    cta.textContent = `Reconnect “${dirName}”`;
  } else if (mode === 'empty-folder') {
    sub.textContent = 'That folder has no markdown files. Try another one.';
    cta.textContent = 'Open a folder';
  } else {
    sub.innerHTML = 'A lightweight, open-source markdown reader to consume knowledge created by AI agents. Mobile friendly, and all documents remain local, always. A progressive web app: install it and it works offline.';
    cta.textContent = 'Open a folder';
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Opening files ----------

async function openNode(node, { keepScroll = false } = {}) {
  let file, text;
  try {
    ({ file, text } = await readNode(node));
  } catch {
    toast(`Couldn't read “${node.name}”`);
    return;
  }
  current = { node, name: file.name, lastModified: file.lastModified };
  if (node.path) localStorage.setItem(LAST_FILE_KEY, node.path);

  const scrollY = keepScroll ? window.scrollY : 0;
  els.welcome.hidden = true;
  els.content.hidden = false;
  const headings = renderMarkdownInto(els.content, text);
  buildToc(els.toc, els.outline, headings);
  window.scrollTo(0, scrollY);

  els.fileName.textContent = file.name;
  els.fileName.title = node.path || file.name;
  document.title = `${file.name} — Mull Reader`;
  highlightCurrentInTree();
  updateProgress();

  // On phones the sidebar is a fixed overlay — tuck it away once a file is picked.
  if (isPhone() && !document.body.classList.contains('sidebar-collapsed')) {
    toggleSidebar();
  }
}

// A single file from drop / file-handler / fallback input (not part of a tree).
async function openSingleFile(fileOrHandle) {
  const node = fileOrHandle instanceof File
    ? { name: fileOrHandle.name, path: '', kind: 'file', file: fileOrHandle }
    : { name: fileOrHandle.name, path: '', kind: 'file', handle: fileOrHandle };
  if (!isMarkdownName(node.name)) {
    toast('That doesn’t look like a markdown file.');
    return;
  }
  await openNode(node);
}

async function openFile() {
  if (!('showOpenFilePicker' in window)) {
    els.fileInput.click();
    return;
  }
  let handle;
  try {
    [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
    });
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Couldn’t open that file.');
    return;
  }
  await openSingleFile(handle);
}

// ---------- Opening folders ----------

async function openFolder() {
  if (!supportsFS) {
    els.dirInput.click();
    return;
  }
  let handle;
  try {
    handle = await window.showDirectoryPicker({ mode: 'read' });
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Couldn’t open that folder.');
    return;
  }
  try {
    await saveDirHandle(handle);
  } catch { /* persistence is best-effort */ }
  await loadFolder(handle);
}

async function loadFolder(handle) {
  try {
    tree = await buildTree(handle);
  } catch {
    toast('Couldn’t read that folder.');
    return;
  }
  renderTree();
  const last = findByPath(tree, localStorage.getItem(LAST_FILE_KEY));
  const target = last || firstFile(tree);
  if (target) await openNode(target);
  else showWelcome('empty-folder');
}

function loadFolderFromFileList(fileList) {
  tree = treeFromFileList(fileList);
  renderTree();
  const target = firstFile(tree);
  if (target) openNode(target);
  else showWelcome('empty-folder');
}

// ---------- Startup reconnect ----------

async function tryRestore() {
  if (!supportsFS) return false;
  const saved = await loadDirHandle();
  if (!saved) return false;
  if (await verifyPermission(saved)) {
    await loadFolder(saved);
    return true;
  }
  // Permission needs a user gesture — offer a reconnect button.
  showWelcome('reconnect', saved.name);
  const cta = els.welcome.querySelector('.cta');
  cta.onclick = async (e) => {
    e.stopImmediatePropagation();
    if (await verifyPermission(saved, { ask: true })) {
      cta.onclick = null;
      await loadFolder(saved);
    } else {
      toast('Permission denied — pick the folder again.');
      cta.onclick = null;
      showWelcome();
      await clearDirHandle();
    }
  };
  return true;
}

// ---------- External-edit refresh ----------

async function refreshCurrent() {
  if (!current?.node?.handle) return;
  try {
    const file = await current.node.handle.getFile();
    if (file.lastModified === current.lastModified) return;
    await openNode(current.node, { keepScroll: true });
  } catch { /* file may have been deleted or permission revoked */ }
}

// ---------- Drag and drop ----------

let dragDepth = 0;

function setupDragDrop() {
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    els.dropVeil.hidden = false;
  });
  window.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) { dragDepth = 0; els.dropVeil.hidden = true; }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    els.dropVeil.hidden = true;
    const item = [...(e.dataTransfer?.items || [])].find((i) => i.kind === 'file');
    if (!item) return;
    // getAsFile() must be called synchronously, before any await invalidates the DataTransfer.
    const file = item.getAsFile();
    if (item.getAsFileSystemHandle) {
      try {
        const handle = await item.getAsFileSystemHandle();
        if (handle?.kind === 'directory') {
          try { await saveDirHandle(handle); } catch { /* best-effort */ }
          await loadFolder(handle);
          return;
        }
        if (handle?.kind === 'file') {
          await openSingleFile(handle);
          return;
        }
      } catch { /* fall through to the plain File */ }
    }
    if (file) await openSingleFile(file);
  });
}

// ---------- PWA: service worker + file handler ----------

function setupPwa() {
  if ('serviceWorker' in navigator) {
    // When an updated service worker takes over (skipWaiting + claim), reload
    // once so the page picks up the freshly cached assets instead of needing
    // a second manual refresh. Skipped on first-ever install (no previous
    // controller) so the initial visit doesn't flash.
    if (navigator.serviceWorker.controller) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
    }
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline still works next time */ });
  }
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files?.length) return;
      try {
        await openSingleFile(params.files[0]);
      } catch {
        toast('Couldn’t open the launched file.');
      }
    });
  }
}

// ---------- Wire-up ----------

function init() {
  applyEink();
  applySidebarState();
  applyOutlineState();
  applyReaderState();
  applyTextSize();
  applyDim();
  applyTone();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  matchMedia('(max-width: 720px)').addEventListener('change', applySidebarState);
  matchMedia('(max-width: 1099px)').addEventListener('change', applyOutlineState);

  const menu = $('#app-menu');
  const menuToggle = $('#menu-toggle');
  const setMenu = (open) => {
    menu.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
  };
  menuToggle.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', (e) => {
    // The size steppers stay open for repeated taps; any other choice closes the menu.
    if (e.target.closest('button') && !e.target.closest('#font-dec, #font-inc, #dim-dec, #dim-inc, #tone-dec, #tone-inc')) setMenu(false);
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('.menu-wrap')) setMenu(false);
  });

  $('#theme-toggle').addEventListener('click', toggleTheme);
  $('#eink-toggle').addEventListener('click', toggleEink);
  $('#reader-toggle').addEventListener('click', toggleReader);
  $('#sidebar-toggle').addEventListener('click', toggleSidebar);
  $('#outline-toggle').addEventListener('click', toggleOutline);
  // Tapping a contents link should tuck the overlay away so the reader
  // lands on the section, not behind the panel.
  els.toc.addEventListener('click', (e) => {
    if (e.target.closest('a') && isNarrow() && !document.body.classList.contains('outline-collapsed')) {
      toggleOutline();
    }
  });
  // Tapping anywhere outside an open overlay panel closes it. Only applies
  // at widths where the panel floats over the page, never to the columns.
  document.addEventListener('click', (e) => {
    if (isPhone() && !document.body.classList.contains('sidebar-collapsed')
        && !e.target.closest('#sidebar, #sidebar-toggle')) {
      toggleSidebar();
    }
    if (isNarrow() && !els.outline.hidden && !document.body.classList.contains('outline-collapsed')
        && !e.target.closest('#outline, #outline-toggle')) {
      toggleOutline();
    }
  });
  $('#font-dec').addEventListener('click', () => stepTextSize(-1));
  $('#font-inc').addEventListener('click', () => stepTextSize(1));
  $('#dim-dec').addEventListener('click', () => stepDim(-1));
  $('#dim-inc').addEventListener('click', () => stepDim(1));
  $('#tone-dec').addEventListener('click', () => stepTone(-1));
  $('#tone-inc').addEventListener('click', () => stepTone(1));
  $('#open-folder-btn').addEventListener('click', openFolder);
  $('#open-file-btn').addEventListener('click', openFile);
  // The topbar file name can truncate on narrow screens — tapping it shows
  // the full name (with its folder path when one is open) as a toast.
  els.fileName.addEventListener('click', () => {
    if (els.fileName.textContent) toast(current?.node?.path || els.fileName.textContent);
  });
  $('#welcome-open-btn').addEventListener('click', openFolder);
  $('#welcome-open-file-btn').addEventListener('click', openFile);

  els.dirInput.addEventListener('change', () => {
    if (els.dirInput.files?.length) loadFolderFromFileList(els.dirInput.files);
    els.dirInput.value = '';
  });
  els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files?.[0]) openSingleFile(els.fileInput.files[0]);
    els.fileInput.value = '';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setMenu(false);
      return;
    }
    if (e.key === 'Escape' && document.body.classList.contains('reader-mode')) {
      toggleReader();
      return;
    }
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'o') { e.preventDefault(); if (e.shiftKey) openFile(); else openFolder(); }
    else if (key === 'b') { e.preventDefault(); toggleSidebar(); }
  });

  window.addEventListener('focus', refreshCurrent);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshCurrent();
  });

  window.addEventListener('scroll', () => requestAnimationFrame(updateProgress), { passive: true });
  window.addEventListener('resize', updateProgress);

  setupDragDrop();
  setupTouchReaderBar();
  setupPwa();
  renderTree();
  tryRestore().then((restored) => {
    if (!restored) showWelcome();
  });
}

init();
