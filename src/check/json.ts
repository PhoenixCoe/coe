import { type Ctx, finding, lineOf, swapAt, lineFix } from './text';
import type { Finding } from './types';

class Stop extends Error { constructor(public f: Finding) { super(f.title); } }

/** A strict JSON reader that says what is wrong in plain words, and where. */
export function checkJson(c: Ctx): Finding[] {
  const { code } = c, n = code.length;
  if (!code.trim()) return [];
  let i = 0;
  const out: Finding[] = [];
  const stackOpen: string[] = [];
  const stop = (pos: number, title: string, extra: Partial<Finding> = {}): never => { throw new Stop(finding(c, pos, 'error', title, extra)); };
  const ws = () => {
    for (;;) {
      while (i < n && /\s/.test(code[i])) i++;
      if (code.startsWith('//', i)) {
        const start = i; while (i < n && code[i] !== '\n') i++;
        stop(start, 'Comments are not allowed in JSON', { why: 'JSON has no way to write a comment.', idea: 'Remove the comment, or keep the note in a value like "_note".', fix: lineFix(c, lineOf(c.st, start).line, (t) => t.slice(0, lineOf(c.st, start).col - 1).trimEnd()) });
      }
      if (code.startsWith('/*', i)) stop(i, 'Comments are not allowed in JSON', { why: 'JSON has no way to write a comment.', idea: 'Remove the comment.' });
      return;
    }
  };
  const str = (): string => {
    const q = code[i], start = i; i++;
    if (q === "'") {
      let j = i; while (j < n && code[j] !== "'" && code[j] !== '\n') j++;
      const raw = code.slice(start, j + 1);
      stop(start, 'Text needs double quotes', { why: 'JSON only accepts " for text, not \'.', idea: 'Change the single quotes to double quotes.', fix: code[j] === "'" ? swapAt(c, start, raw.length, '"' + raw.slice(1, -1).replace(/"/g, '\\"') + '"') : undefined });
    }
    let s = '';
    while (i < n) {
      const d = code[i];
      if (d === '"') { i++; return s; }
      if (d === '\n') stop(start, 'Text is not closed', { why: 'A " opens some text that never ends on this line.', idea: 'Add the closing " at the end of the text.' });
      if (d === '\\') {
        const e = code[i + 1];
        if (e === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(code.slice(i + 2, i + 6))) stop(i, 'Bad \\u code', { why: '\\u must be followed by four hex digits.', idea: 'Write it like \\u00e9.' }); s += '?'; i += 6; continue; }
        if (!e || !'"\\/bfnrt'.includes(e)) stop(i, `\\${e ?? ''} is not a valid escape`, { why: 'Only \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\u are allowed after a backslash.', idea: 'Double the backslash (\\\\) to write one.' });
        s += e; i += 2; continue;
      }
      if (d < ' ') stop(i, 'Raw tab or control character in text', { why: 'Tabs and similar characters must be escaped inside text.', idea: 'Write \\t for a tab.' });
      s += d; i++;
    }
    return stop(start, 'Text is not closed', { why: 'A " opens some text that never ends.', idea: 'Add the closing ".' });
  };
  const closers = () => stackOpen.slice().reverse().map((x) => (x === '{' ? '}' : ']')).join(' ');
  const end = (): never => {
    const last = c.lines.length;
    return stop(n, 'The data stops too early', { why: stackOpen.length ? `Still open: ${stackOpen.map((x) => (x === '{' ? '{' : '[')).join(' ')}.` : 'A value is missing at the end.', idea: stackOpen.length ? `Add ${closers()} at the end.` : 'Finish the last value.',
      fix: stackOpen.length ? { from: last, to: last, text: c.lines[last - 1] + closers().replace(/ /g, '') } : undefined });
  };
  const value = (): void => {
    ws(); if (i >= n) end();
    const ch = code[i];
    if (ch === '{') {
      stackOpen.push('{'); i++;
      const seen = new Map<string, number>();
      ws();
      if (code[i] === '}') { i++; stackOpen.pop(); return; }
      for (;;) {
        ws(); if (i >= n) end();
        const ks = i;
        if (code[i] === '}') {
          // a comma came just before this
          const prev = c.code.slice(0, i).replace(/\s+$/, '');
          const cp = prev.length - 1;
          stop(cp, 'Extra comma at the end', { why: 'JSON does not allow a comma after the last item.', idea: 'Remove the comma.', fix: swapAt(c, cp, 1, '') });
        }
        if (code[i] !== '"' && code[i] !== "'") {
          const m = /^[A-Za-z_$][\w$]*/.exec(code.slice(i));
          if (m) { ws(); stop(i, `Name ${m[0]} needs double quotes`, { why: 'Every name in JSON is written in double quotes.', idea: `Write "${m[0]}" instead.`, fix: swapAt(c, i, m[0].length, `"${m[0]}"`) }); }
          stop(i, 'A name in quotes was expected here', { why: `Found ${JSON.stringify(code[i])} where a name should start.`, idea: 'Check for a missing or extra comma, or a missing quote.' });
        }
        const k = str();
        if (seen.has(k)) out.push(finding(c, ks, 'warning', `"${k}" appears twice`, { why: `The name was already used on line ${seen.get(k)}. Only the last one is kept.`, idea: 'Remove one, or rename it.' }));
        else seen.set(k, lineOf(c.st, ks).line);
        ws();
        if (code[i] !== ':') stop(i, 'A colon is missing', { why: 'A name must be followed by : and then its value.', idea: `Add a : after "${k}".`, fix: swapAt(c, i, 0, ': ') });
        i++; value(); ws(); if (i >= n) end();
        if (code[i] === ',') { i++; continue; }
        if (code[i] === '}') { i++; stackOpen.pop(); return; }
        const prevEnd = c.code.slice(0, i).replace(/\s+$/, '').length;
        stop(prevEnd, 'A comma is missing', { why: 'Items in an object are separated by commas.', idea: 'Add a comma after the value before this.', fix: swapAt(c, prevEnd, 0, ',') });
      }
    }
    if (ch === '[') {
      stackOpen.push('['); i++; ws();
      if (code[i] === ']') { i++; stackOpen.pop(); return; }
      for (;;) {
        ws(); if (i >= n) end();
        if (code[i] === ']') {
          const prev = c.code.slice(0, i).replace(/\s+$/, ''); const cp = prev.length - 1;
          stop(cp, 'Extra comma at the end', { why: 'JSON does not allow a comma after the last item.', idea: 'Remove the comma.', fix: swapAt(c, cp, 1, '') });
        }
        value(); ws(); if (i >= n) end();
        if (code[i] === ',') { i++; continue; }
        if (code[i] === ']') { i++; stackOpen.pop(); return; }
        const prevEnd = c.code.slice(0, i).replace(/\s+$/, '').length;
        stop(prevEnd, 'A comma is missing', { why: 'Items in a list are separated by commas.', idea: 'Add a comma after the item before this.', fix: swapAt(c, prevEnd, 0, ',') });
      }
    }
    if (ch === '"' || ch === "'") { str(); return; }
    const num = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(code.slice(i));
    if (num && num[0]) { i += num[0].length; if (/^[\w.]/.test(code[i] ?? '')) stop(i, 'This number is not valid', { why: 'Numbers cannot have letters, a leading zero or a trailing dot.', idea: 'Check the digits, or put the value in quotes if it is text.' }); return; }
    const word = /^[A-Za-z_]+/.exec(code.slice(i));
    if (word) {
      const w = word[0];
      if (w === 'true' || w === 'false' || w === 'null') { i += w.length; return; }
      const alt: Record<string, string> = { True: 'true', False: 'false', None: 'null', undefined: 'null', NaN: 'null', Infinity: 'null' };
      if (alt[w]) stop(i, `${w} is not valid JSON`, { why: 'JSON only has true, false and null.', idea: `Use ${alt[w]}.`, fix: swapAt(c, i, w.length, alt[w]) });
      stop(i, `${w} needs quotes`, { why: 'Text in JSON is written in double quotes.', idea: `Write "${w}" if it is text.`, fix: swapAt(c, i, w.length, `"${w}"`) });
    }
    if (ch === ',') stop(i, 'Extra comma', { why: 'A comma with nothing before it.', idea: 'Remove it.', fix: swapAt(c, i, 1, '') });
    if (ch === '}' || ch === ']') stop(i, `Extra ${ch}`, { why: 'This closes something that was not opened.', idea: 'Remove it, or add the opening bracket.' });
    return stop(i, `Unexpected ${JSON.stringify(ch)}`, { why: 'This does not belong here.', idea: 'Check the characters just before it.' });
  };
  try {
    value(); ws();
    if (i < n) stop(i, 'Extra text after the data', { why: 'The JSON already ended before this.', idea: 'Remove it, or wrap everything in a list [ ] if there are several values.' });
  } catch (e) { if (e instanceof Stop) out.unshift(e.f); else throw e; }
  return out;
}
