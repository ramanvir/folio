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

const LAST_FILE_KEY = 'folio-last-file';
const THEME_KEY = 'folio-theme';
const SIDEBAR_KEY = 'folio-sidebar';

let tree = null;          // current folder tree (or null)
let current = null;       // { node, name, lastModified }

// ---------- Toasts ----------

function toast(message) {
  const el = document.createElement('div');
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
  const bg = effectiveTheme() === 'dark' ? '#1c1b1a' : '#faf9f7';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', bg);
  }
}

function toggleTheme() {
  localStorage.setItem(THEME_KEY, effectiveTheme() === 'dark' ? 'light' : 'dark');
  applyTheme();
}

// ---------- Sidebar ----------

function applySidebarState() {
  const collapsed = localStorage.getItem(SIDEBAR_KEY) === 'closed';
  document.body.classList.toggle('sidebar-collapsed', collapsed);
}

function toggleSidebar() {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem(SIDEBAR_KEY, collapsed ? 'closed' : 'open');
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
  document.title = 'Folio — Markdown Reader';
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
    sub.innerHTML = 'A quiet place to read your markdown.<br>Everything stays on your machine.';
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
  document.title = `${file.name} — Folio`;
  highlightCurrentInTree();
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
  applyTheme();
  applySidebarState();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  $('#theme-toggle').addEventListener('click', toggleTheme);
  $('#sidebar-toggle').addEventListener('click', toggleSidebar);
  $('#open-folder-btn').addEventListener('click', openFolder);
  $('#welcome-open-btn').addEventListener('click', openFolder);

  els.dirInput.addEventListener('change', () => {
    if (els.dirInput.files?.length) loadFolderFromFileList(els.dirInput.files);
    els.dirInput.value = '';
  });
  els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files?.[0]) openSingleFile(els.fileInput.files[0]);
    els.fileInput.value = '';
  });

  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'o') { e.preventDefault(); openFolder(); }
    else if (key === 'b') { e.preventDefault(); toggleSidebar(); }
  });

  window.addEventListener('focus', refreshCurrent);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshCurrent();
  });

  setupDragDrop();
  setupPwa();
  renderTree();
  tryRestore().then((restored) => {
    if (!restored) showWelcome();
  });
}

init();
