import { type Ctx, atLine, finding, lineFix, nearest, swapAt } from './text';
import type { Finding } from './types';
import { STYLES, scanBrackets } from './scan';

const KEYWORDS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self cls'.split(' '));
const BUILTINS = 'abs all any ascii bin bool bytearray bytes callable chr classmethod compile complex delattr dict dir divmod enumerate eval exec filter float format frozenset getattr globals hasattr hash help hex id input int isinstance issubclass iter len list locals map max memoryview min next object oct open ord pow print property range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip Exception ValueError TypeError KeyError IndexError NameError AttributeError OSError RuntimeError StopIteration ZeroDivisionError ImportError NotImplementedError FileNotFoundError __name__ __file__ __doc__'.split(' ');
const METHODS = 'append extend insert remove pop sort reverse index count keys values items get update join split strip lstrip rstrip lower upper title capitalize replace startswith endswith format find read write close readline readlines setdefault copy clear add discard union intersection difference isdigit isalpha isalnum islower isupper zfill center ljust rjust encode decode splitlines'.split(' ');
const BLOCK = /^(if|elif|else|for|while|def|class|try|except|finally|with|async\s+def|async\s+for|async\s+with|match|case)\b/;

/** Comments become spaces, strings keep their quotes and become x inside. Positions stay the same. */
function mask(code: string): string {
  let o = '', i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '#') { while (i < code.length && code[i] !== '\n') { o += ' '; i++; } continue; }
    if (ch === '"' || ch === "'") {
      const tri = code.startsWith(ch.repeat(3), i);
      const q = tri ? ch.repeat(3) : ch;
      let j = i + q.length;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code.startsWith(q, j)) break;
        if (!tri && code[j] === '\n') break;
        j++;
      }
      const end = code.startsWith(q, j) ? j + q.length : Math.min(j, code.length);
      const inner = code.slice(i + q.length, Math.max(i + q.length, end - (code.startsWith(q, j) ? q.length : 0))).replace(/[^\n]/g, 'x');
      o += q + inner + (code.startsWith(q, j) ? q : ''); i = end; continue;
    }
    o += ch; i++;
  }
  return o;
}

export function checkPython(c: Ctx): Finding[] {
  if (!c.code.trim()) return [];
  const out: Finding[] = [...scanBrackets(c, STYLES.python)];
  const brokenBrackets = out.length > 0;
  const m = mask(c.code), ml = m.split('\n');

  // which lines are the start of a statement (not the middle of a bracket or after a backslash)
  const logical: boolean[] = [];
  { let depth = 0, cont = false;
    for (let n = 0; n < ml.length; n++) {
      logical[n] = depth === 0 && !cont;
      const t = ml[n];
      for (const ch of t) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1); }
      cont = /\\\s*$/.test(t);
    } }

  const defined = new Set<string>(BUILTINS);
  const attrDefs = new Set<string>();
  const decl = (re: RegExp, group = 1) => { let x: RegExpExecArray | null; while ((x = re.exec(m))) x[group]?.split(',').forEach((n) => { const w = n.trim().replace(/^\*+/, '').replace(/[:=].*$/, '').trim(); if (/^[A-Za-z_]\w*$/.test(w)) defined.add(w); }); };
  decl(/^[ \t]*(?:async\s+)?def\s+(\w+)/gm); decl(/^[ \t]*class\s+(\w+)/gm);
  decl(/^[ \t]*([A-Za-z_][\w, \t*]*?)\s*(?::[^=\n]*[^=!<>\n])?=(?!=)/gm);
  decl(/\bfor\s+([\w, \t()*]+?)\s+in\b/g); decl(/\bas\s+(\w+)/g);
  decl(/^[ \t]*import\s+([\w., \t]+)/gm); decl(/^[ \t]*from\s+[\w.]+\s+import\s+([\w, \t*]+)/gm);
  decl(/\bdef\s+\w+\s*\(([^)]*)\)/g); decl(/\blambda\s+([^:]*):/g);
  decl(/\bglobal\s+([\w, ]+)/g); decl(/\bnonlocal\s+([\w, ]+)/g);
  { const re = /\bimport\s+([\w.]+)/g; let x: RegExpExecArray | null; while ((x = re.exec(m))) defined.add(x[1].split('.')[0]); }
  { const re = /\b(?:self|cls)\.(\w+)\s*(?::[^=\n]+)?=(?!=)/g; let x: RegExpExecArray | null; while ((x = re.exec(m))) attrDefs.add(x[1]); }
  { const re = /\bdef\s+(\w+)/g; let x: RegExpExecArray | null; while ((x = re.exec(m))) attrDefs.add(x[1]); }
  { const re = /\b\w+\.(\w+)\s*=(?!=)/g; let x: RegExpExecArray | null; while ((x = re.exec(m))) attrDefs.add(x[1]); }

  const indentOf = (t: string) => { const w = /^[ \t]*/.exec(t)![0]; return w.replace(/\t/g, '    ').length; };
  const wasTab = new Set<number>(), wasSpace = new Set<number>();
  const stackInd: number[] = [0];
  let prevOpen: number | null = null;       // the line with a colon that expects an indented block
  const reported = new Set<number>();
  const note = (f: Finding) => { if (!reported.has(f.line * 10 + (f.severity === 'error' ? 1 : 0)) || f.severity !== 'error') out.push(f); reported.add(f.line * 10 + (f.severity === 'error' ? 1 : 0)); };

  for (let n = 0; n < ml.length; n++) {
    if (!logical[n]) continue;
    const t = ml[n], raw = c.lines[n] ?? '';
    if (!t.trim()) continue;
    const line = n + 1, ind = indentOf(raw);
    const lead = /^[ \t]*/.exec(raw)![0];
    if (lead.includes('\t')) wasTab.add(line); if (lead.includes(' ')) wasSpace.add(line);
    if (lead.includes('\t') && lead.includes(' ')) note(atLine(line, 'error', 'Tabs and spaces are mixed here', { why: 'Python gets confused when one line indents with both.', idea: 'Use 4 spaces for every level.', fix: lineFix(c, line, (x) => x.replace(/^[ \t]+/, (w) => ' '.repeat(w.replace(/\t/g, '    ').length))) }));
    const body = t.trim();

    // indentation
    if (prevOpen !== null) {
      if (ind <= stackInd[stackInd.length - 1]) note(atLine(prevOpen, 'error', 'This needs an indented block under it', { why: 'A line that ends with : must be followed by an indented line.', idea: 'Indent the next line, or write pass if it should do nothing.' }));
      else stackInd.push(ind);
      prevOpen = null;
    } else if (ind > stackInd[stackInd.length - 1]) {
      note(atLine(line, 'error', 'This line is indented too far', { why: 'Nothing above it opens a block, so it should line up with the line before.', idea: 'Remove the extra spaces.', fix: lineFix(c, line, (x) => x.replace(/^[ \t]+/, ' '.repeat(stackInd[stackInd.length - 1]))) }));
    } else {
      while (ind < stackInd[stackInd.length - 1]) stackInd.pop();
      if (ind !== stackInd[stackInd.length - 1]) note(atLine(line, 'error', 'This line does not line up with any block', { why: 'Its indent is between two levels.', idea: `Use ${stackInd[stackInd.length - 1]} or ${stackInd[stackInd.length - 1] + 4} spaces.`, fix: lineFix(c, line, (x) => x.replace(/^[ \t]+/, ' '.repeat(stackInd[stackInd.length - 1]))) }));
    }

    // block statements
    const bm = BLOCK.exec(body);
    if (bm) {
      const ends = /:\s*$/.test(body) || /:\s*\S/.test(body.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|lambda[^:]*:/g, ''));
      if (!ends && !brokenBrackets) {
        const kw = bm[1];
        if (/^(else|try|finally)$/.test(kw) || /^(if|elif|while|for|def|class|with|except)\b/.test(body)) { prevOpen = line; note(atLine(line, 'error', `${kw} needs a : at the end`, { why: 'In Python every block opener ends with a colon.', idea: 'Add : at the end of this line.', fix: lineFix(c, line, (x) => x.replace(/\s*$/, '') + ':') })); }
      }
      if (/:\s*$/.test(body)) prevOpen = line;
      if (/^(if|elif|while)\b/.test(body)) {
        const cond = body.replace(/^(if|elif|while)\s*/, '').replace(/:\s*$/, '');
        const eq = /(^|[^=!<>:])=(?!=)/.exec(cond.replace(/\([^)]*=\s*[^)]*\)/g, (s) => 'x'.repeat(s.length)));
        if (eq) { const pos = c.st[n] + raw.indexOf(cond) + eq.index + eq[1].length; out.push(finding(c, pos, 'error', 'A single = cannot compare', { why: 'In Python = sets a value. A condition needs ==.', idea: 'Use == to compare.', fix: swapAt(c, pos, 1, '==') })); }
      }
    }
    if (/^else\s+if\b/.test(body)) out.push(atLine(line, 'error', 'It is elif, not else if', { why: 'Python joins else and if into one word.', idea: 'Write elif.', fix: lineFix(c, line, (x) => x.replace(/\belse\s+if\b/, 'elif')) }));

    // Python 2 print
    const pr = /^print\s+(?!\()(.+)$/.exec(body);
    if (pr) out.push(atLine(line, 'error', 'print needs brackets', { why: 'Python 3 writes print(...) with brackets.', idea: 'Put the text inside print( ).', fix: lineFix(c, line, (x) => x.replace(/print\s+(.+?)\s*$/, 'print($1)')) }));

    // words from other languages
    const other: [RegExp, string, string][] = [
      [/&&/, 'and', '&&'], [/\|\|/, 'or', '||'], [/(^|[^=!<>])!(?!=)\s*\w/, 'not', '!'],
      [/\btrue\b/, 'True', 'true'], [/\bfalse\b/, 'False', 'false'], [/\bnull\b/, 'None', 'null'],
    ];
    for (const [re, good, bad] of other) {
      const x = re.exec(t); if (!x) continue;
      const at = bad === '!' ? x[1].length : 0;   // that rule also matches the one character before the !
      const fix = bad === '!' ? undefined : lineFix(c, line, (s) => s.replace(new RegExp(re.source.replace(/\\b/g, '\\b'), 'g'), (hit) => hit.replace(bad, good)));
      out.push(finding(c, c.st[n] + x.index + at, 'error', `${bad} is not Python`, { why: `Python writes this as ${good}.`, idea: `Use ${good}.`, fix: bad === '!' ? undefined : fix }));
    }
    const pp = /\b([A-Za-z_]\w*)\s*(\+\+|--)\s*$/.exec(t);
    if (pp) out.push(finding(c, c.st[n] + pp.index, 'error', `${pp[2]} does not exist in Python`, { why: 'Python has no ++ or --.', idea: `Write ${pp[1]} ${pp[2] === '++' ? '+=' : '-='} 1.`, fix: lineFix(c, line, (x) => x.replace(/(\w+)\s*(\+\+|--)\s*$/, (_a, v, o) => `${v} ${o === '++' ? '+=' : '-='} 1`)) }));
    const len = /\b(\w+)\.length\b/.exec(t);
    if (len) out.push(finding(c, c.st[n] + len.index, 'error', '.length does not exist in Python', { why: 'Python uses len() to count items.', idea: `Write len(${len[1]}).`, fix: lineFix(c, line, (x) => x.replace(/\b(\w+)\.length\b/g, 'len($1)')) }));
    const nn = /(==|!=)\s*None\b/.exec(t);
    if (nn) out.push(finding(c, c.st[n] + nn.index, 'tip', `Use is${nn[1] === '!=' ? ' not' : ''} None`, { why: 'None is checked with is, not ==.', idea: `Write ${nn[1] === '!=' ? 'is not' : 'is'} None.`, fix: lineFix(c, line, (x) => x.replace(/(==|!=)\s*None\b/, (_a, o) => (o === '!=' ? 'is not None' : 'is None'))) }));
    if (/^except\s*:/.test(body)) out.push(atLine(line, 'tip', 'A bare except catches everything', { why: 'It also hides typing mistakes and Ctrl+C.', idea: 'Write except Exception: to catch normal errors only.', fix: lineFix(c, line, (x) => x.replace(/except\s*:/, 'except Exception:')) }));
    const md = /\bdef\s+\w+\s*\([^)]*=\s*(\[\]|\{\}|set\(\))/.exec(t);
    if (md) out.push(finding(c, c.st[n] + md.index, 'warning', 'A list or dict as a default value is shared', { why: 'The same object is reused on every call, so changes pile up.', idea: 'Use None as the default and create the list inside the function.' }));
    const cmp = /\bif\s+\w+\s*==\s*(True|False)\s*:/.exec(t);
    if (cmp) out.push(finding(c, c.st[n] + cmp.index, 'tip', `No need for == ${cmp[1]}`, { why: 'The value is already true or false.', idea: cmp[1] === 'True' ? 'Write if value: .' : 'Write if not value: .' }));
  }
  if (prevOpen !== null) out.push(atLine(prevOpen, 'error', 'This needs an indented block under it', { why: 'The code ends right after a line with : on it.', idea: 'Add an indented line below, or write pass.' }));
  if (wasTab.size && wasSpace.size && !out.some((f) => /Tabs and spaces/.test(f.title))) out.push(atLine([...wasTab][0], 'warning', 'Tabs and spaces are both used', { why: 'Some lines indent with tabs and some with spaces. Python 3 can refuse to run this.', idea: 'Pick one. Four spaces is the usual choice.' }));

  // names that look like typos of something defined or built in
  const re = /(^|[^.\w'"])([A-Za-z_]\w{2,})\b(?!\s*=(?!=))/g; let x: RegExpExecArray | null;
  const seenName = new Set<string>(), pool = [...defined, ...KEYWORDS];
  while ((x = re.exec(m))) {
    const w = x[2];
    if (defined.has(w) || KEYWORDS.has(w) || seenName.has(w) || /^(true|false|null|nil|undefined)$/.test(w)) continue;
    const pos = x.index + x[1].length;
    if (/^[\w"'x]$/.test(m[pos - 1] ?? '')) continue;
    // inside quotes? the mask leaves x there, so words in strings are already x-runs
    if (/^x+$/.test(w)) continue;
    const g = nearest(w, pool.filter((p) => p.length >= 3), w.length >= 6 ? 2 : 1);
    if (!g || KEYWORDS.has(g) && w.length < 4) continue;
    // keyword argument names (f(color=1)) were skipped by the lookahead
    seenName.add(w);
    out.push(finding(c, pos, 'warning', `${w} is not defined`, { why: `Nothing in this code has this name, and it is very close to ${g}.`, idea: `Did you mean ${g}?`, fix: swapAt(c, pos, w.length, g) }));
  }
  const mre = /\.([A-Za-z_]\w{3,})\s*\(/g; const seenM = new Set<string>();
  while ((x = mre.exec(m))) {
    const w = x[1]; if (attrDefs.has(w) || METHODS.includes(w) || seenM.has(w) || defined.has(w)) continue;
    const g = nearest(w, METHODS, w.length >= 7 ? 2 : 1); if (!g) continue; seenM.add(w);
    out.push(finding(c, x.index + 1, 'warning', `.${w}() looks misspelt`, { why: `Nothing defines .${w}(), and it is very close to .${g}().`, idea: `Did you mean .${g}()?`, fix: swapAt(c, x.index + 1, w.length, g) }));
  }
  return out;
}
