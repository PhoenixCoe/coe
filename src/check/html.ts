import { type Ctx, atLine, ctx, finding, lineOf, nearest } from './text';
import type { Finding } from './types';
import { checkCss } from './css';
import { checkJs } from './js';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const IMPLIED = new Set(['p', 'li', 'dt', 'dd', 'td', 'th', 'tr', 'thead', 'tbody', 'tfoot', 'option', 'optgroup', 'colgroup', 'html', 'head', 'body', 'caption']);
const TAGS = ['a', 'abbr', 'article', 'aside', 'audio', 'b', 'body', 'br', 'button', 'canvas', 'code', 'div', 'em', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'label', 'li', 'link', 'main', 'meta', 'nav', 'ol', 'option', 'p', 'pre', 'script', 'section', 'select', 'small', 'span', 'strong', 'style', 'sub', 'sup', 'svg', 'table', 'tbody', 'td', 'textarea', 'th', 'thead', 'title', 'tr', 'ul', 'video'];
const ATTRS = ['class', 'id', 'href', 'src', 'alt', 'title', 'style', 'type', 'name', 'value', 'placeholder', 'target', 'rel', 'width', 'height', 'disabled', 'checked', 'for', 'action', 'method', 'content', 'charset', 'lang', 'onclick', 'role', 'tabindex', 'required', 'readonly', 'selected', 'colspan', 'rowspan'];

interface Tag { name: string; pos: number; end: number; close: boolean; self: boolean; attrs: { name: string; value: string | null; pos: number }[] }

function tokens(c: Ctx, out: Finding[]): Tag[] {
  const { code } = c, tags: Tag[] = [];
  let i = 0;
  while (i < code.length) {
    const lt = code.indexOf('<', i);
    if (lt < 0) break;
    if (code.startsWith('<!--', lt)) {
      const e = code.indexOf('-->', lt + 4);
      if (e < 0) { out.push(finding(c, lt, 'error', 'Comment is never closed', { why: 'This comment starts with <!-- and never ends.', idea: 'Add --> where the comment should end.' })); break; }
      i = e + 3; continue;
    }
    if (code[lt + 1] === '!' || code[lt + 1] === '?') { const e = code.indexOf('>', lt); i = e < 0 ? code.length : e + 1; continue; }
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/.exec(code.slice(lt, lt + 80));
    if (!m) { i = lt + 1; continue; }
    // walk the tag, keeping quotes together
    let j = lt + m[0].length;
    const attrs: Tag['attrs'] = [];
    let ended = false, broke = false;
    while (j < code.length) {
      const ch = code[j];
      if (ch === '>') { ended = true; break; }
      if (/\s|\//.test(ch)) { j++; continue; }
      if (ch === '<') { broke = true; break; }
      const am = /^[^\s"'<>\/=]+/.exec(code.slice(j, j + 80));
      if (!am) { j++; continue; }
      const apos = j; j += am[0].length;
      let k = j; while (/\s/.test(code[k] ?? '')) k++;
      let value: string | null = null;
      if (code[k] === '=') {
        k++; while (/\s/.test(code[k] ?? '')) k++;
        const q = code[k];
        if (q === '"' || q === "'") {
          const e = code.indexOf(q, k + 1);
          if (e < 0) { out.push(finding(c, k, 'error', 'Quote is not closed', { why: `The value of ${am[0]} starts with ${q} and never ends.`, idea: `Add a closing ${q} after the value.` })); i = code.length; return tags; }
          value = code.slice(k + 1, e);
          if (/<[a-zA-Z\/]/.test(value)) { out.push(finding(c, k, 'error', 'Quote is not closed', { why: `The value of ${am[0]} runs on into the next tag, so a closing ${q} is probably missing.`, idea: `Add ${q} at the end of the value.` })); }
          j = e + 1;
        } else { const um = /^[^\s>]*/.exec(code.slice(k)); value = um ? um[0] : ''; j = k + value.length; }
      }
      attrs.push({ name: am[0], value, pos: apos });
    }
    if (!ended) {
      if (broke) { out.push(finding(c, lt, 'error', `<${m[2]} is never closed with >`, { why: 'Another tag starts before this one ends.', idea: 'Add > at the end of the tag.' })); i = j; continue; }
      out.push(finding(c, lt, 'error', `<${m[2]} is never closed with >`, { why: 'The tag runs to the end of the code.', idea: 'Add > at the end of the tag.' })); break;
    }
    const name = m[2].toLowerCase();
    tags.push({ name, pos: lt, end: j + 1, close: m[1] === '/', self: code[j - 1] === '/', attrs });
    i = j + 1;
    if (!m[1] && RAW.has(name) && !(code[j - 1] === '/')) {
      const re = new RegExp(`</${name}\\s*>`, 'i'); const rest = code.slice(i); const f = re.exec(rest);
      if (!f) { out.push(finding(c, lt, 'error', `<${name}> is never closed`, { why: `There is no </${name}> after it.`, idea: `Add </${name}> at the end.` })); break; }
      tags.push({ name: '#raw:' + name, pos: i, end: i + f.index, close: false, self: true, attrs: [] });
      i += f.index;
    }
  }
  return tags;
}

const shiftAll = (list: Finding[], by: number): Finding[] => list.map((f) => ({ ...f, line: f.line + by, endLine: f.endLine ? f.endLine + by : undefined, fix: f.fix ? { ...f.fix, from: f.fix.from + by, to: f.fix.to + by } : undefined }));

export async function checkHtml(c: Ctx): Promise<Finding[]> {
  if (!c.code.trim()) return [];
  const out: Finding[] = [];
  const tags = tokens(c, out);
  const stack: Tag[] = [];
  const ids = new Map<string, number>();
  let hasDoctype = /<!doctype\s+html/i.test(c.code), hasTitle = false, hasLang = false, hasHtml = false, hasHead = false;
  const embedded: Promise<Finding[]>[] = [];
  for (const t of tags) {
    if (t.name.startsWith('#raw:')) {
      const kind = t.name.slice(5), body = c.code.slice(t.pos, t.end);
      const open = [...tags].reverse().find((x) => x.end === t.pos && x.name === kind);
      const ty = open?.attrs.find((a) => a.name.toLowerCase() === 'type')?.value?.toLowerCase() ?? '';
      const startLine = lineOf(c.st, t.pos).line - 1;
      if (kind === 'script' && !open?.attrs.some((a) => a.name.toLowerCase() === 'src') && (!ty || /javascript|module/.test(ty)) && body.trim()) {
        embedded.push(checkJs(ctx(body)).then((r) => shiftAll(r.filter((f) => f.severity !== 'tip' && !/never used|imported but/.test(f.title)), startLine)).catch(() => []));
      } else if (kind === 'style' && body.trim()) {
        embedded.push(checkCss(ctx(body)).then((r) => shiftAll(r.filter((f) => f.severity !== 'tip'), startLine)).catch(() => []));
      }
      continue;
    }
    if (t.name === 'title' && !t.close) hasTitle = true;
    if (t.name === 'html' && !t.close) { hasHtml = true; hasLang = t.attrs.some((a) => a.name.toLowerCase() === 'lang'); }
    if (t.name === 'head' && !t.close) hasHead = true;
    if (!t.close) {
      const names = new Map<string, number>();
      t.attrs.forEach((a) => {
        const k = a.name.toLowerCase();
        if (names.has(k)) out.push(finding(c, a.pos, 'warning', `${a.name} is set twice on this tag`, { why: 'The browser uses only the first one.', idea: 'Remove one of them.' }));
        names.set(k, 1);
        if (k === 'id' && a.value) {
          const prev = ids.get(a.value);
          if (prev) out.push(finding(c, a.pos, 'warning', `id "${a.value}" is used twice`, { why: `It is already used on line ${prev}. An id must be unique, or scripts and links pick the wrong one.`, idea: 'Rename one of them.' }));
          else ids.set(a.value, lineOf(c.st, a.pos).line);
        }
        if (!/^(data-|aria-|on|xml|x-|v-|@|:|\[|\(|\*|#)/i.test(k) && k.length >= 4 && !ATTRS.includes(k) && t.name !== 'svg') {
          const g = nearest(k, ATTRS, 1);
          if (g) out.push(finding(c, a.pos, 'warning', `${a.name} looks misspelt`, { why: 'The browser ignores attributes it does not know.', idea: `Did you mean ${g}?`, fix: swap(c, a.pos, a.name.length, g) }));
        }
      });
      if (t.name === 'img' && !names.has('alt')) out.push(finding(c, t.pos, 'warning', 'This image has no alt text', { why: 'Screen readers and broken links show the alt text instead.', idea: 'Add alt="" with a short description. Use alt="" for pure decoration.' }));
      if (t.name === 'a' && !names.has('href') && !names.has('name') && !names.has('id')) out.push(finding(c, t.pos, 'tip', 'This link has no href', { why: 'An <a> without href is not a link and cannot be reached with the keyboard.', idea: 'Add href, or use <button> if it runs an action.' }));
      if (!t.self && !VOID.has(t.name) && !t.name.includes(':') && !TAGS.includes(t.name) && !t.name.includes('-') && !/^(abbr|address|b|bdi|bdo|cite|dfn|dl|figure|figcaption|fieldset|legend|mark|menu|meter|noscript|object|output|picture|progress|q|rp|rt|ruby|s|samp|slot|summary|details|template|time|u|var|center|font|marquee|big|strike|tt|frame|frameset|map|dialog|datalist|data|del|ins|kbd|math|path|g|circle|rect|line|polygon|polyline|text|defs|use|symbol|tspan|ellipse|stop|lineargradient|radialgradient|clippath|mask|filter)$/.test(t.name)) {
        const g = nearest(t.name, TAGS, 1);
        if (g && !/^h[1-6]$/.test(t.name)) out.push(finding(c, t.pos + 1, 'warning', `<${t.name}> is not an HTML tag`, { why: 'Browsers treat unknown tags as plain boxes with no meaning.', idea: `Did you mean <${g}>?` }));
      }
    }
    if (VOID.has(t.name)) { if (t.close) out.push(finding(c, t.pos, 'warning', `</${t.name}> is not needed`, { why: `${t.name} never has a closing tag.`, idea: 'Remove it.', fix: removeText(c, t) })); continue; }
    if (t.self) {
      // <div /> is read as an open tag in HTML, so it is worth a warning. svg shapes can close themselves.
      if (!t.close && TAGS.includes(t.name) && t.name !== 'svg') out.push(finding(c, t.pos, 'warning', `<${t.name} /> does not close itself in HTML`, { why: `Only tags like <br> and <img> work that way. A <${t.name} /> stays open.`, idea: `Write <${t.name}></${t.name}>.` }));
      continue;
    }
    if (!t.close) { stack.push(t); continue; }
    // closing tag
    let k = stack.length - 1;
    while (k >= 0 && stack[k].name !== t.name) k--;
    if (k < 0) { out.push(finding(c, t.pos, 'error', `</${t.name}> has no opening tag`, { why: `Nothing is open to close with </${t.name}>.`, idea: 'Remove it, or add the opening tag before.', fix: removeText(c, t) })); continue; }
    for (let x = stack.length - 1; x > k; x--) {
      const s = stack[x];
      if (!IMPLIED.has(s.name)) out.push(finding(c, s.pos, 'error', `<${s.name}> is never closed`, { why: `</${t.name}> on line ${lineOf(c.st, t.pos).line} ends first, so <${s.name}> is left open.`, idea: `Add </${s.name}> before it.` }));
    }
    stack.length = k;
  }
  // tags that stay open to the end
  const shown = new Set(out.filter((f) => /never closed/.test(f.title)).map((f) => f.line));
  for (const s of stack.filter((s) => !IMPLIED.has(s.name) && !(s.self))) {
    const ln = lineOf(c.st, s.pos).line;
    if (!shown.has(ln)) out.push(finding(c, s.pos, 'error', `<${s.name}> is never closed`, { why: `There is no </${s.name}> for it.`, idea: `Add </${s.name}> where it should end.` }));
  }
  const looksPage = hasHtml || hasHead || /<body\b/i.test(c.code);
  if (looksPage) {
    if (!hasDoctype) out.push(atLine(1, 'tip', 'No doctype', { why: 'Without <!doctype html> at the top, browsers use an old layout mode.', idea: 'Add <!doctype html> as the first line.' }));
    if (hasHtml && !hasLang) out.push(atLine(Math.max(1, lineOf(c.st, tags.find((t) => t.name === 'html')?.pos ?? 0).line), 'tip', 'No lang on <html>', { why: 'Screen readers and translators use it to pick the language.', idea: 'Write <html lang="en">.' }));
    if (!hasTitle) out.push(atLine(1, 'tip', 'No <title>', { why: 'The tab and search results show the title.', idea: 'Add <title> inside <head>.' }));
  }
  const embeddedFound = (await Promise.all(embedded)).flat();
  return [...out, ...embeddedFound];
}
const swap = (c: Ctx, pos: number, remove: number, insert: string) => {
  const { line, col } = lineOf(c.st, pos); const t = c.lines[line - 1];
  return t === undefined ? undefined : { from: line, to: line, text: t.slice(0, col - 1) + insert + t.slice(col - 1 + remove) };
};
/** Takes a whole tag out of its line. Only when it sits on one line. */
const removeText = (c: Ctx, t: Tag) => {
  const a = lineOf(c.st, t.pos), b = lineOf(c.st, t.end - 1);
  if (a.line !== b.line) return undefined;
  const line = c.lines[a.line - 1]; const n = line.slice(0, a.col - 1) + line.slice(b.col);
  return { from: a.line, to: a.line, text: n };
};
