/**
 * Documents that Coe and the person work on together in the editor beside the chat: a Word-style document, code, a web page, a table.
 * They are kept with the chat (Conv.docs). This file is only data and text handling; the editor itself is src/coe/Editor.tsx.
 */
import type { UiName } from '@/ui/icons';

export type EKind = 'doc' | 'code' | 'web' | 'data';
export interface EDoc {
  id: string; kind: EKind; title: string;
  /** A document is clean HTML. Code, a web page and data are plain text. */
  text: string;
  lang?: string; by: 'you' | 'coe'; at: number;
  /** Goes up when Coe changes the document, so the editor draws it again. Typing does not change it. */
  rev: number;
  /** What the text was before Coe's last change, so the person can undo it. */
  prev?: string;
  /** The code in the chat this was made from. */
  src?: string;
}

export const KINDS: Record<EKind, { name: string; icon: UiName; ext: string; hint: string }> = {
  doc: { name: 'Document', icon: 'note', ext: 'docx', hint: 'Essays, letters, reports, notes' },
  code: { name: 'Code', icon: 'code', ext: 'txt', hint: 'Python, JavaScript, anything' },
  web: { name: 'Web page', icon: 'screen', ext: 'html', hint: 'HTML with a live preview' },
  data: { name: 'Table', icon: 'table', ext: 'csv', hint: 'Rows and columns: CSV or JSON' },
};

export const STARTER_WEB = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My page</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fbf6ec; color: #171717; text-align: center; }
  button { font: inherit; padding: 10px 18px; border: 3px solid #171717; background: #b49a57; cursor: pointer; }
</style>
</head>
<body>
  <main>
    <h1>Hello!</h1>
    <p>Change this page and watch the preview.</p>
    <button onclick="this.textContent = 'Clicked!'">Click me</button>
  </main>
</body>
</html>
`;
export const STARTER: Record<EKind, string> = { doc: '<p><br></p>', code: '', web: STARTER_WEB, data: 'Name,Score\nAda,9\nGrace,10\n' };

/** Which kind of editor suits some code: a page for HTML, a table for CSV, otherwise code. */
export const kindForLang = (label: string, lang: string): EKind => (lang === 'html' || /^(html?|xhtml|svg)$/i.test(label.trim()) ? 'web' : /^(csv|tsv)$/i.test(label.trim()) ? 'data' : 'code');
export const newId = (docs: EDoc[]): string => { for (;;) { const id = 'e' + Math.random().toString(36).slice(2, 6); if (!docs.some((d) => d.id === id)) return id; } };
export const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ');

export function makeDoc(kind: EKind, docs: EDoc[], o: { title?: string; text?: string; lang?: string; by?: 'you' | 'coe'; src?: string } = {}): EDoc {
  const same = docs.filter((d) => d.kind === kind).length;
  const base = o.title?.trim() || `${KINDS[kind].name} ${same + 1}`;
  return { id: newId(docs), kind, title: base.slice(0, 80), text: o.text ?? STARTER[kind], lang: o.lang ?? (kind === 'web' ? 'html' : kind === 'code' ? 'javascript' : undefined), by: o.by ?? 'you', at: Date.now(), rev: 0, src: o.src };
}

/** Finds a document by its id, its title, or a part of its title. */
export function findDoc(docs: EDoc[], ref: unknown): EDoc | undefined {
  const r = String(ref ?? '').trim().toLowerCase(); if (!r) return docs.length === 1 ? docs[0] : undefined;
  const byId = docs.find((d) => d.id.toLowerCase() === r); if (byId) return byId;
  const exact = docs.find((d) => d.title.toLowerCase() === r); if (exact) return exact;
  const part = docs.filter((d) => d.title.toLowerCase().includes(r)); return part.length === 1 ? part[0] : undefined;
}

// ---------------------------------------------------------------- documents are HTML: only the things a word processor makes
const TAGS = ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'blockquote', 'a', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'hr', 'span', 'div', 'sub', 'sup', 'code', 'pre', 'mark'];
const STYLE_OK = new Set(['color', 'background-color', 'text-align', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'font-size', 'font-family']);
type Purify = typeof import('dompurify')['default'];
let purify: Purify | null = null;
async function sanitizer(): Promise<Purify> {
  if (purify) return purify;
  const p = (await import('dompurify')).default;
  p.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.hasAttribute && node.hasAttribute('style')) {
      const st = (node as HTMLElement).style, keep: string[] = [];
      for (let i = 0; i < st.length; i++) { const k = st[i], v = st.getPropertyValue(k); if (STYLE_OK.has(k) && !/url\(|expression|javascript:|var\(|@import/i.test(v)) keep.push(`${k}:${v}`); }
      if (keep.length) node.setAttribute('style', keep.join(';')); else node.removeAttribute('style');
    }
    if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
  });
  return (purify = p);
}
/** Safe HTML for a document: nothing that can run, only the formatting a word processor makes. */
export async function cleanHtml(html: string): Promise<string> {
  const p = await sanitizer();
  return p.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'colspan', 'rowspan'], ALLOW_DATA_ATTR: false });
}
const LOOKS_HTML = /<(p|h[1-6]|ul|ol|li|table|div|br|strong|em|blockquote)\b/i;
/** What Coe writes (Markdown or HTML) as a clean document. */
export async function toDocHtml(content: string): Promise<string> {
  const t = content.trim(); if (!t) return '<p><br></p>';
  if (LOOKS_HTML.test(t)) return (await cleanHtml(t)) || '<p><br></p>';
  const { marked } = await import('marked');
  return (await cleanHtml(marked.parse(t, { async: false, gfm: true }) as string)) || '<p><br></p>';
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
/** A document as plain text with its structure (# headings, - lists, | tables |), which is what Coe reads. */
export function docText(html: string): string {
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out: { t: string; list: boolean }[] = [];
  const walk = (el: Element) => {
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 3) { const t = squash(c.textContent ?? ''); if (t) out.push({ t, list: false }); continue; }
      if (!(c instanceof Element)) continue;
      const tag = c.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) out.push({ t: '#'.repeat(Number(tag[1])) + ' ' + squash(c.textContent ?? ''), list: false });
      else if (tag === 'ul' || tag === 'ol') Array.from(c.children).forEach((li, i) => out.push({ t: (tag === 'ol' ? `${i + 1}. ` : '- ') + squash(li.textContent ?? ''), list: true }));
      else if (tag === 'blockquote') out.push({ t: '> ' + squash(c.textContent ?? ''), list: false });
      else if (tag === 'hr') out.push({ t: '---', list: false });
      else if (tag === 'table') Array.from(c.querySelectorAll('tr')).forEach((r) => out.push({ t: '| ' + Array.from(r.children).map((x) => squash(x.textContent ?? '')).join(' | ') + ' |', list: true }));
      else if (c.querySelector('p,div,h1,h2,h3,h4,ul,ol,table,blockquote')) walk(c);
      else { const t = squash(c.textContent ?? ''); if (t) out.push({ t, list: false }); }
    }
  };
  walk(d.body);
  return out.map((x, i) => (i && !(x.list && out[i - 1].list) ? '\n\n' : i ? '\n' : '') + x.t).join('');
}
export const plainOf = (html: string) => { const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html'); return (d.body.textContent ?? '').replace(/ /g, ' '); };
export const countWords = (s: string) => { const m = s.trim().match(/[\p{L}\p{N}'’-]+/gu); return m ? m.length : 0; };
export const wordsInDoc = (d: EDoc) => countWords(d.kind === 'doc' ? plainOf(d.text) : d.text);

function textNodes(root: Node): Text[] { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const out: Text[] = []; for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n as Text); return out; }
export type Replaced = { html: string; n: number } | { error: string };
/** Changes text inside a document. `all` changes every match; otherwise the text must be in exactly one place. */
export function replaceInDoc(html: string, find: string, rep: string, all = false, matchCase = true): Replaced {
  if (!find) return { error: 'Say which text to find.' };
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const nodes = textNodes(d.body);
  const flags = matchCase ? 'g' : 'gi', re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  let n = 0; for (const t of nodes) n += (t.data.match(re) ?? []).length;
  if (n === 0) return { error: (d.body.textContent ?? '').toLowerCase().includes(find.toLowerCase()) ? 'That text is split across different formatting (bold, a link, a new paragraph), so it could not be matched. Use a shorter piece that sits in one place, or use rewrite.' : 'That text is not in the document. Read it again and copy the words exactly.' };
  if (!all && n > 1) return { error: `That text appears ${n} times. Add more of the words around it so it is in one place only.` };
  for (const t of nodes) { const next = t.data.replace(re, () => rep); if (next !== t.data) t.data = next; }
  return { html: d.body.innerHTML, n };
}

// ---------------------------------------------------------------- the file a document leaves as
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PAGE_CSS = 'body{font:12pt/1.55 Georgia,"Times New Roman",serif;max-width:760px;margin:40px auto;padding:0 24px;color:#111}h1{font-size:24pt}h2{font-size:18pt}h3{font-size:14pt}table{border-collapse:collapse}td,th{border:1px solid #888;padding:4px 8px}blockquote{margin:1em 0;padding-left:14px;border-left:4px solid #aaa;color:#444}';
export const docPage = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body>${body}</body></html>`;

/** A real .docx (it opens in Word, Pages and Google Docs). */
export async function docxBlob(title: string, html: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const X = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  interface F { b?: boolean; i?: boolean; u?: boolean; s?: boolean; color?: string }
  let nextNum = 3; const extraNums: number[] = [];
  const hex = (c: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); if (m) return m[1].toUpperCase(); const r = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c); return r ? [r[1], r[2], r[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase() : ''; };
  const run = (text: string, f: F) => `<w:r><w:rPr>${f.b ? '<w:b/>' : ''}${f.i ? '<w:i/>' : ''}${f.s ? '<w:strike/>' : ''}${f.u ? '<w:u w:val="single"/>' : ''}${f.color ? `<w:color w:val="${f.color}"/>` : ''}</w:rPr><w:t xml:space="preserve">${X(text)}</w:t></w:r>`;
  const inline = (n: Node, f: F): string => {
    if (n.nodeType === 3) { const t = (n.textContent ?? '').replace(/ /g, ' '); return t ? run(t, f) : ''; }
    if (!(n instanceof Element)) return '';
    const tag = n.tagName.toLowerCase(); if (tag === 'br') return '<w:r><w:br/></w:r>';
    const g: F = { ...f }; const st = (n as HTMLElement).style;
    if (tag === 'strong' || tag === 'b' || (st && (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600))) g.b = true;
    if (tag === 'em' || tag === 'i' || (st && st.fontStyle === 'italic')) g.i = true;
    if (tag === 'u' || (st && /underline/.test(st.textDecorationLine || st.textDecoration))) g.u = true;
    if (tag === 's' || tag === 'strike' || tag === 'del' || (st && /line-through/.test(st.textDecorationLine || st.textDecoration))) g.s = true;
    if (tag === 'a') { g.u = true; g.color = '0563C1'; }
    if (st && st.color) { const h = hex(st.color); if (h) g.color = h; }
    return Array.from(n.childNodes).map((c) => inline(c, g)).join('');
  };
  const jc = (el: Element) => { const a = (el as HTMLElement).style?.textAlign; return a === 'center' || a === 'right' ? `<w:jc w:val="${a}"/>` : a === 'justify' ? '<w:jc w:val="both"/>' : ''; };
  const para = (el: Element, style = '', extra = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}${jc(el)}</w:pPr>${Array.from(el.childNodes).map((c) => inline(c, {})).join('')}</w:p>`;
  const list = (el: Element, ordered: boolean, depth: number): string => {
    const id = ordered ? nextNum++ : 1; if (ordered) extraNums.push(id);
    let out = '';
    for (const li of Array.from(el.children)) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      const own = document.createElement('p'); Array.from(li.childNodes).forEach((c) => { if (!(c instanceof Element && /^(ul|ol)$/i.test(c.tagName))) own.appendChild(c.cloneNode(true)); });
      out += `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${Math.min(depth, 8)}"/><w:numId w:val="${id}"/></w:numPr></w:pPr>${Array.from(own.childNodes).map((c) => inline(c, {})).join('')}</w:p>`;
      Array.from(li.children).forEach((c) => { if (/^(ul|ol)$/i.test(c.tagName)) out += list(c, c.tagName.toLowerCase() === 'ol', depth + 1); });
    }
    return out;
  };
  const table = (el: Element): string => {
    const rows = Array.from(el.querySelectorAll('tr')).map((tr) => `<w:tr>${Array.from(tr.children).map((c) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${Array.from(c.childNodes).map((x) => inline(x, c.tagName.toLowerCase() === 'th' ? { b: true } : {})).join('')}</w:p></w:tc>`).join('')}</w:tr>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="888888"/>`).join('')}</w:tblBorders></w:tblPr>${rows}</w:tbl><w:p/>`;
  };
  const blocks = (root: Element): string => {
    let out = '', loose = '';
    const flush = () => { if (loose.trim()) out += `<w:p>${loose}</w:p>`; loose = ''; };
    for (const c of Array.from(root.childNodes)) {
      if (c.nodeType === 3) { loose += inline(c, {}); continue; }
      if (!(c instanceof Element)) continue;
      const tag = c.tagName.toLowerCase();
      if (/^h[1-4]$/.test(tag)) { flush(); out += para(c, 'Heading' + Math.min(3, Number(tag[1]))); }
      else if (tag === 'p') { flush(); out += para(c); }
      else if (tag === 'ul' || tag === 'ol') { flush(); out += list(c, tag === 'ol', 0); }
      else if (tag === 'blockquote') { flush(); out += para(c, 'Quote'); }
      else if (tag === 'table') { flush(); out += table(c); }
      else if (tag === 'hr') { flush(); out += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="888888"/></w:pBdr></w:pPr></w:p>'; }
      else if (tag === 'div' && c.querySelector('p,div,h1,h2,h3,h4,ul,ol,table,blockquote')) { flush(); out += blocks(c); }
      else if (tag === 'div') { flush(); out += para(c); }
      else loose += inline(c, {});
    }
    flush(); return out;
  };
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const body = blocks(d.body) || '<w:p/>';
  const bullets = '<w:abstractNum w:abstractNumId="0">' + Array.from({ length: 9 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${['•', '◦', '▪'][i % 3]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + i * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join('') + '</w:abstractNum>';
  const decimals = '<w:abstractNum w:abstractNumId="1">' + Array.from({ length: 9 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${['decimal', 'lowerLetter', 'lowerRoman'][i % 3]}"/><w:lvlText w:val="%${i + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + i * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join('') + '</w:abstractNum>';
  const nums = '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' + extraNums.map((n) => `<w:num w:numId="${n}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('');
  const style = (id: string, name: string, rpr: string, ppr = '', based = 'Normal') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${based}"/><w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
    + style('Heading1', 'heading 1', '<w:b/><w:sz w:val="40"/>', '<w:keepNext/><w:spacing w:before="320" w:after="120"/>') + style('Heading2', 'heading 2', '<w:b/><w:sz w:val="32"/>', '<w:keepNext/><w:spacing w:before="240" w:after="100"/>') + style('Heading3', 'heading 3', '<w:b/><w:sz w:val="26"/>', '<w:keepNext/><w:spacing w:before="200" w:after="80"/>')
    + style('Quote', 'Quote', '<w:color w:val="555555"/>', '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="AAAAAA"/></w:pBdr><w:ind w:left="360"/>') + style('ListParagraph', 'List Paragraph', '', '<w:spacing w:after="60"/>') + '</w:styles>';
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(title)}</dc:title><dc:creator>Coe</dc:creator></cp:coreProperties>`);
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>');
  z.file('word/styles.xml', styles);
  z.file('word/numbering.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>${bullets}${decimals}${nums}</w:numbering>`);
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}

/** A file name that is safe to save as. */
export const fileName = (title: string, ext: string) => `${title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'document'}.${ext}`;
/** What a document is saved as. */
export function exportOf(d: EDoc): { name: string; type: string; text: string } {
  if (d.kind === 'web') return { name: fileName(d.title, 'html'), type: 'text/html', text: d.text };
  if (d.kind === 'data') return { name: fileName(d.title, /^\s*[[{]/.test(d.text) ? 'json' : 'csv'), type: /^\s*[[{]/.test(d.text) ? 'application/json' : 'text/csv', text: d.text };
  if (d.kind === 'code') return { name: fileName(d.title.replace(/\.[a-z0-9]+$/i, ''), EXT[d.lang ?? ''] ?? 'txt'), type: 'text/plain', text: d.text };
  return { name: fileName(d.title, 'html'), type: 'text/html', text: docPage(d.title, d.text) };
}
const EXT: Record<string, string> = { javascript: 'js', typescript: 'ts', python: 'py', html: 'html', css: 'css', json: 'json', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', bash: 'sh', lua: 'lua', kotlin: 'kt', swift: 'swift', yaml: 'yml', code: 'txt' };
