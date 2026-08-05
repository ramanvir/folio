# Folio

A local markdown reader with beautiful, book-like typography — built as an installable PWA with no build step and no frameworks. Your files never leave your machine.

**Live:** https://ramanvir.github.io/folio/

## Features

- **Open a folder** of `.md`/`.markdown` files (File System Access API) — the folder reconnects automatically on your next visit via a persisted handle in IndexedDB
- **Open a single file** without picking a folder — from the topbar, the welcome screen, or `⇧⌘O`
- **File tree sidebar** showing only markdown files, collapsible, with the current file highlighted (state remembered)
- **Editorial typography** — serif body (Charter/Georgia stack) at ~17.5px with 1.7 line height, styled blockquotes, zebra tables, inline-code pills, decorative horizontal rules
- **GFM rendering** via marked: tables, task lists, strikethrough, autolinks — sanitized with DOMPurify
- **Syntax highlighting** (highlight.js) with theme-aware colors and a copy button on every code block
- **Floating table of contents** (h2/h3) on wide screens with scroll-spy, plus hover anchor links on headings
- **Light & dark themes** — follows `prefers-color-scheme`, manual toggle persisted; dark is a warm dark gray, not pure black
- **Live refresh** — the current file is re-read when the window regains focus, so external edits show up
- **Drag & drop** a `.md` file (or a whole folder) anywhere on the window
- **Full offline support** — cache-first service worker for the app shell
- **File handler** — when installed, double-clicking a `.md` file can open it directly in Folio (Chromium)
- Keyboard: `⌘/Ctrl+O` open folder, `⇧⌘/Ctrl+O` open file, `⌘/Ctrl+B` toggle sidebar
- **Social cards & icons** — Open Graph/Twitter meta tags with a generated `og-image.png`, plus PNG favicon and apple-touch-icon fallbacks alongside the SVG icons

## Browser support

Fully featured in Chrome and Edge. Firefox and Safari fall back to a directory `<input>` picker (no persistent reconnect, no file handling) — reading, rendering, themes, and offline all still work.

## Development

It's a static site — serve the folder and open it:

```sh
python3 -m http.server 8123
# → http://localhost:8123
```

No dependencies to install; marked, DOMPurify, and highlight.js are vendored in `vendor/`.

When changing any app-shell file, bump the `CACHE` version in `sw.js` so installed clients pick up the update.

## Files

```
index.html      app shell
styles.css      all styling, light/dark themes
js/app.js       UI orchestration, folder/file opening, PWA wiring
js/fs.js        File System Access + IndexedDB persistence + fallbacks
js/render.js    markdown → sanitized HTML, highlighting, TOC/scroll-spy
sw.js           cache-first service worker
manifest.json   PWA manifest (standalone, file handler)
```
