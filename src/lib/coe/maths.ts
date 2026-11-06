/**
 * An exact maths engine, so Coe does not have to guess at sums. Loaded only when a tool asks for it.
 * mathjs: numbers, units, matrices, statistics. nerdamer: algebra and calculus with symbols.
 */
export interface MathsResult { text: string; md: string }

type Nerd = {
  (e: string, s?: Record<string, unknown>): { toString(): string; toTeX(): string; evaluate(): { text(): string } };
  solve(eq: string, v: string): { toString(): string; toTeX(): string };
  solveEquations(eqs: string[], vars?: string[]): unknown;
  convertToLaTeX(e: string): string;
};
let nerd: Nerd | null = null;
async function loadNerd(): Promise<Nerd> {
  if (nerd) return nerd;
  const m = (await import('nerdamer/all.js')) as unknown as { default?: Nerd } & Nerd;
  nerd = (m.default ?? m) as Nerd; return nerd;
}
type Mj = typeof import('mathjs');
let mj: Mj | null = null;
async function loadMj(): Promise<Mj> { return (mj ??= await import('mathjs')); }

const clip = (s: string, n = 4000) => (s.length > n ? s.slice(0, n) + '…' : s);
/** Turn what a user or Coe typed into something both engines read: ^ powers, implicit times are left to them. */
const tidy = (s: string) => s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/√\s*\(/g, 'sqrt(').replace(/π/g, 'pi').replace(/\\cdot/g, '*').trim();
const tex = (n: Nerd, s: string) => { try { return n.convertToLaTeX(s); } catch { return s; } };

const SYM = /[a-df-hj-zA-Z]/;   // letters other than e and i, so "e" and "i" can still be constants
async function numericOnly(expr: string): Promise<boolean> { return !SYM.test(expr.replace(/\b(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|log|ln|sqrt|abs|exp|pi|det|inv|mean|std|median|sum|min|max|round|floor|ceil|factorial|gcd|lcm|mod|cbrt|nthRoot|cross|dot|transpose|usePrettyPrint|to|in|deg|rad)\b/g, '')); }

export async function runMaths(c: { op: string; expr?: string; exprs?: string[]; variable?: string; vars?: string[]; from?: string; to?: string; at?: string; digits?: number }): Promise<MathsResult> {
  const op = String(c.op || 'eval').toLowerCase();
  const expr = tidy(String(c.expr ?? ''));
  const v = (c.variable || 'x').trim() || 'x';
  if (op === 'eval' || op === 'calc' || op === 'evaluate') {
    if (!expr) throw new Error('Give an "expr" to work out.');
    const m = await loadMj();
    const math = m.create(m.all);
    const r = math.evaluate(expr);
    const f = math.format(r, { precision: Math.min(30, Math.max(3, c.digits ?? 14)) });
    let t = ''; try { t = math.parse(expr).toTex(); } catch { /* no tex */ }
    let rt = ''; try { rt = (typeof r === 'object' && r?.toTex) ? r.toTex() : String(f); } catch { rt = String(f); }
    return { text: `${expr} = ${f}`, md: `$$${t || expr} = ${rt}$$` };
  }
  const n = await loadNerd();
  if (op === 'solve') {
    const eqs = (c.exprs?.length ? c.exprs : [expr]).map(tidy).filter(Boolean);
    if (!eqs.length) throw new Error('Give an equation in "expr", or several in "exprs".');
    if (eqs.length > 1) {
      const vs = (c.vars?.length ? c.vars : [v]).map(String);
      const sol = n.solveEquations(eqs, vs) as unknown as [string, unknown][];
      const lines = sol.map((p) => `${p[0]} = ${String(p[1])}`);
      return { text: lines.join('\n'), md: `$$\\begin{aligned}${sol.map((p) => `${p[0]} &= ${tex(n, String(p[1]))}`).join('\\\\')}\\end{aligned}$$` };
    }
    const s = n.solve(eqs[0], v);
    const list = s.toString().replace(/^\[|\]$/g, '').split(/,(?![^()]*\))/).map((x) => x.trim()).filter(Boolean);
    const dec = await Promise.all(list.map(async (x) => { try { const mm = (await loadMj()).evaluate(x.replace(/i\b/g, 'i')); const f = (await loadMj()).format(mm, { precision: 8 }); return f !== x ? ` ≈ ${f}` : ''; } catch { return ''; } }));
    return { text: list.length ? list.map((x, i) => `${v} = ${x}${dec[i]}`).join('\n') : 'No solution found.', md: list.length ? `$$\\begin{aligned}${list.map((x) => `${v} &= ${tex(n, x)}`).join('\\\\')}\\end{aligned}$$` : '_No solution found._' };
  }
  if (!expr) throw new Error('Give an "expr".');
  const mk: Record<string, string> = {
    simplify: `simplify(${expr})`, expand: `expand(${expr})`, factor: `factor(${expr})`,
    diff: `diff(${expr},${v}${c.at ? '' : ''})`,
    integrate: c.from !== undefined && c.to !== undefined ? `defint(${expr},${tidy(String(c.from))},${tidy(String(c.to))},${v})` : `integrate(${expr},${v})`,
    limit: `limit(${expr},${v},${tidy(String(c.at ?? '0'))})`,
    sum: `sum(${expr},${v},${tidy(String(c.from ?? '1'))},${tidy(String(c.to ?? '10'))})`,
  };
  if (!mk[op]) throw new Error('Unknown op "' + op + '". Use eval, solve, simplify, expand, factor, diff, integrate, limit or sum.');
  const r = n(mk[op]);
  const s = r.toString(), t = r.toTeX();
  let approx = '';
  if ((op === 'integrate' && c.from !== undefined) || op === 'limit' || op === 'sum') { try { const e = r.evaluate().text(); if (e && e !== s) approx = e; } catch { /* exact only */ } }
  let evalAt = '';
  if (op === 'diff' && c.at !== undefined) { try { evalAt = n(`${s}`, { [v]: tidy(String(c.at)) }).evaluate().text(); } catch { /* skip */ } }
  const label = { simplify: 'Simplified', expand: 'Expanded', factor: 'Factorised', diff: `Derivative with respect to ${v}`, integrate: c.from !== undefined ? 'Definite integral' : 'Integral', limit: 'Limit', sum: 'Sum' }[op];
  return {
    text: `${label}: ${clip(s)}${op === 'integrate' && c.from === undefined ? ' (+ C)' : ''}${approx ? `\nDecimal: ${clip(approx, 200)}` : ''}${evalAt ? `\nAt ${v}=${c.at}: ${evalAt}` : ''}`,
    md: `**${label}**\n\n$$${clip(t, 3000)}${op === 'integrate' && c.from === undefined ? ' + C' : ''}$$${approx ? `\n\nDecimal: $${approx}$` : ''}${evalAt ? `\n\nAt $${v}=${c.at}$: $${evalAt}$` : ''}`,
  };
}
export { numericOnly };
