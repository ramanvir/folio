// File access helpers for single markdown files.

const MD_RE = /\.(md|markdown)$/i;

export function isMarkdownName(name) {
  return MD_RE.test(name);
}

// Node shape: { name, path, kind: 'file', handle?, file? } — handle when the
// file came from a picker/drop with the File System Access API, file when it
// arrived as a plain File (fallback input, drag-and-drop, launch queue).
export async function readNode(node) {
  const file = node.handle ? await node.handle.getFile() : node.file;
  const text = await file.text();
  return { file, text };
}
