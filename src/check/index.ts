import { ctx } from './text';
import type { Finding, Fix, Lang } from './types';
import { scanBrackets, STYLES } from './scan';
import { checkJson } from './json';
import { checkJs, syntaxOnly } from './js';
import { checkCss } from './css';
import { checkHtml } from './html';
import { checkPython } from './py';
import { checkSql } from './sql';

export * from './types';

/** Guesses the language from what the code looks like. */
export function detect(code: string): Lang {
  const t = code.trim(); if (!t) return 'javascript';
  if (/^<!doctype\s+html|^<html[\s>]|^<(div|body|head|section|main|nav|ul|ol|p|h[1-6]|form|table|span|a|img|button|header|footer|script|style)[\s>]/i.test(t)) return 'html';
  if (/^[\[{]/.test(t) && /[\]}]$/.test(t) && /^[\[{]\s*("|\[|\{|\d|true|false|null|\]|\})/.test(t) && !/;\s*$/m.test(t.slice(0, 200)) && !/=>|function\b|\bconst\b|\blet\b/.test(t)) return 'json';
  if (/^\s*(select|insert\s+into|update|delete\s+from|create\s+(table|index|view|database)|alter\s+table|drop\s+table|with\s+\w+\s+as)\b/im.test(t)) return 'sql';
  if (/^\s*(def\s+\w+\s*\(|class\s+\w+.*:\s*$|import\s+\w+\s*$|from\s+[\w.]+\s+import\b|print\s*\(|elif\b|if\s+__name__)/m.test(t) && !/[;{]\s*$/m.test(t.split('\n').slice(0, 6).join('\n'))) return 'python';
  if (/(^|\n)\s*[@.#:*\[]?[\w.#>:\[\]="' -]+\s*\{\s*\n?\s*[-\w]+\s*:\s*[^;{}]+;?/.test(t) && !/\b(function|const|let|var|=>|return|if\s*\()\b/.test(t)) return 'css';
  if (/:\s*(string|number|boolean|any|void|unknown)\b|\binterface\s+\w+\s*\{|\btype\s+\w+\s*=|<\w+>\s*\(|\bas\s+(string|number|const|any)\b/.test(t)) return 'typescript';
  if (/\b(function|const|let|var|=>|console\.|document\.|require\(|import\s.+from)\b/.test(t) || /;\s*$/m.test(t)) return 'javascript';
  return 'other';
}

const order = { error: 0, warning: 1, tip: 2 } as const;
export async function check(code: string, lang: Lang): Promise<Finding[]> {
  const c = ctx(code);
  let list: Finding[] = [];
  try {
    switch (lang) {
      case 'javascript': list = await checkJs(c); break;
      case 'typescript': list = await syntaxOnly(c, 'ts'); break;
      case 'json': list = checkJson(c); break;
      case 'css': list = await checkCss(c); break;
      case 'html': list = await checkHtml(c); break;
      case 'python': list = checkPython(c); break;
      case 'sql': list = await checkSql(c); break;
      default: list = scanBrackets(c, STYLES.other);
    }
  } catch { list = []; }
  const seen = new Set<string>();
  return list.filter((f) => { const k = `${f.line}|${f.title}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.line - b.line || order[a.severity] - order[b.severity]);
}

/** Puts a fix into the code. */
export function applyFix(code: string, fix: Fix): string {
  const lines = code.split('\n');
  const text = fix.text === '' ? [] : fix.text.split('\n');
  lines.splice(fix.from - 1, fix.to - fix.from + 1, ...text);
  return lines.join('\n');
}
/** After a fix, the lines below it move. Moves each remaining finding with them, and drops any that sat on a changed line. */
export function shift(findings: Finding[], fix: Fix, applied: string): Finding[] {
  const delta = (fix.text === '' ? 0 : fix.text.split('\n').length) - (fix.to - fix.from + 1);
  return findings.filter((f) => f.id !== applied).filter((f) => !(f.line >= fix.from && f.line <= fix.to) && !(f.endLine && f.endLine >= fix.from && f.endLine <= fix.to)).map((f) => {
    if (f.line <= fix.to) return f;
    const mv = (n: number) => n + delta;
    return { ...f, line: mv(f.line), endLine: f.endLine ? mv(f.endLine) : undefined, fix: f.fix ? { ...f.fix, from: mv(f.fix.from), to: mv(f.fix.to) } : undefined };
  });
}
