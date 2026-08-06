# Mull Reader

A lightweight, open-source, mobile-friendly markdown reader — built to consume knowledge created by AI agents, and just as happy with notes you wrote yourself. Installable as a PWA, with book-like typography, no build step, and no frameworks.

**Live:** https://ramanvir.github.io/Mull-Reader/

## Why

The challenge is no longer the availability of knowledge — AI agents produce it faster than anyone can keep up with. The challenge now is *understanding* it. And understanding cannot be outsourced: no agent can do the reading for you.

AI agents share what they know in markdown files, and we read on whatever is at hand — a phone in a queue, a tablet on the couch, a desktop at work. Mull Reader is a reading environment for exactly that — a place to mull things over. Grab a markdown file from wherever it landed (iCloud, Google Drive, a repo, an agent's output folder) and open it in a reader designed for focus, on any device.

**All documents remain local, always.** Files are read directly in your browser via the File System Access API; nothing is ever uploaded anywhere.

## Features

- **Open a folder** of `.md`/`.markdown` files (File System Access API) — the folder reconnects automatically on your next visit via a persisted handle in IndexedDB
- **Open a single file** without picking a folder — from the menu, the welcome screen, or `⇧⌘O`
- **File tree sidebar** showing only markdown files, with the current file highlighted; on phones it becomes a slide-over panel that starts closed, tucks away when you pick a file, and closes when you tap outside it
- **Contents panel** (h2/h3) on the right with scroll-spy; a permanent column on wide screens, a slide-over on narrow ones — plus hover anchor links on headings
- **Editorial typography** — serif body (Charter/Georgia stack) with 1.7 line height, styled blockquotes, zebra tables, inline-code pills, decorative horizontal rules
- **Text size controls** — A−/A+ in the topbar menu step the reading size through nine levels (14.5–32px), persisted
- **GFM rendering** via marked: tables, task lists, strikethrough, autolinks — sanitized with DOMPurify
- **Syntax highlighting** (highlight.js) with theme-aware colors and a copy button on every code block
- **Light & dark themes** — follows `prefers-color-scheme`, manual toggle persisted; dark is a warm dark gray, not pure black
- **E-ink mode** — a menu switch for a pure-grayscale, shadow-free, motion-free look suited to e-ink displays, with a reading progress % in the corner and justified, hyphenated text
- **Reader mode** — hides everything but the page, with progress % and justified text like e-ink mode; the topbar peeks back on hover (or scroll-up on touch), `Esc` exits
- **Live refresh** — the current file is re-read when the window regains focus, so external edits (say, from an agent still writing) show up
- **Drag & drop** a `.md` file (or a whole folder) anywhere on the window
- **Full offline support** — cache-first service worker that refreshes itself automatically when a new version deploys
- **File handler** — when installed, double-clicking a `.md` file can open it directly in Mull Reader (Chromium)
- Keyboard: `⌘/Ctrl+O` open folder, `⇧⌘/Ctrl+O` open file, `⌘/Ctrl+B` toggle sidebar

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
styles.css      all styling, light/dark/e-ink themes, responsive layout
js/app.js       UI orchestration, folder/file opening, PWA wiring
js/fs.js        File System Access + IndexedDB persistence + fallbacks
js/render.js    markdown → sanitized HTML, highlighting, TOC/scroll-spy
sw.js           cache-first service worker
manifest.json   PWA manifest (standalone, file handler)
```

## Contributing

Issues and pull requests are welcome. Keep the spirit of the project: no build step, no frameworks, no telemetry, and documents never leave the machine.

## License

[MIT](./LICENSE). Vendored libraries ([marked](https://github.com/markedjs/marked), [DOMPurify](https://github.com/cure53/DOMPurify), [highlight.js](https://github.com/highlightjs/highlight.js)) keep their own licenses.
