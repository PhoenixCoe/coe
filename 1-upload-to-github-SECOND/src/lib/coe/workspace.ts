/**
 * A project folder that belongs to one chat. Coe writes, edits, reads and runs files in it, shows a live preview,
 * and the person can download it as a zip or commit it to GitHub. It is text only, and it is kept with the chat.
 */
export type Files = Record<string, string>;
export const MAX_FILES = 120, MAX_TOTAL = 3_000_000, MAX_FILE = 600_000;

export const cleanPath = (p: unknown): string => {
  const s = String(p ?? '').replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/{2,}/g, '/').trim();
  if (!s || s.includes('..') || s.length > 160 || /[\0<>:"|?*]/.test(s)) throw new Error(`"${p}" is not a usable file name.`);
  return s;
};
const total = (f: Files) => Object.values(f).reduce((n, v) => n + v.length, 0);

export function writeFile(f: Files, path: unknown, content: unknown): Files {
  const p = cleanPath(path), c = String(content ?? '');
  if (c.length > MAX_FILE) throw new Error(`${p} is too big (the limit is ${MAX_FILE.toLocaleString()} characters).`);
  const next = { ...f, [p]: c };
  if (Object.keys(next).length > MAX_FILES) throw new Error(`A project can hold ${MAX_FILES} files.`);
  if (total(next) > MAX_TOTAL) throw new Error('The project is too big. Remove something first.');
  return next;
}
export function editFile(f: Files, path: unknown, find: unknown, replace: unknown): Files {
  const p = cleanPath(path); if (!(p in f)) throw new Error(`There is no file ${p}.`);
  const a = String(find ?? ''); if (!a) throw new Error('Say what text to find.');
  const n = f[p].split(a).length - 1;
  if (n === 0) throw new Error(`That text is not in ${p}. Read the file again and copy it exactly.`);
  if (n > 1) throw new Error(`That text appears ${n} times in ${p}. Include more around it so it is only once.`);
  return writeFile(f, p, f[p].replace(a, () => String(replace ?? '')));
}
export function removeFile(f: Files, path: unknown): Files { const p = cleanPath(path); if (!(p in f)) throw new Error(`There is no file ${p}.`); const n = { ...f }; delete n[p]; return n; }
export const listing = (f: Files) => { const k = Object.keys(f).sort(); return k.length ? k.map((p) => `${p} (${f[p].split('\n').length} lines)`).join('\n') : 'The project is empty.'; };
/** The folders and files as a picture made of text, so the model can see the layout. */
export function tree(f: Files): string {
  type N = { [k: string]: N | null };
  const root: N = {}; for (const p of Object.keys(f).sort()) { const bits = p.split('/'); let n = root; bits.forEach((b, i) => { if (b === '.keep') return; if (i === bits.length - 1) n[b] = null; else n = (n[b] ??= {}) as N; }); }
  const out: string[] = []; const walk = (n: N, pre: string) => { const ks = Object.keys(n).sort((a, b) => (n[a] ? 0 : 1) - (n[b] ? 0 : 1) || a.localeCompare(b)); ks.forEach((k, i) => { const last = i === ks.length - 1; out.push(pre + (last ? '└─ ' : '├─ ') + k + (n[k] ? '/' : '')); if (n[k]) walk(n[k] as N, pre + (last ? '   ' : '│  ')); }); };
  walk(root, ''); return out.join('\n') || 'Empty.';
}
export const hasFiles = (f?: Files) => !!f && Object.keys(f).length > 0;

const rel = (from: string, to: string) => {
  const t = to.replace(/^\.?\//, ''); if (/^(https?:|data:|\/\/)/.test(t)) return null;
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const parts = (dir + t.split(/[?#]/)[0]).split('/'); const out: string[] = [];
  for (const x of parts) { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); }
  return out.join('/');
};
/** One page that stands alone: the project's own style sheets, scripts and SVG pictures are put inside it. */
export function inlinePage(f: Files, entry: string): string {
  let h = f[entry] ?? '';
  h = h.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, (m) => { const href = (m.match(/href=(?:["']([^"']+)["']|([^\s>]+))/i) || []).slice(1).find(Boolean); const p = href && rel(entry, href); return p && f[p] !== undefined ? `<style>\n${f[p]}\n</style>` : m; });
  h = h.replace(/<script\b([^>]*)\bsrc=(?:["']([^"']+)["']|([^\s>]+))([^>]*)>\s*<\/script>/gi, (m, a, s1, s2, b) => { const src = s1 || s2; const p = rel(entry, src); return p && f[p] !== undefined ? `<script${a}${b}>\n${f[p].replace(/<\/script/gi, '<\\/script')}\n</script>` : m; });
  h = h.replace(/(<img\b[^>]*\bsrc=["'])([^"']+\.svg)(["'])/gi, (m, a, src, c) => { const p = rel(entry, src); return p && f[p] !== undefined ? a + 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(f[p]))) + c : m; });
  return h;
}
export const entryOf = (f: Files): string | null => (f['index.html'] ? 'index.html' : Object.keys(f).sort().find((p) => /\.html?$/i.test(p)) ?? null);

export async function zipFiles(f: Files): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const z = new JSZip(); for (const [p, c] of Object.entries(f)) z.file(p, c);
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
