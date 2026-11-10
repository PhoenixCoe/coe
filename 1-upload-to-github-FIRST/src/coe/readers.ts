/**
 * Reading files in for Coe: PDFs, Word, PowerPoint, Excel, zip folders and anything that is text.
 * Each is turned into plain words in the browser, so the file itself never leaves the device. Libraries load only when a file needs them.
 */
import type { Attach } from './store';

const TEXTY = /\.(txt|md|markdown|csv|tsv|json|jsonl|js|mjs|cjs|jsx|ts|tsx|py|rb|go|rs|java|kt|c|h|cc|cpp|hpp|cs|php|swift|sh|bash|zsh|ps1|sql|html?|css|scss|less|xml|svg|ya?ml|toml|ini|cfg|conf|env|log|tex|bib|r|lua|dart|vue|svelte|gradle|properties|gitignore|dockerfile|makefile|lock)$/i;
const SKIP_DIR = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|__pycache__|\.venv|venv|vendor|target)\//;
export const KINDS = '.pdf,.docx,.pptx,.xlsx,.zip,.txt,.md,.csv,.json,.html,.css,.js,.ts,.tsx,.py,.java,.c,.cpp,.go,.rs,.sql,.xml,.yml,.yaml,.log,.tsv';
export const isReadable = (f: File) => /\.(pdf|docx|pptx|xlsx|zip)$/i.test(f.name) || TEXTY.test(f.name) || /^text\//.test(f.type) || f.type === 'application/json';

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function zipOf(f: Blob) { const { default: JSZip } = await import('jszip'); return JSZip.loadAsync(f); }

async function pdf(file: File): Promise<string> {
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 400); i++) {
    const page = await doc.getPage(i), tc = await page.getTextContent();
    let line = '', y: number | null = null;
    for (const it of tc.items as { str?: string; transform?: number[]; hasEOL?: boolean }[]) {
      if (typeof it.str !== 'string') continue;
      const yy = it.transform ? Math.round(it.transform[5]) : null;
      if (y !== null && yy !== null && Math.abs(yy - y) > 3) line += '\n';
      line += it.str + (it.hasEOL ? '\n' : ''); if (yy !== null) y = yy;
    }
    out.push(`[Page ${i}]\n${line.trim()}`);
  }
  if (doc.numPages > 400) out.push(`[${doc.numPages - 400} more pages not read]`);
  return out.join('\n\n');
}

async function docx(file: Blob): Promise<string> {
  const z = await zipOf(file), x = await z.file('word/document.xml')?.async('string'); if (!x) throw new Error('That Word file could not be read.');
  return decode(x.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
}
async function pptx(file: Blob): Promise<string> {
  const z = await zipOf(file);
  const names = Object.keys(z.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)! - +b.match(/\d+/)!);
  const out: string[] = [];
  for (const [i, n] of names.entries()) { const x = await z.file(n)!.async('string'); out.push(`[Slide ${i + 1}]\n` + decode(x.replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{2,}/g, '\n').trim()); }
  return out.join('\n\n');
}
async function xlsx(file: Blob): Promise<string> {
  const z = await zipOf(file);
  const ss = await z.file('xl/sharedStrings.xml')?.async('string');
  const strings = ss ? [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, ''))) : [];
  const wb = (await z.file('xl/workbook.xml')?.async('string')) ?? '';
  const names = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => decode(m[1]));
  const sheets = Object.keys(z.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)! - +b.match(/\d+/)!);
  const out: string[] = [];
  for (const [i, n] of sheets.entries()) {
    const x = await z.file(n)!.async('string'); const rows: string[] = [];
    for (const r of x.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+)\d+"/.exec(c[1])?.[1] ?? '', t = /t="(\w+)"/.exec(c[1])?.[1], v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? '')?.[1], f = /<f[^>]*>([\s\S]*?)<\/f>/.exec(c[2] ?? '')?.[1];
        const idx = ref.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const val = t === 's' && v !== undefined ? strings[+v] ?? '' : t === 'inlineStr' ? decode((c[2] ?? '').replace(/<[^>]+>/g, '')) : v ?? '';
        while (cells.length < idx) cells.push(''); cells[idx] = decode(String(val)) + (f ? ` {=${decode(f)}}` : '');
      }
      rows.push(cells.join('\t'));
      if (rows.length >= 3000) break;
    }
    out.push(`[Sheet ${names[i] ?? i + 1}]\n${rows.join('\n')}`);
  }
  return out.join('\n\n');
}
async function zipFolder(file: Blob, budget: number): Promise<string> {
  const z = await zipOf(file); const out: string[] = []; let used = 0, skipped = 0;
  const names = Object.keys(z.files).filter((n) => !z.files[n].dir && !SKIP_DIR.test(n)).sort();
  out.push(`[Folder: ${names.length} files]\n` + names.slice(0, 400).join('\n'));
  for (const n of names) {
    if (!TEXTY.test(n) || used >= budget) { if (TEXTY.test(n)) skipped++; continue; }
    const t = await z.file(n)!.async('string'); if (t.includes('\u0000')) continue;
    const piece = `\n\n=== ${n} ===\n${t.slice(0, 40000)}`; out.push(piece); used += piece.length;
  }
  if (skipped) out.push(`\n[${skipped} more text files not included: the budget was used up]`);
  return out.join('');
}

/** A file's words, cut to the limit for the plan. */
export async function readAny(file: File, limit: number): Promise<Attach> {
  const n = file.name, ext = (n.split('.').pop() || '').toLowerCase();
  let text: string, kind: string;
  if (ext === 'pdf') { text = await pdf(file); kind = 'PDF'; }
  else if (ext === 'docx') { text = await docx(file); kind = 'Word'; }
  else if (ext === 'pptx') { text = await pptx(file); kind = 'PowerPoint'; }
  else if (ext === 'xlsx') { text = await xlsx(file); kind = 'Excel'; }
  else if (ext === 'zip') { text = await zipFolder(file, limit); kind = 'Zip'; }
  else { text = await file.text(); kind = 'Text'; if (text.includes('\u0000')) throw new Error(`${n} is not a text file.`); }
  text = text.replace(/\r\n/g, '\n');
  if (!text.trim()) throw new Error(`No words could be read from ${n}. It may be scanned pictures.`);
  const cut = text.length > limit;
  return { name: n, kind, chars: text.length, text: cut ? text.slice(0, limit) : text, cut: cut || undefined };
}
