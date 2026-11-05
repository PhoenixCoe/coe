import { type Ctx, finding } from './text';
import type { Finding } from './types';

export interface Style { line: string[]; block?: [string, string][]; strings: string[]; triple?: boolean; singleLine?: boolean }
export const STYLES: Record<string, Style> = {
  python: { line: ['#'], strings: ['"', "'"], triple: true, singleLine: true },
  sql: { line: ['--'], block: [['/*', '*/']], strings: ["'", '"', '`'] },
  other: { line: ['//', '#'], block: [['/*', '*/']], strings: ['"', "'", '`'] },
};

const PAIR: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const CLOSER: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/** Looks for brackets and quotes that are not matched. Words inside strings and comments are left alone. */
export function scanBrackets(c: Ctx, o: Style): Finding[] {
  const { code } = c, n = code.length, out: Finding[] = [];
  const stack: { ch: string; pos: number }[] = [];
  let i = 0;
  while (i < n) {
    const ch = code[i];
    if (o.line.some((l) => code.startsWith(l, i))) { while (i < n && code[i] !== '\n') i++; continue; }
    const blk = o.block?.find(([a]) => code.startsWith(a, i));
    if (blk) {
      const end = code.indexOf(blk[1], i + blk[0].length);
      if (end < 0) { out.push(finding(c, i, 'error', 'Comment is never closed', { why: `This comment starts with ${blk[0]} but never ends.`, idea: `Add ${blk[1]} where the comment should end.` })); return out; }
      i = end + blk[1].length; continue;
    }
    if (o.strings.includes(ch)) {
      if (o.triple && code.startsWith(ch.repeat(3), i)) {
        const end = code.indexOf(ch.repeat(3), i + 3);
        if (end < 0) { out.push(finding(c, i, 'error', 'Text block is never closed', { why: 'It starts with three quotes and never ends.', idea: `Add ${ch.repeat(3)} where it should end.` })); return out; }
        i = end + 3; continue;
      }
      let j = i + 1, closed = false;
      while (j < n) {
        const d = code[j];
        if (d === '\\') { j += 2; continue; }
        if (d === ch) { closed = true; break; }
        if (d === '\n' && o.singleLine) break;
        j++;
      }
      if (!closed) {
        out.push(finding(c, i, 'error', 'Quote is not closed', { why: `A ${ch} opens a piece of text that never ends${o.singleLine ? ' on this line' : ''}.`, idea: `Add a closing ${ch} at the end of the text.` }));
        if (!o.singleLine) return out;
      }
      i = closed ? j + 1 : j; continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, pos: i });
    else if (ch === ')' || ch === ']' || ch === '}') {
      const top = stack.pop();
      if (!top) out.push(finding(c, i, 'error', `Extra ${ch}`, { why: `This ${ch} closes something that was never opened.`, idea: `Remove it, or add the matching ${PAIR[ch]} earlier.` }));
      else if (top.ch !== PAIR[ch]) {
        out.push(finding(c, i, 'error', `${ch} does not match`, { why: `A ${top.ch} opened earlier needs ${CLOSER[top.ch]}, but this is ${ch}.`, idea: `Use ${CLOSER[top.ch]} here, or check which bracket was meant.` }));
        return out;
      }
    }
    i++;
  }
  for (const s of stack.slice(-3).reverse()) out.push(finding(c, s.pos, 'error', `${s.ch} is never closed`, { why: `This ${s.ch} has no matching ${CLOSER[s.ch]}.`, idea: `Add ${CLOSER[s.ch]} where it should end.` }));
  return out;
}
