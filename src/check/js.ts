import { type Ctx, atLine, finding, nearest, swapAt } from './text';
import type { Finding } from './types';
import { explain, syntaxError } from './syntax';
import { STYLES, scanBrackets } from './scan';

/* eslint-disable @typescript-eslint/no-explicit-any */
const NODE_GLOBALS = new Set(['require', 'module', 'exports', '__dirname', '__filename', 'process', 'Buffer', 'global', 'arguments', 'define', 'undefined']);
const PROPS = ['length', 'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat', 'join', 'reverse', 'sort', 'indexOf', 'lastIndexOf', 'includes', 'forEach', 'map', 'filter', 'reduce', 'find', 'findIndex', 'some', 'every', 'keys', 'values', 'entries', 'toString', 'toFixed', 'toUpperCase', 'toLowerCase', 'trim', 'split', 'replace', 'replaceAll', 'substring', 'charAt', 'startsWith', 'endsWith', 'padStart', 'padEnd', 'innerHTML', 'textContent', 'innerText', 'classList', 'addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'createElement', 'appendChild', 'removeChild', 'setAttribute', 'getAttribute', 'parentNode', 'children', 'firstChild', 'preventDefault', 'stopPropagation', 'then', 'catch', 'finally', 'stringify', 'assign', 'hasOwnProperty', 'toISOString', 'localeCompare', 'isArray', 'parseInt', 'parseFloat', 'fromEntries', 'getTime', 'floor', 'ceil', 'round', 'random'];
const BROWSER = new Set('window document self navigator location history localStorage sessionStorage console fetch alert prompt confirm setTimeout setInterval clearTimeout clearInterval requestAnimationFrame cancelAnimationFrame requestIdleCallback performance screen Image Audio FormData URL URLSearchParams Blob File FileReader XMLHttpRequest WebSocket Worker IntersectionObserver MutationObserver ResizeObserver CustomEvent Event KeyboardEvent MouseEvent PointerEvent TouchEvent crypto indexedDB atob btoa structuredClone queueMicrotask matchMedia getComputedStyle innerWidth innerHeight scrollTo scrollBy scrollY scrollX devicePixelRatio open close print postMessage addEventListener removeEventListener dispatchEvent AudioContext HTMLElement Node Element customElements DOMParser Intl Symbol WeakMap WeakSet Proxy Reflect globalThis AbortController Request Response Headers TextEncoder TextDecoder navigator Notification caches ServiceWorker speechSynthesis SpeechSynthesisUtterance localStorage CSS Path2D OffscreenCanvas ImageData createImageBitmap BroadcastChannel MessageChannel Promise Map Set JSON Math Date RegExp Number String Boolean Array Object Error TypeError RangeError BigInt parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape eval NaN Infinity'.split(' '));
const TYPEOF = new Set(['undefined', 'object', 'boolean', 'number', 'bigint', 'string', 'symbol', 'function']);
const JUNK = ['__proto__', 'constructor'];
/** Every property name the language and the browser already have, so a real name is never called a typo. */
const REAL = (() => {
  const s = new Set<string>();
  const add = (o: unknown) => { try { let p: any = o; for (let i = 0; p != null && i < 6; i++) { Object.getOwnPropertyNames(p).forEach((k) => s.add(k)); p = Object.getPrototypeOf(p); } } catch { /* skip */ } };
  [[], '', 0, {}, () => 0, Promise.prototype, Map.prototype, Set.prototype, /x/, new Date(0), Math, JSON, Number, Object, Array, String, Symbol.prototype, console].forEach(add);
  const g: any = globalThis;
  if (typeof document !== 'undefined') {
    ['HTMLElement', 'Element', 'Node', 'Document', 'Event', 'MouseEvent', 'KeyboardEvent', 'HTMLInputElement', 'HTMLCanvasElement', 'CanvasRenderingContext2D', 'CSSStyleDeclaration', 'Window', 'Storage', 'URL', 'DOMTokenList', 'NodeList', 'HTMLCollection', 'FormData', 'Response', 'Request', 'Headers', 'EventTarget', 'History', 'Location', 'Navigator', 'Blob', 'File', 'FileReader', 'Image', 'Audio', 'HTMLMediaElement'].forEach((n) => { try { add(g[n]?.prototype ?? g[n]); } catch { /* skip */ } });
  }
  return s;
})();

function patternIds(p: any, out: any[] = []): any[] {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p); break;
    case 'ObjectPattern': p.properties.forEach((x: any) => patternIds(x.type === 'RestElement' ? x.argument : x.value, out)); break;
    case 'ArrayPattern': p.elements.forEach((x: any) => patternIds(x, out)); break;
    case 'AssignmentPattern': patternIds(p.left, out); break;
    case 'RestElement': patternIds(p.argument, out); break;
  }
  return out;
}

interface Decl { count: number; kind: string; node: any; decl?: any; top: boolean; exported: boolean }

/** Reads the code with a real parser and looks for the mistakes people make most. */
function lint(c: Ctx, ast: any, isModule: boolean): Finding[] {
  const out: Finding[] = [];
  const declared = new Map<string, Decl>();
  const declSet = new Set<any>();
  const reads = new Map<string, any>();         // name -> first reading node
  const writes = new Map<string, any[]>();
  const exportedIds = new Set<string>();
  const propDefs = new Set<string>();
  const propUses: { name: string; node: any }[] = [];
  let vars = 0, firstVar: any = null, tips = 0;
  const TIP_CAP = 6;

  const declare = (id: any, kind: string, decl: any, top: boolean) => {
    declSet.add(id);
    const d = declared.get(id.name);
    if (d) d.count++; else declared.set(id.name, { count: 1, kind, node: id, decl, top, exported: false });
  };
  const at = (n: any) => n.start as number;
  const opPos = (n: any, op: string) => { const p = c.code.indexOf(op, n.left.end); return p >= 0 && p < n.right.start ? p : -1; };

  const visit = (n: any, parent: any, key: string, top: boolean) => {
    if (!n || typeof n.type !== 'string') return;
    switch (n.type) {
      case 'VariableDeclaration':
        n.declarations.forEach((d: any) => patternIds(d.id).forEach((id) => declare(id, n.kind, n, parent?.type === 'Program' || parent?.type === 'ExportNamedDeclaration')));
        if (n.kind === 'var') { vars++; firstVar ??= n; }
        break;
      case 'FunctionDeclaration': if (n.id) declare(n.id, 'function', n, parent?.type === 'Program' || parent?.type === 'ExportNamedDeclaration' || parent?.type === 'ExportDefaultDeclaration'); n.params.forEach((p: any) => patternIds(p).forEach((id) => declare(id, 'param', n, false))); break;
      case 'FunctionExpression': if (n.id) declare(n.id, 'fname', n, false); n.params.forEach((p: any) => patternIds(p).forEach((id) => declare(id, 'param', n, false))); break;
      case 'ArrowFunctionExpression': n.params.forEach((p: any) => patternIds(p).forEach((id) => declare(id, 'param', n, false))); break;
      case 'ClassDeclaration': if (n.id) declare(n.id, 'class', n, parent?.type === 'Program' || parent?.type === 'ExportNamedDeclaration'); break;
      case 'ClassExpression': if (n.id) declare(n.id, 'fname', n, false); break;
      case 'ImportDeclaration': n.specifiers.forEach((s: any) => declare(s.local, 'import', n, true)); break;
      case 'CatchClause': patternIds(n.param).forEach((id) => declare(id, 'catch', n, false));
        if (n.body.body.length === 0 && tips < TIP_CAP) { tips++; out.push(finding(c, at(n), 'tip', 'Errors are ignored here', { why: 'The catch block is empty, so a failure disappears silently.', idea: 'Log the error or handle it inside the block.' })); }
        break;
      case 'ExportNamedDeclaration':
        if (n.declaration?.declarations) n.declaration.declarations.forEach((d: any) => patternIds(d.id).forEach((id: any) => exportedIds.add(id.name)));
        if (n.declaration?.id) exportedIds.add(n.declaration.id.name);
        n.specifiers?.forEach((s: any) => { reads.set(s.local.name, reads.get(s.local.name) ?? s.local); });
        break;
      case 'Property': if (!n.computed && n.key.type === 'Identifier') propDefs.add(n.key.name); else if (n.key?.type === 'Literal') propDefs.add(String(n.key.value)); break;
      case 'MethodDefinition': case 'PropertyDefinition': if (!n.computed && n.key.type === 'Identifier') propDefs.add(n.key.name); break;
      case 'MemberExpression':
        if (!n.computed && n.property.type === 'Identifier') {
          if (parent?.type === 'AssignmentExpression' && key === 'left') propDefs.add(n.property.name);
          else propUses.push({ name: n.property.name, node: n.property });
        }
        break;
      case 'BinaryExpression': {
        const eq = n.operator === '==' || n.operator === '!=' || n.operator === '===' || n.operator === '!==';
        if (eq) {
          const sides = [n.left, n.right];
          if (sides.some((s) => s.type === 'Identifier' && s.name === 'NaN')) out.push(finding(c, at(n), 'error', 'Nothing equals NaN', { why: 'NaN is never equal to anything, not even itself, so this test never passes.', idea: 'Use Number.isNaN(value) instead.' }));
          const ty = sides.findIndex((s) => s.type === 'UnaryExpression' && s.operator === 'typeof'), lit = ty >= 0 ? sides[1 - ty] : null;
          if (lit && lit.type === 'Literal' && typeof lit.value === 'string' && !TYPEOF.has(lit.value)) {
            const guess = nearest(lit.value, TYPEOF, 3);
            out.push(finding(c, at(lit), 'error', `"${lit.value}" is not a type name`, { why: 'typeof gives one of: undefined, object, boolean, number, bigint, string, symbol, function.', idea: guess ? `Did you mean "${guess}"?` : 'Use one of the type names above.', fix: guess ? swapAt(c, at(lit) + 1, lit.value.length, guess) : undefined }));
          }
          if ((n.operator === '==' || n.operator === '!=') && !sides.some((s) => s.type === 'Literal' && s.value === null) && tips < TIP_CAP) {
            const p = opPos(n, n.operator);
            if (p >= 0) { tips++; out.push(finding(c, p, 'tip', `Use ${n.operator}= instead of ${n.operator}`, { why: `${n.operator} converts types before comparing, which gives surprises like 0 == "".`, idea: `Write ${n.operator}= so both type and value must match.`, fix: swapAt(c, p, n.operator.length, n.operator + '=') })); }
          }
        }
        break;
      }
      case 'IfStatement': case 'WhileStatement': case 'DoWhileStatement': case 'ConditionalExpression': case 'ForStatement':
        if (n.test?.type === 'AssignmentExpression' && n.test.operator === '=' && ['Literal', 'Identifier', 'TemplateLiteral', 'BinaryExpression', 'UnaryExpression', 'ArrayExpression', 'ObjectExpression'].includes(n.test.right.type)) {
          const p = opPos(n.test, '=');
          out.push(finding(c, p >= 0 ? p : at(n.test), 'warning', 'This assigns instead of comparing', { why: 'A single = sets a value. In a condition that is almost always a slip.', idea: 'Use === to compare. If the assignment is on purpose, wrap it in extra brackets.', fix: p >= 0 ? swapAt(c, p, 1, '===') : undefined }));
        }
        break;
      case 'ObjectExpression': {
        const seen = new Set<string>();
        n.properties.forEach((p: any) => {
          if (p.type !== 'Property' || p.computed || p.kind !== 'init') return;
          const k = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null;
          if (k === null) return;
          if (seen.has(k) && !JUNK.includes(k)) out.push(finding(c, at(p), 'warning', `"${k}" is set twice in this object`, { why: 'Only the last one counts.', idea: 'Remove one, or rename it.' }));
          seen.add(k);
        });
        break;
      }
      case 'AssignmentExpression': if (n.left.type === 'Identifier') { const a = writes.get(n.left.name) ?? []; a.push(n.left); writes.set(n.left.name, a); } break;
      case 'UpdateExpression': if (n.argument.type === 'Identifier') { const a = writes.get(n.argument.name) ?? []; a.push(n.argument); writes.set(n.argument.name, a); } break;
      case 'Identifier': {
        if (declSet.has(n)) break;
        if (parent) {
          if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) break;
          if ((parent.type === 'Property' || parent.type === 'PropertyDefinition' || parent.type === 'MethodDefinition') && key === 'key' && !parent.computed && !(parent.type === 'Property' && parent.shorthand)) break;
          if ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && key === 'label') break;
          if ((parent.type === 'ImportSpecifier' && key === 'imported') || (parent.type === 'ExportSpecifier' && key === 'exported')) break;
          if (parent.type === 'MetaProperty') break;
          if (parent.type === 'UnaryExpression' && parent.operator === 'typeof' && !declared.has(n.name)) { declSet.add(n); break; }
          if (parent.type === 'AssignmentExpression' && key === 'left') { if (!reads.has('~w:' + n.name)) reads.set('~w:' + n.name, n); break; }
          if (parent.type === 'UpdateExpression') { if (!reads.has('~w:' + n.name)) reads.set('~w:' + n.name, n); break; }
        }
        if (!reads.has(n.name)) reads.set(n.name, n);
        break;
      }
    }
    // unreachable code after return / throw / break / continue
    const body = n.type === 'BlockStatement' || n.type === 'Program' || n.type === 'StaticBlock' ? n.body : n.type === 'SwitchCase' ? n.consequent : null;
    if (Array.isArray(body)) {
      const i = body.findIndex((s: any) => s.type === 'ReturnStatement' || s.type === 'ThrowStatement' || s.type === 'BreakStatement' || s.type === 'ContinueStatement');
      if (i >= 0) { const rest = body.slice(i + 1).filter((s: any) => s.type !== 'FunctionDeclaration'); if (rest.length) out.push(finding(c, at(rest[0]), 'warning', 'This code never runs', { why: `It comes after a ${body[i].type.replace('Statement', '').toLowerCase()}, so execution never reaches it.`, idea: 'Remove it, or move it before the line above.' })); }
    }
    for (const k in n) {
      if (k === 'type' || k === 'start' || k === 'end') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => visit(x, n, k, false));
      else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v, n, k, false);
    }
  };
  visit(ast, null, '', true);

  // exported names are not "unused"
  exportedIds.forEach((x) => { const d = declared.get(x); if (d) d.exported = true; });

  // names that are used but not declared anywhere
  const globals = (globalThis as any) ?? {};
  const known = new Set<string>(); try { Object.getOwnPropertyNames(globals).forEach((g) => known.add(g)); } catch { /* none */ }
  const suggest = [...declared.keys(), ...[...known].filter((k) => k.length >= 4)];
  const undef: string[] = [];
  const check = (name: string, node: any) => {
    if (declared.has(name) || known.has(name) || NODE_GLOBALS.has(name) || BROWSER.has(name) || undef.includes(name)) return;
    undef.push(name);
    const guess = name.length >= 3 ? nearest(name, suggest, name.length >= 6 ? 2 : 1) : null;
    out.push(finding(c, at(node), 'warning', `${name} is not defined here`, { why: 'Nothing in this code, or in the browser, has this name.', idea: guess ? `Did you mean ${guess}? If ${name} comes from a script or library loaded elsewhere, you can ignore this.` : `Declare it first, or check the spelling. If it comes from a script or library loaded elsewhere, you can ignore this.`, fix: guess ? swapAt(c, at(node), name.length, guess) : undefined }));
  };
  reads.forEach((node, name) => { if (!name.startsWith('~w:')) check(name, node); });
  reads.forEach((node, name) => { if (name.startsWith('~w:')) check(name.slice(3), node); });

  // const that is assigned again
  writes.forEach((nodes, name) => {
    const d = declared.get(name);
    if (d && d.kind === 'const' && d.count === 1 && d.decl) {
      out.push(finding(c, at(nodes[0]), 'error', `${name} is a const, so it cannot be changed`, { why: 'const stops a name from being given a new value. This line will throw an error.', idea: `Declare ${name} with let instead of const.`, fix: swapAt(c, at(d.decl), 5, 'let') }));
    }
  });

  // declared but never read
  declared.forEach((d, name) => {
    if (name.startsWith('_') || d.exported || ['param', 'fname', 'catch'].includes(d.kind) || reads.has(name)) return;
    if (d.kind === 'function' && d.top && !isModule) return;           // a plain script's functions may be called from the page
    const isImport = d.kind === 'import';
    out.push(finding(c, at(d.node), 'warning', isImport ? `${name} is imported but never used` : `${name} is never used`, { why: writes.has(name) ? 'It is given a value but the value is never read.' : 'Nothing reads it.', idea: isImport ? 'Remove the import.' : 'Remove it, or use it.' }));
  });

  // names of things that are probably misspelt
  const seen = new Set<string>();
  propUses.forEach(({ name, node }) => {
    if (name.length < 4 || propDefs.has(name) || PROPS.includes(name) || REAL.has(name) || seen.has(name)) return;
    const guess = nearest(name, PROPS, name.length >= 8 ? 2 : 1);
    if (!guess) return;
    seen.add(name);
    out.push(finding(c, at(node), 'warning', `.${name} looks misspelt`, { why: `Nothing in this code defines .${name}, and it is very close to a common name.`, idea: `Did you mean .${guess}?`, fix: swapAt(c, at(node), name.length, guess) }));
  });

  if (vars && tips < TIP_CAP) out.push(finding(c, at(firstVar), 'tip', vars > 1 ? `var is used ${vars} times` : 'var is used', { why: 'var ignores block scope, which causes hard-to-find bugs.', idea: 'Use const for values that do not change and let for the rest.' }));
  return out;
}

async function parse(code: string): Promise<{ ast: any; module: boolean } | { err: { message: string; pos: number } }> {
  const acorn: any = await import('acorn');
  const opts = { ecmaVersion: 'latest', preserveParens: true, allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, allowImportExportEverywhere: true };
  try { return { ast: acorn.parse(code, { ...opts, sourceType: 'module' }), module: true }; }
  catch (a) {
    try { return { ast: acorn.parse(code, { ...opts, sourceType: 'script' }), module: false }; }
    catch { const e = a as { message?: string; pos?: number }; return { err: { message: String(e.message ?? 'Syntax error').replace(/\s*\(\d+:\d+\)$/, ''), pos: e.pos ?? 0 } }; }
  }
}

export async function checkJs(c: Ctx): Promise<Finding[]> {
  if (!c.code.trim()) return [];
  let r: Awaited<ReturnType<typeof parse>>;
  try { r = await parse(c.code); } catch { return syntaxOnly(c, 'babel'); }
  if ('ast' in r) return lint(c, r.ast, r.module);
  // The code stops before something is closed: the bracket scan says which one, and where it opened.
  if (r.err.pos >= c.code.trimEnd().length - 1) { const b = scanBrackets(c, STYLES.other); if (b.length) return b; }
  // acorn could not read it. A real parser that knows JSX gets the final say.
  const s = await syntaxError(c.code, 'babel');
  if (s === null) return [atLine(1, 'tip', 'Checked for syntax only', { why: 'This code uses JSX or newer syntax, so only the syntax was checked.', idea: 'Ask Coe for a deeper look.' })];
  if (s === 'off') { const f = finding(c, r.err.pos, 'error', r.err.message); return [{ ...f, ...explainPlain(r.err.message) }]; }
  return [{ ...atLine(s.line, 'error', explain(s.message).title, { col: s.col, why: explain(s.message).why, idea: explain(s.message).idea }) }];
}
const explainPlain = (m: string) => { const e = explain(m); return { title: e.title, why: e.why, idea: e.idea }; };

export async function syntaxOnly(c: Ctx, kind: 'babel' | 'ts'): Promise<Finding[]> {
  if (!c.code.trim()) return [];
  const s = await syntaxError(c.code, kind);
  if (s === null) return kind === 'ts' ? [atLine(1, 'tip', 'Checked for syntax only', { why: 'The syntax is valid. Type errors are not checked here.', idea: 'Ask Coe for a deeper look.' })] : [];
  if (s === 'off') return [atLine(1, 'tip', 'The syntax checker could not load', { why: 'It is needed for this language.', idea: 'Check your connection, then reload the page.' })];
  const e = explain(s.message);
  return [atLine(s.line, 'error', e.title, { col: s.col, why: e.why, idea: e.idea })];
}
