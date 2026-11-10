// A small colouring pass for code, line by line. Good enough to read by: words, text in quotes, numbers and notes stand out.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sp = (c: string, s: string) => (s ? `<i class="${c}">${esc(s)}</i>` : '');

const WORDS = new Set((
  'abstract and as assert async await break case catch class const continue def default del delete do elif else enum except export extends false final finally fn for from func function ' +
  'global go if implements import in instanceof interface is lambda let local match namespace new nil none not null of or package pass private protected public raise return self static ' +
  'struct super switch then this throw true try type typeof undefined unsafe use using var void where while with yield end elseif repeat until select insert into update set values join ' +
  'group order by limit create table primary key foreign references alter drop index view echo fi done esac'
).split(' '));

const HASH = new Set(['python', 'bash', 'ruby', 'yaml']);   // notes start with #
const DASH = new Set(['sql', 'lua']);                          // notes start with --
const NOTES = new Set(['json', 'html', 'css']);                // no line notes at all

interface State { blk: string | null }

/** Turns each line into safe HTML. `lang` is one of the names in codesplit (python, html, ...). */
export function highlight(code: string, lang: string): string[] {
  const st: State = { blk: null };
  let tag = false;
  return code.split('\n').map((line) => {
    const r = one(line, lang, st, tag); tag = r.tag; return r.html;
  });
}

function one(line: string, lang: string, st: State, tag0: boolean): { html: string; tag: boolean } {
  const n = line.length, html = lang === 'html', css = lang === 'css', json = lang === 'json';
  const open = html ? '<!--' : HASH.has(lang) ? '' : '/*', shut = html ? '-->' : '*/';
  let i = 0, out = '', tag = tag0;
  while (i < n) {
    if (st.blk) {   // a note or a long string that began on an earlier line
      const e = line.indexOf(st.blk, i), cls = st.blk === '"""' || st.blk === "'''" ? 's' : 'c';
      if (e < 0) { out += sp(cls, line.slice(i)); i = n; } else { out += sp(cls, line.slice(i, e + st.blk.length)); i += e - i + st.blk.length; st.blk = null; }
      continue;
    }
    const ch = line[i];
    if (open && line.startsWith(open, i)) {
      const e = line.indexOf(shut, i + open.length);
      if (e < 0) { out += sp('c', line.slice(i)); i = n; st.blk = shut; } else { out += sp('c', line.slice(i, e + shut.length)); i = e + shut.length; }
      continue;
    }
    if (html) {
      if (!tag) {
        if (ch === '<' && /[a-zA-Z/!]/.test(line[i + 1] || '')) { const t = (/^<\/?[a-zA-Z][\w:-]*|^<!doctype/i.exec(line.slice(i)) || ['<'])[0]; out += sp('k', t); i += t.length; tag = true; continue; }
        out += esc(ch); i++; continue;
      }
      if (ch === '>') { out += sp('k', '>'); i++; tag = false; continue; }
      if (line.startsWith('/>', i)) { out += sp('k', '/>'); i += 2; tag = false; continue; }
    } else {
      if (lang === 'python' && (line.startsWith('"""', i) || line.startsWith("'''", i))) { const q = line.slice(i, i + 3), e = line.indexOf(q, i + 3); if (e < 0) { out += sp('s', line.slice(i)); i = n; st.blk = q; } else { out += sp('s', line.slice(i, e + 3)); i = e + 3; } continue; }
      const note = !NOTES.has(lang) && (lang === 'code' ? line.startsWith('//', i) || (ch === '#' && !line.slice(0, i).trim()) : HASH.has(lang) ? ch === '#' : DASH.has(lang) ? line.startsWith('--', i) : line.startsWith('//', i));
      if (note) { out += sp('c', line.slice(i)); i = n; continue; }
      if (css && ch === '#') { const m = /^#[0-9a-fA-F]{3,8}\b/.exec(line.slice(i)); if (m) { out += sp('n', m[0]); i += m[0].length; continue; } }
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      if (html && !tag) { out += esc(ch); i++; continue; }
      let j = i + 1; while (j < n && line[j] !== ch) { if (line[j] === '\\') j++; j++; }
      const end = Math.min(n, j + 1);
      out += sp(json && /^\s*:/.test(line.slice(end)) ? 'k' : 's', line.slice(i, end)); i = end; continue;
    }
    if (/[0-9]/.test(ch) && !/[\w$]/.test(line[i - 1] || '')) { const m = /^(0x[\da-fA-F]+|\d[\d_]*(\.\d+)?(e[+-]?\d+)?[a-z%]*)/.exec(line.slice(i))![0]; out += sp('n', m); i += m.length; continue; }
    if (/[A-Za-z_$]/.test(ch)) {
      const word = /^[A-Za-z_$][\w$]*/.exec(line.slice(i))![0], after = line.slice(i + word.length);
      let cls = '';
      if (html) cls = '';
      else if (css) cls = /^\s*:(?!:)/.test(after) ? 'k' : '';
      else if (WORDS.has(word.toLowerCase()) && (!json || /^(true|false|null)$/.test(word))) cls = 'k';
      else if (/^\s*\(/.test(after)) cls = 'f';
      out += cls ? sp(cls, word) : esc(word); i += word.length; continue;
    }
    out += esc(ch); i++;
  }
  return { html: out, tag };
}
