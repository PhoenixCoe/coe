'use client';
/** The maths keyboard: build an equation with buttons or LaTeX, see it drawn as you go, then drop it into the message. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { Switch } from '@/ui/Controls';
import { loadMath, texHtml } from './markdown';

const CUR = '‸';
type Item = [string, string];   // [what the button shows (LaTeX), what it inserts]
const TABS: { id: string; name: string; items: Item[] }[] = [
  { id: 'basic', name: 'Basics', items: [
    ['\\frac{a}{b}', '\\frac{‸}{}'], ['x^{2}', '^{‸}'], ['x_{n}', '_{‸}'], ['\\sqrt{x}', '\\sqrt{‸}'], ['\\sqrt[n]{x}', '\\sqrt[‸]{}'], ['\\pm', '\\pm '], ['\\times', '\\times '], ['\\div', '\\div '], ['\\cdot', '\\cdot '],
    ['\\neq', '\\neq '], ['\\approx', '\\approx '], ['\\leq', '\\leq '], ['\\geq', '\\geq '], ['<', '<'], ['>', '>'], ['\\infty', '\\infty '], ['\\%', '\\%'], ['(\\,)', '\\left( ‸ \\right)'], ['|x|', '\\left| ‸ \\right|'],
    ['\\binom{n}{k}', '\\binom{‸}{}'], ['n!', '!'], ['\\bar{x}', '\\bar{‸}'], ['\\vec{v}', '\\vec{‸}'], ['\\hat{x}', '\\hat{‸}'], ['\\overline{AB}', '\\overline{‸}'], ['\\angle', '\\angle '], ['^\\circ', '^{\\circ}'], ['\\triangle', '\\triangle '], ['\\perp', '\\perp '], ['\\parallel', '\\parallel '],
  ] },
  { id: 'greek', name: 'Greek', items: ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega'].map((n) => ['\\' + n, '\\' + n + ' '] as Item) },
  { id: 'calc', name: 'Calculus', items: [
    ['\\int', '\\int ‸ \\, dx'], ['\\int_a^b', '\\int_{a}^{b} ‸ \\, dx'], ['\\iint', '\\iint ‸ \\, dA'], ['\\oint', '\\oint ‸ \\, ds'], ['\\sum_{i=1}^{n}', '\\sum_{i=1}^{n} ‸'], ['\\prod', '\\prod_{i=1}^{n} ‸'], ['\\lim_{x\\to a}', '\\lim_{x \\to ‸}'],
    ['\\frac{d}{dx}', '\\frac{d}{dx}\\left(‸\\right)'], ['\\frac{dy}{dx}', '\\frac{dy}{dx}'], ['\\frac{\\partial f}{\\partial x}', '\\frac{\\partial ‸}{\\partial x}'], ['f\'(x)', "f'(x)"], ['\\nabla', '\\nabla '], ['\\partial', '\\partial '], ['\\to', '\\to '], ['\\mathrm{d}x', '\\,\\mathrm{d}x'], ['\\Big|_a^b', '\\Big|_{a}^{b}'],
    ['\\ln', '\\ln\\left(‸\\right)'], ['\\log_b', '\\log_{‸}'], ['e^{x}', 'e^{‸}'], ['\\sin', '\\sin\\left(‸\\right)'], ['\\cos', '\\cos\\left(‸\\right)'], ['\\tan', '\\tan\\left(‸\\right)'], ['\\sin^{-1}', '\\sin^{-1}\\left(‸\\right)'],
  ] },
  { id: 'algebra', name: 'Matrices', items: [
    ['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', '\\begin{pmatrix} ‸ & \\\\ & \\end{pmatrix}'], ['\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}', '\\begin{bmatrix} ‸ & \\\\ & \\end{bmatrix}'], ['\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}', '\\begin{vmatrix} ‸ & \\\\ & \\end{vmatrix}'],
    ['\\begin{cases}x\\\\y\\end{cases}', '\\begin{cases} ‸ & \\text{if } \\\\ & \\text{otherwise} \\end{cases}'], ['\\begin{aligned}a&=b\\\\&=c\\end{aligned}', '\\begin{aligned} ‸ &= \\\\ &= \\end{aligned}'],
    ['\\mathbf{A}', '\\mathbf{‸}'], ['A^{T}', '^{T}'], ['A^{-1}', '^{-1}'], ['\\det', '\\det\\left(‸\\right)'], ['\\mathbb{R}', '\\mathbb{R}'], ['\\mathbb{C}', '\\mathbb{C}'], ['\\ldots', '\\ldots '], ['\\vdots', '\\vdots '], ['\\ddots', '\\ddots '],
  ] },
  { id: 'sets', name: 'Sets & logic', items: [
    ['\\in', '\\in '], ['\\notin', '\\notin '], ['\\subset', '\\subset '], ['\\subseteq', '\\subseteq '], ['\\cup', '\\cup '], ['\\cap', '\\cap '], ['\\emptyset', '\\emptyset '], ['\\setminus', '\\setminus '], ['\\{ \\}', '\\left\\{ ‸ \\right\\}'],
    ['\\mathbb{N}', '\\mathbb{N}'], ['\\mathbb{Z}', '\\mathbb{Z}'], ['\\mathbb{Q}', '\\mathbb{Q}'], ['\\mathbb{R}', '\\mathbb{R}'], ['\\mathbb{C}', '\\mathbb{C}'], ['\\forall', '\\forall '], ['\\exists', '\\exists '], ['\\neg', '\\neg '], ['\\land', '\\land '], ['\\lor', '\\lor '],
    ['\\Rightarrow', '\\Rightarrow '], ['\\Leftrightarrow', '\\Leftrightarrow '], ['\\therefore', '\\therefore '], ['\\because', '\\because '], ['\\equiv', '\\equiv '], ['\\mid', '\\mid '], ['\\propto', '\\propto '],
  ] },
  { id: 'arrows', name: 'Arrows', items: [['\\rightarrow', '\\rightarrow '], ['\\leftarrow', '\\leftarrow '], ['\\leftrightarrow', '\\leftrightarrow '], ['\\Rightarrow', '\\Rightarrow '], ['\\Leftarrow', '\\Leftarrow '], ['\\Leftrightarrow', '\\Leftrightarrow '], ['\\mapsto', '\\mapsto '], ['\\uparrow', '\\uparrow '], ['\\downarrow', '\\downarrow '], ['\\longrightarrow', '\\longrightarrow '], ['\\rightleftharpoons', '\\rightleftharpoons '], ['\\xrightarrow{a}', '\\xrightarrow{‸}']] },
  { id: 'chem', name: 'Chemistry', items: [
    ['\\ce{H2O}', '\\ce{H2O}'], ['\\ce{CO2}', '\\ce{CO2}'], ['\\ce{2H2 + O2 -> 2H2O}', '\\ce{2H2 + O2 -> 2H2O}'], ['\\ce{A <=> B}', '\\ce{‸ <=> }'], ['\\ce{Na+}', '\\ce{Na+}'], ['\\ce{SO4^2-}', '\\ce{SO4^2-}'], ['\\ce{^{14}C}', '\\ce{^{14}C}'], ['\\ce{CH3COOH}', '\\ce{CH3COOH}'], ['\\ce{Fe^{3+}}', '\\ce{Fe^{3+}}'], ['\\ce{A ->[\\Delta] B}', '\\ce{‸ ->[\\Delta] }'], ['\\ce{CuSO4.5H2O}', '\\ce{CuSO4.5H2O}'], ['\\ce{v}', '\\ce{v}'],
    ['\\ce{^}', '\\ce{‸^}'], ['\\ce{(aq)}', '\\ce{(aq)}'], ['\\ce{(s)}', '\\ce{(s)}'], ['\\ce{(l)}', '\\ce{(l)}'], ['\\ce{(g)}', '\\ce{(g)}'], ['\\Delta H', '\\Delta H '], ['\\mathrm{pH}', '\\mathrm{pH}'], ['\\mathrm{mol}', '\\,\\mathrm{mol}'],
  ] },
];
const EXAMPLES: [string, string][] = [
  ['Quadratic formula', 'x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}'],
  ['Pythagoras', 'a^{2} + b^{2} = c^{2}'],
  ['Euler', 'e^{i\\pi} + 1 = 0'],
  ['Definite integral', '\\int_{0}^{1} x^{2} \\, dx = \\frac{1}{3}'],
  ['Limit', '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'],
  ['Normal curve', 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^{2}}{2\\sigma^{2}}}'],
  ['Photosynthesis', '\\ce{6CO2 + 6H2O ->[light] C6H12O6 + 6O2}'],
  ['Series', '\\sum_{n=1}^{\\infty} \\frac{1}{n^{2}} = \\frac{\\pi^{2}}{6}'],
];

export function MathPad({ onInsert, onClose }: { onInsert: (md: string) => void; onClose: () => void }) {
  const [tex, setTex] = useState(''), [tab, setTab] = useState('basic'), [display, setDisplay] = useState(false), [ready, setReady] = useState(false), [copied, setCopied] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { void loadMath().then(() => setReady(true)); ta.current?.focus(); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const put = (snip: string) => {
    const el = ta.current, a = el?.selectionStart ?? tex.length, b = el?.selectionEnd ?? tex.length;
    const sel = tex.slice(a, b), at = snip.indexOf(CUR);
    const piece = at >= 0 ? snip.slice(0, at) + sel + snip.slice(at + 1) : snip;
    const next = tex.slice(0, a) + piece + tex.slice(b), pos = a + (at >= 0 ? at + sel.length : piece.length);
    setTex(next); requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos); });
  };
  const preview = useMemo(() => (ready && tex.trim() ? texHtml(tex, true) : ''), [tex, ready]);
  const tabItems = TABS.find((t) => t.id === tab)!.items;
  const finish = () => { const t = tex.trim(); if (!t) return; onInsert(display || /\\begin|\\\\|\\tag/.test(t) ? `\n$$\n${t}\n$$\n` : `$${t}$`); };
  const copy = () => { navigator.clipboard?.writeText(tex.trim()).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); }, () => {}); };

  return (
    <div className="cx-mp" role="dialog" aria-label="Maths keyboard">
      <div className="cx-mp-top"><b className="d"><UiIcon name="sigma" size={16} />Maths keyboard</b><span className="cx-grow" /><button type="button" className="cx-act" onClick={onClose} aria-label="Close"><UiIcon name="close" size={14} /></button></div>
      <div className="cx-mp-tabs" role="tablist">{TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.name}</button>)}</div>
      <div className="cx-mp-keys">
        {tabItems.map(([show, ins], i) => <button key={tab + i} type="button" className="cx-mp-key" title={ins.replace(CUR, '')} onClick={() => put(ins)} dangerouslySetInnerHTML={{ __html: ready ? texHtml(show, false) : '' }} />)}
      </div>
      <textarea ref={ta} className="cx-mp-ta" rows={2} value={tex} onChange={(e) => setTex(e.target.value)} placeholder="Type LaTeX here, or use the keys. For example \frac{1}{2}" spellCheck={false} aria-label="LaTeX" />
      <div className="cx-mp-view" aria-live="polite">{preview ? <span dangerouslySetInnerHTML={{ __html: preview }} /> : <i className="tx">Your equation shows here as you build it.</i>}</div>
      <div className="cx-mp-ex"><span className="tx">Try</span>{EXAMPLES.map(([n, t]) => <button key={n} type="button" className="cx-link" onClick={() => setTex(t)}>{n}</button>)}</div>
      <div className="cx-mp-bar">
        <Switch label="On its own line" on={display} onChange={setDisplay} />
        <span className="cx-grow" />
        <button type="button" className="btn small" onClick={copy} disabled={!tex.trim()}>{copied ? 'Copied' : 'Copy LaTeX'}</button>
        <button type="button" className="btn small gold" onClick={finish} disabled={!tex.trim()}>Add to message</button>
      </div>
    </div>
  );
}
