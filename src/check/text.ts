import type { Finding, Fix, Severity } from './types';

let counter = 0;
export const fid = () => `f${++counter}`;

/** The character position where each line starts. */
export function starts(code: string): number[] {
  const out = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') out.push(i + 1);
  return out;
}
/** 1-based line and column of a character position. */
export function lineOf(st: number[], pos: number): { line: number; col: number } {
  let lo = 0, hi = st.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (st[mid] <= pos) lo = mid; else hi = mid - 1; }
  return { line: lo + 1, col: pos - st[lo] + 1 };
}

/** How many single-letter edits (a swap of two neighbours counts as one) turn a into b. Gives up (returns max + 1) when it is more than max. */
export function lev(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
export function nearest(word: string, list: Iterable<string>, max = 2): string | null {
  let best: string | null = null, bd = max + 1;
  for (const w of list) { if (w === word) continue; const d = lev(word.toLowerCase(), w.toLowerCase(), max); if (d < bd) { bd = d; best = w; } }
  return bd <= max ? best : null;
}

export interface Ctx { code: string; lines: string[]; st: number[] }
export const ctx = (code: string): Ctx => ({ code, lines: code.split('\n'), st: starts(code) });

/** A fix that changes one line: edit gets the line's text and returns the new text. */
export function lineFix(c: Ctx, line: number, edit: (t: string) => string): Fix | undefined {
  const t = c.lines[line - 1]; if (t === undefined) return undefined;
  const n = edit(t); return n === t ? undefined : { from: line, to: line, text: n };
}
/** A fix that swaps a few characters at one place in the code (it must stay on one line). */
export function swapAt(c: Ctx, pos: number, remove: number, insert: string): Fix | undefined {
  const { line, col } = lineOf(c.st, pos);
  return lineFix(c, line, (t) => t.slice(0, col - 1) + insert + t.slice(col - 1 + remove));
}

export function finding(c: Ctx, pos: number, severity: Severity, title: string, extra: Partial<Finding> = {}): Finding {
  const { line, col } = lineOf(c.st, Math.max(0, Math.min(pos, c.code.length)));
  return { id: fid(), line, col, severity, title, source: 'local', ...extra };
}
export function atLine(line: number, severity: Severity, title: string, extra: Partial<Finding> = {}): Finding {
  return { id: fid(), line, severity, title, source: 'local', ...extra };
}
