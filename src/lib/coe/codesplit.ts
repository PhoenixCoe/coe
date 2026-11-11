// Code in a chat: finding it in what someone sent, and the small helpers the side-by-side view needs.
import type { Msg } from '@/coe/store';

export interface CodeItem {
  id: string; from: 'you' | 'coe'; msgId: string; lang: string; code: string;
  /** The file it came from, when it was attached. */
  file?: string;
  /** For Coe's code: the last code you sent before it, so the changes can be shown. */
  base?: string;
}

export const LANG_NAME: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', html: 'HTML', css: 'CSS', json: 'JSON', sql: 'SQL', java: 'Java', c: 'C', cpp: 'C++',
  csharp: 'C#', go: 'Go', rust: 'Rust', ruby: 'Ruby', php: 'PHP', bash: 'Shell', lua: 'Lua', kotlin: 'Kotlin', swift: 'Swift', yaml: 'YAML', code: 'Code',
};
const ALIAS: Record<string, string> = { js: 'javascript', jsx: 'javascript', mjs: 'javascript', node: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', python3: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', 'c++': 'cpp', cs: 'csharp', 'c#': 'csharp', htm: 'html', yml: 'yaml', rs: 'rust', rb: 'ruby', kt: 'kotlin', golang: 'go' };
const EXT: Record<string, string> = { py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', html: 'html', htm: 'html', css: 'css', sql: 'sql', java: 'java', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', sh: 'bash', bash: 'bash', lua: 'lua', kt: 'kotlin', swift: 'swift', yml: 'yaml', yaml: 'yaml' };
export const FILE_EXT: Record<string, string> = { javascript: 'js', typescript: 'ts', python: 'py', html: 'html', css: 'css', json: 'json', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', bash: 'sh', lua: 'lua', kotlin: 'kt', swift: 'swift', yaml: 'yml', code: 'txt' };

export const normLang = (l: string) => { const k = (l || '').toLowerCase().trim(); const a = ALIAS[k] ?? k; return LANG_NAME[a] ? a : 'code'; };
export const langOfFile = (name: string) => EXT[(name.split('.').pop() || '').toLowerCase()] ?? '';

/** Guesses what the code is written in, from how it looks. */
export function guessLang(code: string): string {
  const t = code.trim(); if (!t) return 'code';
  if (/^<!doctype\s+html|^<html[\s>]|^<(div|body|head|section|main|nav|ul|ol|p|h[1-6]|form|table|span|a|img|button|header|footer|script|style)[\s>]/i.test(t)) return 'html';
  if (/^[[{][\s\S]*[\]}]$/.test(t) && /^[[{]\s*("|\[|\{|\d|true|false|null|\]|\})/.test(t) && !/;\s*$/m.test(t.slice(0, 200)) && !/=>|function\b|\bconst\b|\blet\b/.test(t)) return 'json';
  if (/^\s*(select\b[\s\S]*\bfrom\b|insert\s+into|update\s+\w+\s+set|delete\s+from|create\s+(table|index|view|database)|alter\s+table|drop\s+table)/i.test(t)) return 'sql';
  if (/<\?php/.test(t)) return 'php';
  if (/^\s*#!.*\b(ba|z)?sh\b/.test(t) || (/^\s*(echo|cd|ls|sudo|apt|npm|pip|git|chmod|export)\s/m.test(t) && !/[;{]\s*$/m.test(t))) return 'bash';
  if (/^\s*(def\s+\w+\s*\(|class\s+\w+.*:\s*$|from\s+[\w.]+\s+import\b|import\s+\w+\s*$|print\s*\(|elif\b|if\s+__name__)/m.test(t) && !/[;{]\s*$/m.test(t.split('\n').slice(0, 6).join('\n'))) return 'python';
  if (/#include\s*[<"]/.test(t)) return /std::|cout|\bclass\b|template\s*</.test(t) ? 'cpp' : 'c';
  if (/\busing\s+System|Console\.Write|namespace\s+\w+\s*[{;]/.test(t)) return 'csharp';
  if (/\bpublic\s+(static\s+)?(class|void|int|String)\b|System\.out\.print|\bimport\s+java\./.test(t)) return 'java';
  if (/^\s*package\s+main|\bfunc\s+\w+\(|fmt\.Print/m.test(t)) return 'go';
  if (/\bfn\s+\w+\s*\(|let\s+mut\b|println!/.test(t)) return 'rust';
  if (/^\s*local\s+(function\s+)?\w+/m.test(t) && /\bthen\b|\bend\b/.test(t)) return 'lua';
  if (/(^|\n)\s*[@.#:*[]?[\w.#>:[\]="' -]+\s*\{\s*\n?\s*[-\w]+\s*:\s*[^;{}]+;?/.test(t) && !/\b(function|const|let|var|return)\b|=>|if\s*\(/.test(t)) return 'css';
  if (/:\s*(string|number|boolean|any|void|unknown)\b|\binterface\s+\w+\s*\{|\btype\s+\w+\s*=|\bas\s+(string|number|const|any)\b/.test(t)) return 'typescript';
  if (/\b(function|const|let|var|console\.|document\.|require\()|=>|import\s.+from/.test(t) || /;\s*$/m.test(t)) return 'javascript';
  return 'code';
}

// ------------------------------------------------------------------ finding code in a message
const KW = /^\s*(def|class|function|const|let|var|import|from|export|public|private|protected|static|return|if|else|elif|for|while|switch|case|try|catch|finally|except|with|async|await|using|package|namespace|fn|func|struct|enum|interface|SELECT|INSERT|UPDATE|DELETE|CREATE)\b/;
const codey = (l: string) => /[;{}]\s*$|^\s*[}\])]|\)\s*[{:]?\s*$|\w\s*(=|\+=|-=|==|=>|\+\+|--)\s*\S|^\s*(\/\/|\/\*|\*\/|#!|#include|@\w+|<\/?[a-z!][\w-]*)|^\s{2,}\S|^\t/.test(l) || KW.test(l);
const prose = (l: string) => { const w = l.trim().split(/\s+/).length; return w >= 4 && !/[{};=<>[\]]/.test(l) && !codey(l); };

const FENCE = /(^|\n)[ \t]*(`{3,})([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:\n[ \t]*`{3,}[ \t]*(?=\n|$)|$)/g;
const big = (c: string) => c.split('\n').length >= 3 || c.length >= 60;

export interface Found { blocks: { lang: string; code: string }[]; rest: string }

/** Code in something a person sent: a fenced block, or code pasted in as it is. Null when there is none. */
export function extractCode(text: string): Found | null {
  if (!text || text.length < 40) return null;
  const blocks: Found['blocks'] = [];
  let any = false;
  const rest = text.replace(FENCE, (all, pre: string, _f: string, lang: string, code: string) => {
    any = true;
    const c = code.replace(/\s+$/, '');
    if (!big(c)) return all;
    blocks.push({ lang: normLang(lang) === 'code' ? guessLang(c) : normLang(lang), code: c });
    return pre;
  });
  if (blocks.length) return { blocks, rest: rest.replace(/\n{3,}/g, '\n\n').trim() };
  if (any) return null;
  // Pasted without fences: the longest stretch of lines that read like code.
  const L = text.split('\n');
  let best: { a: number; z: number; n: number } | null = null, cur: { a: number; z: number; n: number } | null = null;
  const close = () => { if (cur && (!best || cur.n > best.n)) best = cur; cur = null; };
  L.forEach((l, i) => {
    if (!l.trim()) return;
    if (codey(l)) { if (cur) { cur.z = i; cur.n++; } else cur = { a: i, z: i, n: 1 }; }
    else if (prose(l)) close();
  });
  close();
  const b = best as { a: number; z: number; n: number } | null;
  if (!b || b.n < 4) return null;
  const run = L.slice(b.a, b.z + 1), nonblank = run.filter((x) => x.trim()).length;
  if (b.n / nonblank < 0.6) return null;
  const code = run.join('\n').replace(/^\s*\n|\s+$/g, '');
  return { blocks: [{ lang: guessLang(code), code }], rest: [...L.slice(0, b.a), ...L.slice(b.z + 1)].join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

const SPECIAL = /^(coe-|mermaid|svg|slides|data|map|places|ask|followups|fold|quiz|cards|flash|study|math|tool)/i;
const cache = new WeakMap<Msg, { len: number; items: Omit<CodeItem, 'base'>[] }>();

function itemsOf(m: Msg): Omit<CodeItem, 'base'>[] {
  const hit = cache.get(m); if (hit && hit.len === m.text.length) return hit.items;
  const out: Omit<CodeItem, 'base'>[] = [];
  if (m.role === 'user') {
    extractCode(m.text)?.blocks.forEach((b, k) => out.push({ id: `${m.id}:u${k}`, from: 'you', msgId: m.id, lang: b.lang, code: b.code }));
    (m.attach ?? []).forEach((a, k) => { const l = langOfFile(a.name); if (l && a.text && a.text.trim()) out.push({ id: `${m.id}:a${k}`, from: 'you', msgId: m.id, lang: l, code: a.text.replace(/\s+$/, ''), file: a.name }); });
  } else if (m.text.includes('```')) {
    let k = 0;
    m.text.replace(FENCE, (all, _p: string, _f: string, lang: string, code: string) => {
      const c = code.replace(/\s+$/, '');
      if (!SPECIAL.test(lang) && c.split('\n').length >= 4) out.push({ id: `${m.id}:c${k}`, from: 'coe', msgId: m.id, lang: normLang(lang) === 'code' ? guessLang(c) : normLang(lang), code: c });
      k++; return all;
    });
  }
  cache.set(m, { len: m.text.length, items: out });
  return out;
}

/** True when `b` reads like a new version of `a`: the same language, and many of the same lines. */
function related(a: CodeItem, b: CodeItem): boolean {
  if (a.lang !== b.lang && a.lang !== 'code' && b.lang !== 'code') return false;
  const old = new Set(a.code.split('\n').map((l) => l.trim()).filter(Boolean));
  const now = b.code.split('\n').map((l) => l.trim()).filter(Boolean); if (!now.length || !old.size) return false;
  return now.filter((l) => old.has(l)).length / now.length >= 0.3;
}

/** Every piece of code in a chat, oldest first. */
export function codeItems(messages: Msg[]): CodeItem[] {
  const out: CodeItem[] = []; let you: CodeItem | null = null;
  for (const m of messages) {
    if (m.hidden || m.compact) continue;
    for (const it of itemsOf(m)) {
      const item: CodeItem = { ...it };
      if (it.from === 'coe' && you && related(you, item)) item.base = you.id;   // only code that looks like a new version of yours gets compared
      out.push(item); if (it.from === 'you') you = item;
    }
  }
  return out;
}
/** What a message says apart from its code, and the code it holds. */
export const codeIn = (m: Msg): { rest: string; items: Omit<CodeItem, 'base'>[] } | null => {
  if (m.role !== 'user') return null;
  const items = itemsOf(m); if (!items.length) return null;
  const x = extractCode(m.text);
  return { rest: x ? x.rest : m.text, items };
};

// ------------------------------------------------------------------ what changed between two versions
export interface Row { k: 'same' | 'add' | 'del'; /** index in the old code (del, same) */ a?: number; /** index in the new code (add, same) */ b?: number }

/** A line by line comparison. Null when the two are too big to compare quickly. */
export function lineDiff(oldCode: string, newCode: string): Row[] | null {
  const A = oldCode.split('\n'), B = newCode.split('\n');
  const eq = (i: number, j: number) => A[i].trimEnd() === B[j].trimEnd();
  let s = 0; while (s < A.length && s < B.length && eq(s, s)) s++;
  let ea = A.length, eb = B.length; while (ea > s && eb > s && eq(ea - 1, eb - 1)) { ea--; eb--; }
  const n = ea - s, m = eb - s;
  if (n * m > 1_500_000 || A.length > 5000 || B.length > 5000) return null;
  const w = m + 1, dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = eq(s + i, s + j) ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const rows: Row[] = [];
  for (let i = 0; i < s; i++) rows.push({ k: 'same', a: i, b: i });
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && eq(s + i, s + j)) { rows.push({ k: 'same', a: s + i, b: s + j }); i++; j++; }
    else if (i < n && (j >= m || dp[(i + 1) * w + j] >= dp[i * w + j + 1])) { rows.push({ k: 'del', a: s + i }); i++; }   // what went comes before what came
    else { rows.push({ k: 'add', b: s + j }); j++; }
  }
  for (let t = 0; t < A.length - ea; t++) rows.push({ k: 'same', a: ea + t, b: eb + t });
  return rows;
}
