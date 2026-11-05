import { type Ctx, atLine, finding, lineFix, nearest, swapAt, lineOf } from './text';
import type { Finding } from './types';
import { STYLES, scanBrackets } from './scan';

const KW = 'SELECT FROM WHERE GROUP ORDER BY HAVING LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE JOIN INNER LEFT RIGHT OUTER FULL CROSS ON AND OR NOT NULL DISTINCT AS LIKE IN BETWEEN UNION ALTER DROP PRIMARY KEY FOREIGN REFERENCES DEFAULT EXISTS CASE WHEN THEN ELSE END COUNT SUM AVG MIN MAX ASC DESC INDEX VIEW IS'.split(' ');
const KWSET = new Set(KW);
const AFTER_NAME = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'AS', 'SELECT', 'BY', 'ON', 'AND', 'OR', 'NOT', 'WHERE', 'SET', 'HAVING', 'DISTINCT', 'WHEN', 'THEN', 'ELSE', 'IN', 'LIKE', 'BETWEEN', 'LIMIT', 'OFFSET', 'VALUES', 'IS', 'INDEX', 'VIEW', 'DEFAULT', 'REFERENCES']);

/** Comments become spaces and the inside of strings becomes x. Positions stay the same. */
function mask(code: string): string {
  let o = '', i = 0;
  while (i < code.length) {
    if (code.startsWith('--', i)) { while (i < code.length && code[i] !== '\n') { o += ' '; i++; } continue; }
    if (code.startsWith('/*', i)) { const e = code.indexOf('*/', i + 2), end = e < 0 ? code.length : e + 2; o += code.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    const ch = code[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < code.length) { if (code[j] === ch) { if (code[j + 1] === ch) { j += 2; continue; } break; } j++; }
      const end = code[j] === ch ? j + 1 : j;
      o += ch + code.slice(i + 1, j).replace(/[^\n]/g, 'x') + (code[j] === ch ? ch : ''); i = end; continue;
    }
    o += ch; i++;
  }
  return o;
}
const splitTop = (s: string) => { const out: string[] = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; else if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };

export async function checkSql(c: Ctx): Promise<Finding[]> {
  if (!c.code.trim()) return [];
  const out: Finding[] = [...scanBrackets(c, STYLES.sql)];
  const m = mask(c.code);

  // statements
  const stmts: { text: string; start: number }[] = [];
  { let d = 0, s = 0; for (let i = 0; i <= m.length; i++) { const ch = m[i]; if (ch === '(') d++; else if (ch === ')') d--; if ((ch === ';' && d <= 0) || i === m.length) { if (m.slice(s, i).trim()) stmts.push({ text: m.slice(s, i), start: s }); s = i + 1; d = 0; } } }

  const words = [...m.matchAll(/[A-Za-z_][A-Za-z_0-9]*|[(),.;=<>!*]+|\d+/g)];
  // misspelt keywords: in a spot where a keyword belongs
  words.forEach((w, k) => {
    const word = w[0]; if (!/^[A-Za-z]{4,}$/.test(word) || KWSET.has(word.toUpperCase())) return;
    const prev = words[k - 1]?.[0] ?? ''; const next = words[k + 1]?.[0] ?? '';
    if (/^[(,.=<>!]+$/.test(prev) || AFTER_NAME.has(prev.toUpperCase()) || next === '(' || next === '.' || prev === '.') {
      if (k !== 0 && !(prev === ';')) return;
    }
    const g = nearest(word.toUpperCase(), KW.filter((x) => x.length >= 4), word.length >= 6 ? 2 : 1);
    if (!g) return;
    out.push(finding(c, w.index!, 'error', `${word} is not an SQL word`, { why: `It is very close to ${g}, and sits where an SQL word belongs.`, idea: `Did you mean ${g}?`, fix: swapAt(c, w.index!, word.length, /^[a-z]/.test(word) ? g.toLowerCase() : g) }));
  });

  // = NULL
  const nre = /(!=|<>|=)\s*NULL\b/gi; let x: RegExpExecArray | null;
  while ((x = nre.exec(m))) {
    const neg = x[1] !== '=';
    out.push(finding(c, x.index, 'error', `${x[1]} NULL never matches`, { why: 'NULL is not equal to anything, not even NULL, so this test gives no rows.', idea: `Write IS${neg ? ' NOT' : ''} NULL.`, fix: swapAt(c, x.index, x[0].length, `IS${neg ? ' NOT' : ''} NULL`) }));
  }
  // comma before FROM / WHERE / closing bracket
  const cre = /,\s*(FROM|WHERE|GROUP|ORDER|HAVING|LIMIT)\b/gi;
  while ((x = cre.exec(m))) out.push(finding(c, x.index, 'error', `Extra comma before ${x[1].toUpperCase()}`, { why: 'A list cannot end with a comma.', idea: 'Remove the comma.', fix: swapAt(c, x.index, 1, '') }));
  const cre2 = /,\s*\)/g;
  while ((x = cre2.exec(m))) out.push(finding(c, x.index, 'error', 'Extra comma before )', { why: 'A list cannot end with a comma.', idea: 'Remove the comma.', fix: swapAt(c, x.index, 1, '') }));
  // double commas
  const dre = /,\s*,/g;
  while ((x = dre.exec(m))) out.push(finding(c, x.index, 'error', 'Two commas in a row', { why: 'There is nothing between them.', idea: 'Remove one.' }));

  for (const st of stmts) {
    const t = st.text, T = t.trim().toUpperCase();
    const pos = st.start + (t.length - t.trimStart().length);
    if (/^UPDATE\b/.test(T) && !/\bWHERE\b/i.test(t)) out.push(finding(c, pos, 'warning', 'UPDATE has no WHERE', { why: 'Without WHERE, every row in the table is changed.', idea: 'Add WHERE to pick the rows. Leave it out only if you mean all of them.' }));
    if (/^DELETE\b/.test(T) && !/\bWHERE\b/i.test(t)) out.push(finding(c, pos, 'warning', 'DELETE has no WHERE', { why: 'Without WHERE, every row in the table is removed.', idea: 'Add WHERE to pick the rows. Leave it out only if you mean all of them.' }));
    if (/^SELECT\b/.test(T) && !/\bFROM\b/i.test(t) && !out.some((f) => /SQL word/.test(f.title) && f.line >= lineOf(c.st, st.start).line && f.line <= lineOf(c.st, st.start + t.length).line) && /[A-Za-z_]\w*\s*(,|$)/.test(t.replace(/^\s*SELECT\s+/i, '').replace(/\([^)]*\)/g, '')) && !/^\s*SELECT\s+(\d|'|"|\(|NOW|CURRENT|COUNT|SUM|MAX|MIN|AVG|@)/i.test(t) && !/\bAS\b/i.test(t) && !/\(/.test(t)) out.push(finding(c, pos, 'tip', 'SELECT has no FROM', { why: 'Columns need a table to come from.', idea: 'Add FROM and the table name.' }));
    // INSERT column / value counts
    const ins = /^\s*INSERT\s+INTO\s+[\w.`"]+\s*\(([^)]*)\)\s*VALUES\s*(.*)$/is.exec(t);
    if (ins) {
      const cols = splitTop(ins[1]).length;
      const rows = [...ins[2].matchAll(/\(((?:[^()]|\([^()]*\))*)\)/g)];
      rows.forEach((r) => { const n = splitTop(r[1]).length; if (n !== cols) { const at = st.start + t.indexOf(ins[2]) + r.index!; out.push(finding(c, at, 'error', `${n} values for ${cols} columns`, { why: `The column list has ${cols} names, but this row has ${n} values.`, idea: n > cols ? 'Remove a value, or add a column name.' : 'Add a value, or remove a column name.' })); } });
    }
    // JOIN without ON
    const jm = /\b((?:INNER|LEFT|RIGHT|FULL)\s+(?:OUTER\s+)?JOIN)\s+[\w.`"]+(?:\s+(?:AS\s+)?\w+)?\s*(?=(WHERE|GROUP|ORDER|LEFT|RIGHT|INNER|JOIN|LIMIT|$))/i.exec(t.trim());
    if (jm && !/\b(ON|USING)\b/i.test(t.slice(jm.index))) out.push(finding(c, st.start + (t.length - t.trimStart().length) + jm.index, 'error', 'JOIN has no ON', { why: 'The database needs to know which columns match.', idea: 'Add ON table1.id = table2.id with your own columns.' }));
    // Aggregate with plain column and no GROUP BY
    if (/^SELECT\b/.test(T) && /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(t) && !/\bGROUP\s+BY\b/i.test(t)) {
      const list = t.replace(/^\s*SELECT\s+(DISTINCT\s+)?/i, '').split(/\bFROM\b/i)[0];
      const plain = splitTop(list).map((p) => p.trim()).filter((p) => p && !/\(/.test(p) && p !== '*' && !/^\d/.test(p));
      if (plain.length && splitTop(list).some((p) => /\(/.test(p))) out.push(finding(c, pos, 'error', `${plain[0].split(/\s+/)[0]} needs GROUP BY`, { why: 'A total like COUNT mixed with a plain column needs GROUP BY.', idea: `Add GROUP BY ${plain.map((p) => p.split(/\s+AS\s+/i)[0].trim()).join(', ')}.` }));
    }
  }
  // the formatter finds what is left
  if (!out.some((f) => f.severity === 'error' && /never closed|Extra|match|Quote/.test(f.title))) {
    try {
      const { format } = await import('sql-formatter');
      try { format(c.code, { language: 'sql' }); }
      catch (e) {
        const msg = String((e as Error).message ?? '');
        const mm = /line (\d+) column (\d+)/i.exec(msg);
        const line = mm ? +mm[1] : lineOf(c.st, 0).line;
        const tok = /token:\s*(.+?)(?:\s+at\b|$)/i.exec(msg)?.[1]?.replace(/\.$/, '');
        if (!out.some((f) => f.line === line && f.severity === 'error')) out.push(atLine(line, 'error', tok ? `${tok} does not fit here` : 'This SQL cannot be read', { col: mm ? +mm[2] : undefined, why: 'The SQL reader stopped here.', idea: 'Look at the word before it. A missing comma, keyword or bracket is the usual cause.' }));
      }
    } catch { /* the formatter could not load: the other checks still ran */ }
  }
  void lineFix;
  return out;
}
