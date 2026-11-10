'use client';
/**
 * Interactive things Coe can put in a reply: a graph you can drag and zoom, a quiz, flash cards and charts.
 * Each is a fenced block (graph, quiz, flashcards, chart). They are built from plain text, so nothing runs that the model wrote.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { CopyButton, downloadBlob, downloadText } from '@/ui/copy';
import { hasMath, loadMath, renderMarkdown } from './markdown';
import { addCards } from '@/lib/coe/study';
import { sfx } from '@/lib/coe/look';

// ---------------------------------------------------------------- small helpers
export function Inline({ text, block }: { text: string; block?: boolean }) {
  const [ready, setReady] = useState(0);
  useEffect(() => { if (hasMath(text)) void loadMath().then(() => setReady((n) => n + 1)); }, [text]);
  const html = useMemo(() => renderMarkdown(String(text ?? '')), [text, ready]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={`cx-md tx cx-st-md${block ? ' block' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Keeps these cards in the Study hub, where they come back just before you would forget them. */
function SaveToStudy({ deck, cards }: { deck: string; cards: { front: string; back: string }[] }) {
  const [msg, setMsg] = useState('');
  const save = () => { const r = addCards(deck, cards); sfx.on(); setMsg(r.added ? `Saved ${r.added} to Study` : 'Already in Study'); };
  return <button type="button" className="cx-act" onClick={save} aria-live="polite"><UiIcon name="study" size={14} />{msg || 'Save to Study'}</button>;
}
const DEFAULT_COLORS = ['#337957', '#B49A57', '#171717', '#A33A2B', '#2F5D8A', '#6B4A8B', '#C77B2A', '#3C8F8F'];
const COLORS = DEFAULT_COLORS;
/** Colours a chart asked for, if they really are colours. */
const pickColors = (c?: unknown): string[] => { const ok = Array.isArray(c) ? c.map(String).filter((x) => /^#[0-9a-f]{3,8}$/i.test(x.trim())).map((x) => x.trim()).slice(0, 12) : []; return ok.length ? ok : DEFAULT_COLORS; };
export function json<T>(code: string): T | null { try { return JSON.parse(code.trim()) as T; } catch { return null; } }
export function Shell({ icon, name, closed, children, foot, cls }: { icon: Parameters<typeof UiIcon>[0]['name']; name: string; closed: boolean; children: React.ReactNode; foot?: React.ReactNode; cls?: string }) {
  return (
    <figure className={`cx-pv cx-st ${cls ?? ''}`}>
      <div className="cx-pv-top"><span className="d cx-pv-name"><UiIcon name={icon} size={15} />{name}{!closed && <i>writing…</i>}</span></div>
      {children}
      {foot && <div className="cx-pv-bar">{foot}</div>}
    </figure>
  );
}
async function svgPng(svg: SVGSVGElement, name: string) {
  const r = svg.getBoundingClientRect(), w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height)), k = 2;
  const copy = svg.cloneNode(true) as SVGSVGElement; copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); copy.setAttribute('width', String(w)); copy.setAttribute('height', String(h));
  const img = new Image(); await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('png')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy)); });
  const c = document.createElement('canvas'); c.width = w * k; c.height = h * k; const x = c.getContext('2d')!; x.fillStyle = '#FBF6EC'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  c.toBlob((b) => b && downloadBlob(name, b), 'image/png');
}
function niceStep(range: number, target = 8) {
  const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
const fmt = (v: number) => { if (Math.abs(v) < 1e-12) return '0'; const a = Math.abs(v); return a >= 1e6 || a < 1e-3 ? v.toExponential(2).replace('e+', 'e') : String(+v.toPrecision(4)); };

// ================================================================ graph
interface Fn { label: string; kind: 'y' | 'polar' | 'vline'; expr: string; f?: (x: number) => number; color: string }
interface Pt { x: number; y: number; label: string }
const BAD = /[;{}\\]|\b(import|createUnit|evaluate|parse|simplify|derivative|resolve|compile|reviver|help|config|typed|chain|format|eval|Function)\b/i;

async function compileFn(expr: string, vars: string[]): Promise<(x: number) => number> {
  if (BAD.test(expr)) throw new Error('That expression is not allowed.');
  const { compile } = await import('mathjs');
  const node = compile(expr.replace(/\^/g, '^').replace(/θ/g, 'theta').replace(/π/g, 'pi'));
  return (x: number) => { const sc: Record<string, number> = {}; for (const v of vars) sc[v] = x; const r = node.evaluate(sc); return typeof r === 'number' ? r : Number.NaN; };
}
function parseRange(s: string): [number, number] | null { const m = /(-?[\d.]+(?:e-?\d+)?|[-+]?pi[^.]*?)\s*(?:\.\.|to|,)\s*(-?[\d.]+(?:e-?\d+)?|[-+]?pi.*)/i.exec(s.replace(/π/g, 'pi')); if (!m) return null; const v = (t: string) => { const n = Number(t); return Number.isFinite(n) ? n : /pi/i.test(t) ? (t.trim().startsWith('-') ? -Math.PI : Math.PI) * (/^[-+]?(\d+)\s*\*?\s*pi/i.exec(t) ? Number(/^[-+]?(\d+)/.exec(t)![1]) : 1) : Number.NaN; }; const a = v(m[1]), b = v(m[2]); return Number.isFinite(a) && Number.isFinite(b) && a < b ? [a, b] : null; }

const GraphBlock = memo(function GraphBlock({ code, closed }: { code: string; closed: boolean }) {
  const [fns, setFns] = useState<Fn[]>([]), [pts, setPts] = useState<Pt[]>([]), [title, setTitle] = useState(''), [err, setErr] = useState('');
  const [view, setView] = useState<[number, number, number, number] | null>(null);
  const home = useRef<[number, number, number, number]>([-10, 10, -6, 6]);
  const svgRef = useRef<SVGSVGElement>(null); const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 400, PAD = 34;

  useEffect(() => {
    if (!closed) return; let live = true;
    (async () => {
      const list: Fn[] = [], points: Pt[] = []; let xr: [number, number] | null = null, yr: [number, number] | null = null, t = '';
      try {
        for (const raw of code.split('\n')) {
          const line = raw.trim(); if (!line || line.startsWith('#')) continue;
          let m: RegExpExecArray | null;
          if ((m = /^title\s*:\s*(.+)$/i.exec(line))) { t = m[1]; continue; }
          if ((m = /^x(?:\s*range)?\s*:\s*(.+)$/i.exec(line))) { xr = parseRange(m[1]) ?? xr; continue; }
          if ((m = /^y(?:\s*range)?\s*:\s*(.+)$/i.exec(line))) { yr = parseRange(m[1]) ?? yr; continue; }
          if ((m = /^points?\s*:\s*(.+)$/i.exec(line))) { for (const p of m[1].matchAll(/\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)\s*([A-Za-z][\w ]{0,20})?/g)) points.push({ x: +p[1], y: +p[2], label: (p[3] ?? '').trim() }); continue; }
          if ((m = /^x\s*=\s*(-?[\d.]+)\s*$/i.exec(line))) { list.push({ label: line, kind: 'vline', expr: m[1], f: () => +m![1], color: COLORS[list.length % COLORS.length] }); continue; }
          if ((m = /^(?:r|ρ)\s*=\s*(.+)$/i.exec(line))) { list.push({ label: line, kind: 'polar', expr: m[1], f: await compileFn(m[1], ['theta', 't']), color: COLORS[list.length % COLORS.length] }); continue; }
          const body = (m = /^(?:[A-Za-z]\w*\s*(?:\(\s*x\s*\))?|y)\s*=\s*(.+)$/.exec(line)) ? m[1] : line;
          list.push({ label: /=/.test(line) ? line : 'y = ' + line, kind: 'y', expr: body, f: await compileFn(body, ['x']), color: COLORS[list.length % COLORS.length] });
          if (list.length >= 8) break;
        }
        if (!list.length && !points.length) throw new Error('There is nothing to draw.');
      } catch (e) { if (live) { setErr(String((e as Error).message || e).slice(0, 160)); setFns([]); } return; }
      if (!live) return;
      const x0 = xr ?? (list.some((f) => f.kind === 'polar') ? [-6, 6] as [number, number] : [-10, 10] as [number, number]);
      let y0 = yr;
      if (!y0) {
        const ys: number[] = [];
        for (const f of list) {
          if (f.kind === 'y') for (let i = 0; i <= 300; i++) { const v = f.f!(x0[0] + ((x0[1] - x0[0]) * i) / 300); if (Number.isFinite(v)) ys.push(v); }
          if (f.kind === 'polar') for (let i = 0; i <= 360; i++) { const th = (i / 360) * Math.PI * 2, r = f.f!(th); if (Number.isFinite(r)) ys.push(r * Math.sin(th)); }
        }
        for (const p of points) ys.push(p.y);
        ys.sort((a, b) => a - b);
        let lo = ys.length ? ys[Math.floor(ys.length * 0.03)] : -5, hi = ys.length ? ys[Math.ceil(ys.length * 0.97) - 1] : 5;
        if (!(hi > lo)) { lo -= 1; hi += 1; }
        const pad = (hi - lo) * 0.12; y0 = [Math.min(lo - pad, -0.5), Math.max(hi + pad, 0.5)];
        if (list.every((f) => f.kind === 'polar')) { const s = Math.max(Math.abs(y0[0]), Math.abs(y0[1]), 1); y0 = [-s, s]; }
      }
      // Polar and other round things should look round: match the units on both axes.
      if (list.some((f) => f.kind === 'polar') && !yr) { const k = (x0[1] - x0[0]) / (y0[1] - y0[0]) * (H / W); const mid = (y0[0] + y0[1]) / 2, half = (y0[1] - y0[0]) / 2; y0 = [mid - half / Math.min(1, k) * 1, mid + half / Math.min(1, k) * 1]; }
      home.current = [x0[0], x0[1], y0[0], y0[1]];
      setFns(list); setPts(points); setTitle(t); setErr(''); setView(home.current);
    })();
    return () => { live = false; };
  }, [code, closed]);

  // dragging and zooming
  type View = [number, number, number, number];
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const base = useRef<{ x: number; y: number; v: View; d: number } | null>(null);
  const toData = (clientX: number, clientY: number, v: View) => { const r = svgRef.current!.getBoundingClientRect(); const px = ((clientX - r.left) / r.width) * W, py = ((clientY - r.top) / r.height) * H; return { x: v[0] + ((px - PAD) / (W - PAD * 1.4)) * (v[1] - v[0]), y: v[3] - ((py - PAD * 0.6) / (H - PAD * 1.6)) * (v[3] - v[2]) }; };
  const zoom = (k: number) => setView((v) => { if (!v) return v; const mx = (v[0] + v[1]) / 2, my = (v[2] + v[3]) / 2; return [mx + (v[0] - mx) * k, mx + (v[1] - mx) * k, my + (v[2] - my) * k, my + (v[3] - my) * k]; });
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!view) return; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const pts = [...ptrs.current.values()];
    base.current = { x: pts[0].x, y: pts[0].y, v: view, d: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0 };
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!view) return;
    if (!ptrs.current.has(e.pointerId)) { setHover(toData(e.clientX, e.clientY, view).x); return; }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const b = base.current; if (!b) return; const pts = [...ptrs.current.values()];
    if (pts.length === 2 && b.d) { const k = b.d / (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1), v = b.v, mx = (v[0] + v[1]) / 2, my = (v[2] + v[3]) / 2; setView([mx + (v[0] - mx) * k, mx + (v[1] - mx) * k, my + (v[2] - my) * k, my + (v[3] - my) * k]); return; }
    if (pts.length === 1) {
      const r = svgRef.current!.getBoundingClientRect(), v = b.v;
      const dx = (((e.clientX - b.x) / r.width) * W / (W - PAD * 1.4)) * (v[1] - v[0]), dy = (((e.clientY - b.y) / r.height) * H / (H - PAD * 1.6)) * (v[3] - v[2]);
      setView([v[0] - dx, v[1] - dx, v[2] + dy, v[3] + dy]);
    }
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => { ptrs.current.delete(e.pointerId); const pts = [...ptrs.current.values()]; base.current = pts.length === 1 && view ? { x: pts[0].x, y: pts[0].y, v: view, d: 0 } : null; };
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); setView((v) => { if (!v) return v; const p = toData(e.clientX, e.clientY, v), k = Math.exp(e.deltaY * 0.0015); return [p.x + (v[0] - p.x) * k, p.x + (v[1] - p.x) * k, p.y + (v[2] - p.y) * k, p.y + (v[3] - p.y) * k]; }); };
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  }, [fns.length, err]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!closed) return <Shell icon="chart" name="Graph" closed={false}><p className="tx cx-pv-wait">Drawing the graph…</p></Shell>;
  if (err || !view) return <Shell icon="chart" name="Graph" closed><p className="cx-pv-err tx">{err || 'Drawing…'}</p><pre className="cx-pv-code"><code>{code}</code></pre></Shell>;

  const [xa, xb, ya, yb] = view, pw = W - PAD * 1.4, ph = H - PAD * 1.6;
  const sx = (x: number) => PAD + ((x - xa) / (xb - xa)) * pw, sy = (y: number) => PAD * 0.6 + ((yb - y) / (yb - ya)) * ph;
  const xs = niceStep(xb - xa), ys = niceStep(yb - ya, 6);
  const xt: number[] = [], yt: number[] = []; for (let v = Math.ceil(xa / xs) * xs; v <= xb + 1e-9; v += xs) xt.push(+v.toPrecision(12)); for (let v = Math.ceil(ya / ys) * ys; v <= yb + 1e-9; v += ys) yt.push(+v.toPrecision(12));
  const paths = fns.map((f) => {
    let d = '', pen = false, last = Number.NaN; const jump = (yb - ya) * 3;
    const put = (x: number, y: number) => { if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 1e9) { pen = false; last = Number.NaN; return; } if (pen && Math.abs(y - last) > jump) pen = false; d += (pen ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + sy(y).toFixed(1); pen = true; last = y; };
    if (f.kind === 'vline') return `M${sx(f.f!(0)).toFixed(1)} ${PAD * 0.6}V${PAD * 0.6 + ph}`;
    if (f.kind === 'polar') { for (let i = 0; i <= 720; i++) { const th = (i / 720) * Math.PI * 2 * (/\b(theta|t)\b/.test(f.expr) && /\/\s*2|\/2/.test(f.expr) ? 2 : 1), r = f.f!(th); put(r * Math.cos(th), r * Math.sin(th)); } return d; }
    const n = 700; for (let i = 0; i <= n; i++) { const x = xa + ((xb - xa) * i) / n; put(x, f.f!(x)); } return d;
  });
  const hx = hover; const reads = hx !== null ? fns.filter((f) => f.kind === 'y').map((f) => ({ f, y: f.f!(hx) })).filter((r) => Number.isFinite(r.y)) : [];
  const reset = () => setView(home.current);
  const shape = (() => { const w = xb - xa, h = yb - ya; return `${fmt(w)} by ${fmt(h)}`; })();

  return (
    <Shell icon="chart" name={title ? `Graph: ${title}` : 'Graph'} closed cls="graph"
      foot={<>
        <button type="button" className="cx-act" onClick={() => zoom(0.7)} aria-label="Zoom in"><UiIcon name="plus" size={14} />Zoom in</button>
        <button type="button" className="cx-act" onClick={() => zoom(1 / 0.7)} aria-label="Zoom out">Zoom out</button>
        <button type="button" className="cx-act" onClick={reset}><UiIcon name="refresh" size={14} />Reset</button>
        <button type="button" className="cx-act" onClick={() => svgRef.current && void svgPng(svgRef.current, 'graph.png')}><UiIcon name="image" size={14} />Save .png</button>
        <CopyButton text={code} label="Copy" small />
        <span className="cx-grow" /><span className="tx cx-st-hint">Drag to move. Scroll or pinch to zoom. {shape}</span>
      </>}>
      <div className="cx-gr-wrap">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="cx-gr" role="img" aria-label={title || 'Graph'} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setHover(null)} onDoubleClick={reset}>
          <rect x="0" y="0" width={W} height={H} fill="#FBF6EC" />
          <clipPath id="cxgrclip"><rect x={PAD} y={PAD * 0.6} width={pw} height={ph} /></clipPath>
          {xt.map((v) => <g key={'x' + v}><line x1={sx(v)} x2={sx(v)} y1={PAD * 0.6} y2={PAD * 0.6 + ph} stroke="#171717" strokeOpacity={v === 0 ? 0.9 : 0.12} strokeWidth={v === 0 ? 1.6 : 1} /><text x={sx(v)} y={PAD * 0.6 + ph + 14} textAnchor="middle" fontSize="10" fill="#171717" fontFamily="ui-monospace, Menlo, monospace">{fmt(v)}</text></g>)}
          {yt.map((v) => <g key={'y' + v}><line y1={sy(v)} y2={sy(v)} x1={PAD} x2={PAD + pw} stroke="#171717" strokeOpacity={v === 0 ? 0.9 : 0.12} strokeWidth={v === 0 ? 1.6 : 1} /><text x={PAD - 5} y={sy(v) + 3} textAnchor="end" fontSize="10" fill="#171717" fontFamily="ui-monospace, Menlo, monospace">{fmt(v)}</text></g>)}
          <rect x={PAD} y={PAD * 0.6} width={pw} height={ph} fill="none" stroke="#171717" strokeWidth="2.5" />
          <g clipPath="url(#cxgrclip)">
            {paths.map((d, i) => <path key={i} d={d} fill="none" stroke={fns[i].color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={fns[i].kind === 'vline' ? '6 5' : undefined} />)}
            {pts.map((p, i) => <g key={i}><circle cx={sx(p.x)} cy={sy(p.y)} r="5" fill="#B49A57" stroke="#171717" strokeWidth="2" />{p.label && <text x={sx(p.x) + 8} y={sy(p.y) - 7} fontSize="11" fill="#171717" fontFamily="ui-monospace, Menlo, monospace">{p.label}</text>}</g>)}
            {hx !== null && <line x1={sx(hx)} x2={sx(hx)} y1={PAD * 0.6} y2={PAD * 0.6 + ph} stroke="#171717" strokeOpacity="0.5" strokeDasharray="3 3" />}
            {reads.map((r, i) => <circle key={i} cx={sx(hx!)} cy={sy(r.y)} r="4.5" fill={r.f.color} stroke="#171717" strokeWidth="1.5" />)}
          </g>
        </svg>
        <div className="cx-gr-key tx">
          {fns.map((f) => <span key={f.label}><i style={{ background: f.color }} />{f.label}</span>)}
          {reads.length > 0 && <span className="cx-gr-read">x = {fmt(hx!)}{reads.map((r) => `   ${fmt(r.y)}`).join('')}</span>}
        </div>
      </div>
    </Shell>
  );
});

// ================================================================ quiz
interface Q { q: string; options: string[]; answer: number | string; why?: string }
const answerIndex = (q: Q) => {
  if (typeof q.answer === 'number') return q.answer >= 1 && q.answer <= q.options.length && !q.options[q.answer] ? q.answer - 1 : q.answer;
  const a = String(q.answer).trim(), L = 'abcdefghij'.indexOf(a.toLowerCase()); if (a.length === 1 && L >= 0 && L < q.options.length) return L;
  const k = q.options.findIndex((o) => o.trim().toLowerCase() === a.toLowerCase()); return k;
};
const QuizBlock = memo(function QuizBlock({ code, closed }: { code: string; closed: boolean }) {
  const data = useMemo(() => (closed ? json<{ title?: string; questions?: Q[] }>(code) : null), [code, closed]);
  const qs = useMemo(() => (data?.questions ?? []).filter((q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2).slice(0, 30), [data]);
  const [i, setI] = useState(0), [pick, setPick] = useState<number | null>(null), [score, setScore] = useState(0), [missed, setMissed] = useState<number[]>([]), [order, setOrder] = useState<number[] | null>(null), [done, setDone] = useState(false);
  const list = order ?? qs.map((_, k) => k);
  if (!closed) return <Shell icon="cards" name="Quiz" closed={false}><p className="tx cx-pv-wait">Writing the questions…</p></Shell>;
  if (!qs.length) return <Shell icon="cards" name="Quiz" closed><p className="cx-pv-err tx">That quiz could not be read.</p><pre className="cx-pv-code"><code>{code}</code></pre></Shell>;
  const q = qs[list[Math.min(i, list.length - 1)]], right = answerIndex(q), answered = pick !== null;
  const asCards = qs.map((x) => { const r = answerIndex(x); return { front: `${x.q}\n\n${x.options.map((o, k) => `${'ABCDEFGHIJ'[k]}. ${o}`).join('\n')}`, back: `**${'ABCDEFGHIJ'[r] ?? ''}. ${x.options[r] ?? ''}**${x.why ? `\n\n${x.why}` : ''}` }; });
  const deckName = data?.title || 'Quiz questions';
  const next = () => { if (i + 1 >= list.length) { setDone(true); return; } setI(i + 1); setPick(null); };
  const choose = (k: number) => { if (answered) return; setPick(k); (k === right ? sfx.right : sfx.wrong)(); if (k === right) setScore((s) => s + 1); else setMissed((m) => [...m, list[i]]); };
  const again = (only?: number[]) => { setOrder(only ?? null); setI(0); setPick(null); setScore(0); setMissed([]); setDone(false); };
  if (done) {
    const total = list.length, pct = Math.round((score / total) * 100);
    return (
      <Shell icon="cards" name={data?.title ? `Quiz: ${data.title}` : 'Quiz'} closed cls="quiz">
        <div className="cx-q-done"><b className="d">{score} of {total}</b><span className="tx">{pct >= 90 ? 'Brilliant.' : pct >= 70 ? 'Good going.' : pct >= 50 ? 'Getting there.' : 'Worth another look. Try the ones you missed.'}</span>
          <div className="cx-q-bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="cx-q-acts"><button type="button" className="btn small" onClick={() => again()}><UiIcon name="refresh" size={14} />Try again</button><SaveToStudy deck={deckName} cards={asCards} />{missed.length > 0 && <button type="button" className="btn small" onClick={() => again(missed)}>Only the {missed.length} I missed</button>}</div></div>
      </Shell>
    );
  }
  return (
    <Shell icon="cards" name={data?.title ? `Quiz: ${data.title}` : 'Quiz'} closed cls="quiz" foot={<><span className="tx cx-st-hint">Question {i + 1} of {list.length}. Score {score}.</span><span className="cx-grow" /><SaveToStudy deck={deckName} cards={asCards} />{answered && <button type="button" className="btn small" onClick={next}>{i + 1 >= list.length ? 'See score' : 'Next'}<UiIcon name="right" size={14} /></button>}</>}>
      <div className="cx-q">
        <div className="cx-q-bar"><i style={{ width: `${(i / list.length) * 100}%` }} /></div>
        <Inline text={q.q} block />
        <div className="cx-q-opts" role="group" aria-label="Choices">
          {q.options.map((o, k) => (
            <button key={k} type="button" className={`cx-q-opt${answered ? (k === right ? ' right' : k === pick ? ' wrong' : ' off') : ''}`} onClick={() => choose(k)} aria-pressed={pick === k} disabled={answered && k !== right && k !== pick}>
              <span className="cx-q-key d">{'ABCDEFGHIJ'[k]}</span><span className="cx-q-txt"><Inline text={o} /></span>{answered && k === right && <UiIcon name="check" size={16} />}
            </button>
          ))}
        </div>
        {answered && <div className={`cx-q-why tx ${pick === right ? 'ok' : 'no'}`}><b className="d">{pick === right ? 'Right.' : 'Not quite.'}</b>{q.why && <Inline text={q.why} />}</div>}
      </div>
    </Shell>
  );
});

// ================================================================ flash cards
interface Card { front: string; back: string }
const CardsBlock = memo(function CardsBlock({ code, closed }: { code: string; closed: boolean }) {
  const data = useMemo(() => (closed ? json<{ title?: string; cards?: Card[] }>(code) : null), [code, closed]);
  const all = useMemo(() => (data?.cards ?? []).filter((c) => c && c.front && c.back).slice(0, 60), [data]);
  const [deck, setDeck] = useState<number[] | null>(null), [i, setI] = useState(0), [flip, setFlip] = useState(false), [known, setKnown] = useState<number[]>([]), [again, setAgain] = useState<number[]>([]);
  const ids = deck ?? all.map((_, k) => k);
  const rootRef = useRef<HTMLElement>(null);
  const go = useCallback((d: number) => { setFlip(false); setI((x) => Math.max(0, Math.min(ids.length, x + d))); }, [ids.length]);
  if (!closed) return <Shell icon="cards" name="Flash cards" closed={false}><p className="tx cx-pv-wait">Making the cards…</p></Shell>;
  if (!all.length) return <Shell icon="cards" name="Flash cards" closed><p className="cx-pv-err tx">Those cards could not be read.</p><pre className="cx-pv-code"><code>{code}</code></pre></Shell>;
  const shuffle = () => { const a = all.map((_, k) => k); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } setDeck(a); setI(0); setFlip(false); setKnown([]); setAgain([]); };
  const mark = (ok: boolean) => { const id = ids[i]; if (ok) setKnown((k) => [...new Set([...k, id])]); else setAgain((k) => [...new Set([...k, id])]); go(1); };
  const finished = i >= ids.length;
  const c = all[ids[Math.min(i, ids.length - 1)]];
  return (
    <Shell icon="cards" name={data?.title ? `Flash cards: ${data.title}` : 'Flash cards'} closed cls="cards"
      foot={<><button type="button" className="cx-act" onClick={shuffle}><UiIcon name="refresh" size={14} />Shuffle</button><SaveToStudy deck={data?.title || 'Flash cards'} cards={all} /><span className="cx-grow" /><span className="tx cx-st-hint">{finished ? 'Done' : `Card ${i + 1} of ${ids.length}`}. Known {known.length}.</span></>}>
      {finished ? (
        <div className="cx-q-done"><b className="d">{known.length} of {ids.length} known</b>
          <div className="cx-q-bar"><i style={{ width: `${(known.length / Math.max(1, ids.length)) * 100}%` }} /></div>
          <div className="cx-q-acts"><button type="button" className="btn small" onClick={() => { setDeck(null); setI(0); setKnown([]); setAgain([]); setFlip(false); }}>Start again</button>{again.length > 0 && <button type="button" className="btn small" onClick={() => { setDeck(again); setI(0); setKnown([]); setAgain([]); setFlip(false); }}>Only the {again.length} to practise</button>}</div></div>
      ) : (
        <div className="cx-fc" ref={rootRef as unknown as React.RefObject<HTMLDivElement>}>
          <div className="cx-q-bar"><i style={{ width: `${(i / ids.length) * 100}%` }} /></div>
          <button type="button" className={`cx-fc-card${flip ? ' is-flipped' : ''}`} onClick={() => setFlip((f) => !f)} aria-label={flip ? 'Showing the answer. Tap to see the question.' : 'Showing the question. Tap to see the answer.'}>
            <span className="cx-fc-side d">{flip ? 'Answer' : 'Question'}</span>
            <span className="cx-fc-text"><Inline text={flip ? c.back : c.front} block /></span>
            <span className="cx-fc-hint tx">{flip ? 'Tap to flip back' : 'Tap to flip'}</span>
          </button>
          <div className="cx-fc-acts">
            <button type="button" className="btn small" onClick={() => go(-1)} disabled={i === 0}><UiIcon name="left" size={14} />Back</button>
            <button type="button" className="btn small cx-fc-no" onClick={() => mark(false)} disabled={!flip}>Practise again</button>
            <button type="button" className="btn small cx-fc-yes" onClick={() => mark(true)} disabled={!flip}><UiIcon name="check" size={14} />Got it</button>
          </div>
        </div>
      )}
    </Shell>
  );
});

// ================================================================ chart
interface ChartSpec { type?: string; title?: string; labels?: (string | number)[]; series?: { name?: string; data: (number | [number, number])[] }[]; data?: number[]; xLabel?: string; yLabel?: string; colors?: string[] }
const ChartBlock = memo(function ChartBlock({ code, closed }: { code: string; closed: boolean }) {
  const spec = useMemo(() => (closed ? json<ChartSpec>(code) : null), [code, closed]);
  const ref = useRef<SVGSVGElement>(null);
  if (!closed) return <Shell icon="chart" name="Chart" closed={false}><p className="tx cx-pv-wait">Drawing the chart…</p></Shell>;
  const series = (spec?.series ?? (spec?.data ? [{ name: '', data: spec.data }] : [])).filter((s) => s && Array.isArray(s.data) && s.data.length).slice(0, 8);
  const type = String(spec?.type || 'bar').toLowerCase();
  if (!spec || !series.length) return <Shell icon="chart" name="Chart" closed><p className="cx-pv-err tx">That chart could not be read.</p><pre className="cx-pv-code"><code>{code}</code></pre></Shell>;
  const COLORS = pickColors(spec.colors);
  const W = 640, H = 360, L = 52, R = 14, T = 16, B = 44, pw = W - L - R, ph = H - T - B;
  const labels = (spec.labels ?? series[0].data.map((_, k) => String(k + 1))).map(String);
  const num = (v: number | [number, number]) => (Array.isArray(v) ? Number(v[1]) : Number(v)) || 0;
  let body: React.ReactNode = null;
  if (type === 'pie' || type === 'donut' || type === 'doughnut') {
    const vals = series[0].data.map((v) => Math.max(0, num(v))), tot = vals.reduce((a, b) => a + b, 0) || 1; let a0 = -Math.PI / 2; const cx = 190, cy = H / 2, r = 130, hole = type === 'pie' ? 0 : 66;
    body = <>{vals.map((v, k) => { const a1 = a0 + (v / tot) * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0; const p = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)]; const d = v / tot > 0.9999 ? `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0` : `M${cx + p[0] * r} ${cy + p[1] * r}A${r} ${r} 0 ${large} 1 ${cx + p[2] * r} ${cy + p[3] * r}${hole ? `L${cx + p[2] * hole} ${cy + p[3] * hole}A${hole} ${hole} 0 ${large} 0 ${cx + p[0] * hole} ${cy + p[1] * hole}Z` : `L${cx} ${cy}Z`}`; a0 = a1; return <path key={k} d={d} fill={COLORS[k % COLORS.length]} stroke="#171717" strokeWidth="2.5"><title>{`${labels[k] ?? ''}: ${fmt(v)} (${Math.round((v / tot) * 100)}%)`}</title></path>; })}
      {vals.map((v, k) => <g key={'l' + k}><rect x={360} y={40 + k * 26} width="16" height="16" fill={COLORS[k % COLORS.length]} stroke="#171717" strokeWidth="2" /><text x={384} y={53 + k * 26} fontSize="13" fill="#171717" fontFamily="ui-monospace, Menlo, monospace">{(labels[k] ?? '').slice(0, 24)}  {Math.round((v / tot) * 100)}%</text></g>)}</>;
  } else if (type === 'scatter') {
    const all = series.flatMap((s) => s.data.map((p) => (Array.isArray(p) ? p : [0, Number(p)])) as [number, number][]);
    const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0])), y0 = Math.min(0, ...all.map((p) => p[1])), y1 = Math.max(...all.map((p) => p[1]));
    const sx = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * pw, sy = (v: number) => T + ph - ((v - y0) / (y1 - y0 || 1)) * ph, st = niceStep(y1 - y0 || 1, 5);
    const yt: number[] = []; for (let v = Math.ceil(y0 / st) * st; v <= y1 + 1e-9; v += st) yt.push(v);
    const xst = niceStep(x1 - x0 || 1, 6), xt: number[] = []; for (let v = Math.ceil(x0 / xst) * xst; v <= x1 + 1e-9; v += xst) xt.push(v);
    body = <>{yt.map((v) => <g key={'y' + v}><line x1={L} x2={L + pw} y1={sy(v)} y2={sy(v)} stroke="#171717" strokeOpacity=".12" /><text x={L - 6} y={sy(v) + 3} textAnchor="end" fontSize="10" fontFamily="ui-monospace, Menlo, monospace">{fmt(v)}</text></g>)}{xt.map((v) => <text key={'x' + v} x={sx(v)} y={T + ph + 16} textAnchor="middle" fontSize="10" fontFamily="ui-monospace, Menlo, monospace">{fmt(v)}</text>)}
      {series.map((s, si) => (s.data.map((p) => (Array.isArray(p) ? p : [0, Number(p)])) as [number, number][]).map((p, k) => <circle key={si + '-' + k} cx={sx(p[0])} cy={sy(p[1])} r="5" fill={COLORS[si % COLORS.length]} stroke="#171717" strokeWidth="2"><title>{`${s.name || ''} (${fmt(p[0])}, ${fmt(p[1])})`}</title></circle>))}</>;
  } else {
    const vals = series.map((s) => s.data.map(num)); const hi = Math.max(...vals.flat(), 0), lo = Math.min(...vals.flat(), 0), st = niceStep((hi - lo) || 1, 5);
    const top = Math.ceil(hi / st) * st || st, bot = Math.floor(lo / st) * st; const yt: number[] = []; for (let v = bot; v <= top + 1e-9; v += st) yt.push(+v.toPrecision(12));
    const sy = (v: number) => T + ph - ((v - bot) / (top - bot || 1)) * ph, n = Math.max(...vals.map((v) => v.length)), bw = pw / n, gw = (bw * 0.76) / (type === 'line' ? 1 : series.length);
    body = <>{yt.map((v) => <g key={'y' + v}><line x1={L} x2={L + pw} y1={sy(v)} y2={sy(v)} stroke="#171717" strokeOpacity={v === 0 ? 0.9 : 0.12} strokeWidth={v === 0 ? 1.6 : 1} /><text x={L - 6} y={sy(v) + 3} textAnchor="end" fontSize="10" fontFamily="ui-monospace, Menlo, monospace">{fmt(v)}</text></g>)}
      {labels.slice(0, n).map((l, k) => <text key={'l' + k} x={L + bw * (k + 0.5)} y={T + ph + 16} textAnchor="middle" fontSize="10.5" fontFamily="ui-monospace, Menlo, monospace">{l.length > (n > 8 ? 6 : 12) ? l.slice(0, n > 8 ? 5 : 11) + '…' : l}</text>)}
      {type === 'line' || type === 'area'
        ? series.map((s, si) => { const pts = vals[si].map((v, k) => [L + bw * (k + 0.5), sy(v)] as const); return <g key={si}>{type === 'area' && <path d={`M${pts[0][0]} ${sy(0)}` + pts.map((p) => `L${p[0]} ${p[1]}`).join('') + `L${pts[pts.length - 1][0]} ${sy(0)}Z`} fill={COLORS[si % COLORS.length]} fillOpacity=".25" />}<path d={'M' + pts.map((p) => `${p[0]} ${p[1]}`).join('L')} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth="3" strokeLinejoin="round" />{pts.map((p, k) => <circle key={k} cx={p[0]} cy={p[1]} r="4.5" fill={COLORS[si % COLORS.length]} stroke="#171717" strokeWidth="2"><title>{`${s.name || ''} ${labels[k] ?? ''}: ${fmt(vals[si][k])}`}</title></circle>)}</g>; })
        : series.map((s, si) => vals[si].map((v, k) => <rect key={si + '-' + k} x={L + bw * k + bw * 0.12 + si * gw} y={Math.min(sy(v), sy(0))} width={gw - 2} height={Math.abs(sy(v) - sy(0)) || 1} fill={COLORS[si % COLORS.length]} stroke="#171717" strokeWidth="2"><title>{`${s.name || ''} ${labels[k] ?? ''}: ${fmt(v)}`}</title></rect>))}</>;
  }
  return (
    <Shell icon="chart" name={spec.title ? `Chart: ${spec.title}` : 'Chart'} closed cls="chart"
      foot={<><button type="button" className="cx-act" onClick={() => ref.current && void svgPng(ref.current, 'chart.png')}><UiIcon name="image" size={14} />Save .png</button><button type="button" className="cx-act" onClick={() => downloadText('chart.csv', ['label,' + series.map((s) => s.name || 'value').join(','), ...labels.map((l, k) => [JSON.stringify(l), ...series.map((s) => (s.data[k] === undefined ? '' : Array.isArray(s.data[k]) ? (s.data[k] as number[]).join(' ') : s.data[k]))].join(','))].join('\n'), 'text/csv')}><UiIcon name="download" size={14} />Save .csv</button><CopyButton text={code} label="Copy" small /></>}>
      <div className="cx-gr-wrap">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="cx-gr" role="img" aria-label={spec.title || 'Chart'}>
          <rect width={W} height={H} fill="#FBF6EC" />{body}
          {type !== 'pie' && type !== 'donut' && type !== 'doughnut' && <line x1={L} x2={L} y1={T} y2={T + ph} stroke="#171717" strokeWidth="2.5" />}
          {spec.xLabel && <text x={L + pw / 2} y={H - 6} textAnchor="middle" fontSize="11" fontFamily="ui-monospace, Menlo, monospace">{spec.xLabel}</text>}
          {spec.yLabel && <text transform={`translate(12 ${T + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fontFamily="ui-monospace, Menlo, monospace">{spec.yLabel}</text>}
        </svg>
        {series.length > 1 && type !== 'pie' && <div className="cx-gr-key tx">{series.map((s, k) => <span key={k}><i style={{ background: COLORS[k % COLORS.length] }} />{s.name || `Series ${k + 1}`}</span>)}</div>}
      </div>
    </Shell>
  );
});

export function StudyBlock({ lang, code, closed }: { lang: string; code: string; closed: boolean }) {
  if (lang === 'graph' || lang === 'plot') return <GraphBlock code={code} closed={closed} />;
  if (lang === 'quiz') return <QuizBlock code={code} closed={closed} />;
  if (lang === 'flashcards' || lang === 'cards') return <CardsBlock code={code} closed={closed} />;
  if (lang === 'chart') return <ChartBlock code={code} closed={closed} />;
  return null;
}
export const STUDY_LANGS = ['graph', 'plot', 'quiz', 'flashcards', 'cards', 'chart'];
