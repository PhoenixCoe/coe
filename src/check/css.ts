import { type Ctx, atLine, finding, lineOf, nearest, swapAt } from './text';
import type { Finding } from './types';
import { explain, syntaxError } from './syntax';

const COMMON = ['align-content', 'align-items', 'align-self', 'animation', 'animation-delay', 'animation-direction', 'animation-duration', 'animation-fill-mode', 'animation-iteration-count', 'animation-name', 'animation-timing-function', 'aspect-ratio', 'background', 'background-attachment', 'background-clip', 'background-color', 'background-image', 'background-position', 'background-repeat', 'background-size', 'border', 'border-bottom', 'border-collapse', 'border-color', 'border-left', 'border-radius', 'border-right', 'border-spacing', 'border-style', 'border-top', 'border-width', 'bottom', 'box-shadow', 'box-sizing', 'clear', 'clip-path', 'color', 'column-gap', 'content', 'cursor', 'display', 'filter', 'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap', 'float', 'font', 'font-family', 'font-size', 'font-style', 'font-weight', 'gap', 'grid', 'grid-area', 'grid-auto-flow', 'grid-column', 'grid-gap', 'grid-row', 'grid-template', 'grid-template-areas', 'grid-template-columns', 'grid-template-rows', 'height', 'inset', 'justify-content', 'justify-items', 'justify-self', 'left', 'letter-spacing', 'line-height', 'list-style', 'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'max-height', 'max-width', 'min-height', 'min-width', 'object-fit', 'object-position', 'opacity', 'order', 'outline', 'outline-offset', 'overflow', 'overflow-x', 'overflow-y', 'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'place-content', 'place-items', 'pointer-events', 'position', 'resize', 'right', 'row-gap', 'scroll-behavior', 'text-align', 'text-decoration', 'text-indent', 'text-overflow', 'text-shadow', 'text-transform', 'top', 'transform', 'transform-origin', 'transition', 'transition-delay', 'transition-duration', 'transition-property', 'transition-timing-function', 'user-select', 'vertical-align', 'visibility', 'white-space', 'width', 'word-break', 'word-wrap', 'z-index'];
const VALUES: Record<string, string[]> = {
  display: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none', 'contents', 'table', 'flow-root'],
  position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  'text-align': ['left', 'right', 'center', 'justify', 'start', 'end'],
  'justify-content': ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end', 'stretch'],
  'align-items': ['flex-start', 'flex-end', 'center', 'baseline', 'stretch', 'start', 'end'],
  overflow: ['visible', 'hidden', 'scroll', 'auto', 'clip'],
  cursor: ['pointer', 'default', 'text', 'move', 'grab', 'not-allowed', 'wait', 'crosshair', 'help'],
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'box-sizing': ['border-box', 'content-box'],
  'font-weight': ['normal', 'bold', 'bolder', 'lighter'],
  visibility: ['visible', 'hidden', 'collapse'],
};
const NESTING = /^@(media|supports|layer|container|document|scope|starting-style)\b/i;

const UNIT_PROPS = /^(width|height|margin|padding|top|left|right|bottom|font-size|gap|border-radius|max-width|min-width|max-height|min-height|margin-(top|bottom|left|right)|padding-(top|bottom|left|right))$/;
const hasSupports = () => typeof CSS !== 'undefined' && typeof CSS.supports === 'function';
const propOk = (p: string) => hasSupports() ? CSS.supports(p, 'initial') : COMMON.includes(p);

/** Comments become spaces and the inside of strings becomes x, so the positions stay the same. */
function mask(code: string): string {
  let o = '', i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '/' && code[i + 1] === '*') {
      const e = code.indexOf('*/', i + 2), end = e < 0 ? code.length : e + 2;
      o += code.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < code.length && code[j] !== ch && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
      const end = code[j] === ch ? j + 1 : j;
      o += ch + 'x'.repeat(Math.max(0, end - i - 2)) + (code[j] === ch ? ch : ''); i = end; continue;
    }
    o += ch; i++;
  }
  return o;
}

export async function checkCss(c: Ctx): Promise<Finding[]> {
  if (!c.code.trim()) return [];
  const out: Finding[] = [];
  const syn = await syntaxError(c.code, 'css');
  if (syn && syn !== 'off') {
    const e = explain(syn.message);
    out.push(atLine(syn.line, 'error', e.title, { col: syn.col, why: e.why, idea: e.idea }));
  }
  const m = mask(c.code);
  // walk the blocks
  const stack: { rules: boolean; seen: Map<string, number> }[] = [{ rules: true, seen: new Map() }];
  let seg = 0, i = 0;
  const flushDecl = (end: number) => {
    const top = stack[stack.length - 1];
    if (!top || top.rules) return;
    const raw = c.code.slice(seg, end), mk = m.slice(seg, end);
    const colon = mk.indexOf(':');
    if (colon < 0 || !mk.trim()) return;
    const lead = mk.length - mk.trimStart().length;
    const propPos = seg + lead;
    const prop = mk.slice(lead, colon).trim();
    const value = raw.slice(colon + 1).trim().replace(/\s*!important\s*$/i, '');
    if (!/^[-\w]+$/.test(prop)) return;
    const isVar = prop.startsWith('--');
    const pl = prop.toLowerCase();
    if (!isVar && !/^-(webkit|moz|ms|o)-/.test(pl) && !propOk(pl)) {
      const guess = nearest(pl, COMMON, pl.length >= 8 ? 2 : 1);
      if (!hasSupports() && !guess) { /* cannot tell without the browser's own list */ } else
      out.push(finding(c, propPos, 'warning', `${prop} is not a CSS property`, { why: 'The browser ignores a property it does not know.', idea: guess ? `Did you mean ${guess}?` : 'Check the spelling.', fix: guess ? swapAt(c, propPos, prop.length, guess) : undefined }));
    } else if (!isVar) {
      const key = pl;
      if (top.seen.has(key) && !/^-(webkit|moz|ms|o)-/.test(pl) && !value.includes('var(')) {
        const first = top.seen.get(key)!;
        out.push(finding(c, propPos, 'tip', `${prop} is set twice in this rule`, { why: `It is already set on line ${first}. Only the last one is used, unless the first is a fallback.`, idea: 'Remove one of them.' }));
      } else top.seen.set(key, lineOf(c.st, propPos).line);
      const vm = m.slice(colon + seg + 1, end);
      if (!value) out.push(finding(c, propPos, 'warning', `${prop} has no value`, { why: 'A property with nothing after the colon does nothing.', idea: 'Add a value, or remove the line.' }));
      else if (hasSupports() && !/var\(|env\(|attr\(/.test(vm) && !CSS.supports(pl, value) && !(UNIT_PROPS.test(pl) && /^-?\d*\.?\d+(\s+-?\d*\.?\d+)*$/.test(value) && value.split(/\s+/).some((x) => parseFloat(x) !== 0))) {
        const words = value.toLowerCase().split(/\s+/);
        const list = VALUES[pl];
        const guess = list && words.length === 1 ? nearest(words[0], list, 2) : null;
        const lineBreak = /\n/.test(value) && /:\s*\S/.test(value.replace(/\([^)]*\)/g, ''));
        const vpos = seg + colon + 1 + (raw.slice(colon + 1).length - raw.slice(colon + 1).trimStart().length);
        out.push(finding(c, vpos, 'warning', lineBreak ? `${prop} runs into the next line` : `${value.length > 28 ? value.slice(0, 26) + '…' : value} is not valid for ${prop}`, {
          why: lineBreak ? 'There is no ; at the end of this line, so the next line is read as part of the value.' : 'The browser ignores a line with a value it cannot read.',
          idea: lineBreak ? 'Add ; at the end of the first line.' : guess ? `Did you mean ${guess}?` : 'Check the spelling, the units and the brackets.',
          fix: guess ? swapAt(c, vpos, words[0].length, guess) : undefined,
        }));
      }
      // hex colours
      const hex = /#([0-9a-fA-F]+)\b/g; let h: RegExpExecArray | null;
      while ((h = hex.exec(vm))) if (![3, 4, 6, 8].includes(h[1].length) && /^(color|background|border|outline|fill|stroke|text-decoration|box-shadow|accent|caret)/.test(pl)) out.push(finding(c, seg + colon + 1 + h.index, 'error', `#${h[1]} is not a colour`, { why: 'A hex colour has 3, 4, 6 or 8 digits.', idea: h[1].length === 5 ? 'Add or remove one digit.' : `Use ${h[1].length < 6 ? 6 : 8} digits.` }));
      // numbers with no unit
      const nu = /(?:^|[\s(,])(-?\d*\.?\d+)(?=\s|;|,|\)|$)/g;
      if (UNIT_PROPS.test(pl)) {
        let n: RegExpExecArray | null;
        while ((n = nu.exec(' ' + value))) if (parseFloat(n[1]) !== 0) { out.push(finding(c, propPos, 'warning', `${n[1]} needs a unit`, { why: 'Lengths other than 0 need px, rem, % or another unit. The line is ignored without one.', idea: `Write ${n[1]}px, or ${n[1]}rem.` })); break; }
      }
    }
  };
  while (i < m.length) {
    const ch = m[i];
    if (ch === '{') {
      const prelude = m.slice(seg, i).trim();
      const top = stack[stack.length - 1];
      const rules = top.rules ? (NESTING.test(prelude) || /^@(-\w+-)?keyframes\b/i.test(prelude)) : false;
      stack.push({ rules, seen: new Map() });
      seg = i + 1;
    } else if (ch === ';') { flushDecl(i); seg = i + 1; }
    else if (ch === '}') {
      flushDecl(i);
      if (stack.length > 1) {
        const done = stack.pop()!;
        void done;
      }
      seg = i + 1;
    }
    i++;
  }
  // empty rules
  const emptyRe = /([^{}]+)\{\s*\}/g; let e: RegExpExecArray | null;
  while ((e = emptyRe.exec(m))) { const sel = e[1].trim(); if (sel && !sel.startsWith('@')) out.push(finding(c, e.index + e[1].length - e[1].trimStart().length, 'tip', 'This rule is empty', { why: `${sel.length > 30 ? sel.slice(0, 28) + '…' : sel} has no lines inside it.`, idea: 'Add some styles, or remove the rule.' })); }
  const runs = out.filter((f) => /runs into the next line/.test(f.title));
  const rest = runs.length ? out.filter((f) => !(f.severity === 'error' && /not valid CSS|does not fit/.test(f.title) && runs.some((r) => Math.abs(r.line - f.line) <= 1))) : out;
  return dedupe(rest);
}
const dedupe = (a: Finding[]) => { const s = new Set<string>(); return a.filter((f) => { const k = f.line + f.title; if (s.has(k)) return false; s.add(k); return true; }); };
