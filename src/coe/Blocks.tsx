'use client';
import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Activity, turnSteps } from './Activity';
import { UiIcon } from '@/ui/icons';
import { CoeWork } from '@/ui/CoeWork';
import { CopyButton, downloadBlob, downloadText } from '@/ui/copy';
import { cleanSvg, hasMath, loadMath, renderMarkdown } from './markdown';
import { STUDY_LANGS, StudyBlock } from './Study';
import { SlidesBlock } from './Slides';
import { DataBlock } from './DataTable';
import { AskCard } from './AskCard';
import { QuestionsBlock } from './Questions';
import { MapBlock } from './MapBlock';
import { dataUrl, type Img, type Msg, type Perm, type ToolOut, type ToolRun } from './store';
import { KINDS, type EDoc } from '@/lib/coe/editors';
import { appsFrameSrc, defOf, findTool, type Call } from '@/lib/coe/tools';
import { APPS_URL, appBySlug, makeFrame, registerFrame } from '@/lib/coe/pmc';
import { entryOf, hasFiles, inlinePage, type Files } from '@/lib/coe/workspace';
import type { PlanKey } from '@/lib/coe/models';

// ---------------------------------------------------------------- what the blocks need from the chat
export interface RichCtx { shared?: boolean; /** Pictures in this chat, oldest first: ![](pic:1) shows the first. */ pics?: Img[]; /** Text effects on or off. */ effects?: boolean; plan: PlanKey; files: Files; convId: string; ask?: (text: string) => void; /** Redo the last answer for free (a few a day), with a note about what was wrong. */ redo?: (note?: string) => void; /** Messages whose checklist was replaced by a newer one in the same turn. */ oldPlans?: Set<string>; /** The documents in the editor, what the person allowed, and how to open one or answer a question about opening. */ docs?: EDoc[]; perm?: Perm; openDoc?: (id: string) => void; /** The editor is on screen right now. */ edOpen?: boolean; decide?: (what: 'editor' | 'app', choice: 'yes' | 'always' | 'never', arg?: string, runId?: string) => void }
export const RichContext = createContext<RichCtx | null>(null);

// ---------------------------------------------------------------- splitting a reply into words and special blocks
export type Seg = { t: 'md'; text: string } | { t: 'fold'; title: string; text: string; closed: boolean } | { t: 'block'; lang: string; code: string; closed: boolean; n: number };
const SPECIAL = new Set(['html', 'htm', 'svg', 'mermaid', 'coe-tool', 'coe-plan', 'followups', 'slides', 'data', 'map', 'ask', 'questions', ...STUDY_LANGS]);

export function splitBlocks(text: string): Seg[] {
  const lines = text.split('\n'), segs: Seg[] = [], count: Record<string, number> = {};
  let buf: string[] = [], i = 0;
  const flush = () => { if (buf.length) { const t = buf.join('\n'); if (t.trim()) segs.push({ t: 'md', text: t }); buf = []; } };
  while (i < lines.length) {
    const fm = /^\s{0,3}:::\s*(?:fold|details)\b[ \t]*(.*)$/i.exec(lines[i]);
    if (fm) {
      let j = i + 1; while (j < lines.length && !/^\s{0,3}:::\s*$/.test(lines[j])) j++;
      flush(); segs.push({ t: 'fold', title: fm[1].trim() || 'More', text: lines.slice(i + 1, j).join('\n'), closed: j < lines.length }); i = j < lines.length ? j + 1 : j; continue;
    }
    const m = /^\s{0,3}(`{3,})\s*([\w+-]*)[^\n]*$/.exec(lines[i]);
    if (m) {
      const fence = m[1], lang = m[2].toLowerCase();
      let j = i + 1; while (j < lines.length && !new RegExp('^\\s{0,3}`{' + fence.length + ',}\\s*$').test(lines[j])) j++;
      const closed = j < lines.length;
      if (SPECIAL.has(lang)) { flush(); count[lang] = (count[lang] ?? -1) + 1; segs.push({ t: 'block', lang: lang === 'htm' ? 'html' : lang, code: lines.slice(i + 1, j).join('\n'), closed, n: count[lang] }); i = closed ? j + 1 : j; continue; }
      buf.push(...lines.slice(i, closed ? j + 1 : j)); i = closed ? j + 1 : j; continue;
    }
    buf.push(lines[i]); i++;
  }
  flush();
  return segs;
}

/** The words of a reply, as the person reads them, without the tool block. */
export const wordsOf = (text: string) => { const f = findTool(text); const t = f ? (text.slice(0, f.start) + text.slice(f.end)).trim() : text; return t.replace(/\n?`{3}followups[\s\S]*?(`{3}|$)/g, '').trim(); };

/** The "what next?" suggestions at the end of a reply: up to three short lines. */
export function followupsOf(text: string): string[] {
  const m = /`{3}followups[^\n]*\n([\s\S]*?)`{3}/.exec(text); if (!m) return [];
  let list: unknown[] = [];
  try { const j = JSON.parse(m[1]); if (Array.isArray(j)) list = j; } catch { list = m[1].split('\n'); }
  return list.map((x) => String(x ?? '').replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["']|["']$/g, '').trim()).filter((x) => x.length > 2 && x.length <= 90).slice(0, 3);
}

// ---------------------------------------------------------------- a reply
const Md = memo(function Md({ text, live }: { text: string; live?: boolean }) {
  const [ready, setReady] = useState(0);
  const ctx = useContext(RichContext);
  const fx = ctx?.effects !== false, pics = ctx?.pics, box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (hasMath(text)) void loadMath().then(() => setReady((n) => n + 1)); }, [text]);
  const base = useMemo(() => renderMarkdown(text, fx), [text, ready, fx]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Nothing sits at the end of the text while it is written: the only thing that moves besides the new letters is the turning Coe star.
  const html = base;
  // New words fade in letter by letter, softly, and only ONE letter at a time: each letter fades inside its own slot and the next one starts when it is done,
  // so the text is unveiled left to right. A slot gets shorter only when the text arrives faster than it can be unveiled, so the reveal never falls far behind.
  // Each chunk keeps its own clock, so a re-render never restarts it.
  const seen = useRef(0), tail = useRef(0), chunks = useRef<{ a: number; b: number; t: number; step: number }[]>([]);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    if (!live || ctx?.effects === false) { seen.current = 0; tail.current = 0; chunks.current = []; return; }
    const total = (el.textContent ?? '').length, now = performance.now();
    if (total < seen.current) { seen.current = 0; tail.current = 0; chunks.current = []; }
    if (total > seen.current) {
      const n = total - seen.current, start = Math.max(now, tail.current), step = Math.max(5, Math.min(40, (700 - (start - now)) / n));
      chunks.current.push({ a: seen.current, b: total, t: start, step }); tail.current = start + n * step;
    }
    seen.current = total;
    chunks.current = chunks.current.filter((c) => now - c.t < (c.b - c.a) * c.step + 200);
    for (const c of [...chunks.current].reverse()) {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let off = 0, n: Node | null;
      const hits: { node: Text; from: number; to: number; k0: number }[] = [];
      while ((n = w.nextNode())) {
        const t = n as Text, len = t.data.length, a = Math.max(c.a - off, 0), b = Math.min(c.b - off, len);
        if (a < b && !t.parentElement?.closest('pre, .katex, .wblk')) hits.push({ node: t, from: a, to: b, k0: off + a - c.a });
        off += len; if (off >= c.b) break;
      }
      for (const h of hits.reverse()) {
        let mid = h.node; if (h.from > 0) mid = mid.splitText(h.from); if (h.to - h.from < mid.data.length) mid.splitText(h.to - h.from);
        const frag = document.createDocumentFragment(); let k = h.k0;
        for (const ch of Array.from(mid.data)) {
          const sp = document.createElement('span'); sp.className = 'wc'; sp.textContent = ch;
          sp.style.animationDuration = `${c.step.toFixed(1)}ms`; sp.style.animationDelay = `${Math.round(k * c.step - (now - c.t))}ms`; k += ch.length; frag.appendChild(sp);
        }
        mid.parentNode?.replaceChild(frag, mid);
      }
    }
  }, [html, live]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Pictures from this chat, and effects that play once they are on screen (never while the reply is still being written).
  useEffect(() => {
    const el = box.current; if (!el) return;
    el.querySelectorAll<HTMLImageElement>('img[data-pic]').forEach((im) => {
      const p = pics?.[Number(im.dataset.pic) - 1];
      if (p) { im.src = dataUrl(p); im.removeAttribute('data-pic'); } else if (!live) im.replaceWith(Object.assign(document.createElement('span'), { className: 'cx-img-miss', textContent: im.alt || 'Picture' }));
    });
    if (live) { el.querySelectorAll('pre').forEach((p) => { p.scrollTop = p.scrollHeight; }); return; }   // code being written stays in view
    const els = el.querySelectorAll('.fx-s, .fx-box'); if (!els.length) return;
    if (typeof IntersectionObserver === 'undefined') { els.forEach((e) => e.classList.add('fx-go')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('fx-go'); io.unobserve(e.target); } }), { threshold: 0.15 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [html, live, pics?.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Tapping an animated word or box plays it again.
  const again = (e: React.MouseEvent) => {
    const t = (e.target as Element).closest?.('.fx-s, .fx-box'); if (!t) return;
    t.classList.remove('fx-go'); void (t as HTMLElement).offsetWidth; t.classList.add('fx-go');
  };
  return <div ref={box} className={`cx-md tx${live ? ' fx-hold' : ''}`} onClick={again} dangerouslySetInnerHTML={{ __html: html }} />;
});

export const Rich = memo(function Rich({ text, msg, live }: { text: string; msg?: Msg; live?: boolean }) {
  const segs = useMemo(() => splitBlocks(text), [text]);
  const ctx = useContext(RichContext);
  const lastPlan = segs.reduce((n, s, i) => (s.t === 'block' && s.lang === 'coe-plan' && s.closed ? i : n), -1);   // a checklist that is rewritten shows once, as it stands now
  return (
    <>
      {segs.map((s, i) => {
        if (s.t === 'md') return <Md key={i} text={s.text} live={live && i === segs.length - 1} />;
        if (s.t === 'fold') return <details key={i} className="cx-fold"><summary className="d"><UiIcon name="down" size={14} />{s.title}</summary><div className="cx-fold-in"><Rich text={s.text} live={live && !s.closed} /></div></details>;
        if (s.lang === 'html') return <Preview key={i} kind="html" code={s.code} closed={s.closed && !live} />;
        if (s.lang === 'svg') return <Preview key={i} kind="svg" code={s.code} closed={s.closed} />;
        if (s.lang === 'mermaid') return <Preview key={i} kind="mermaid" code={s.code} closed={s.closed} />;
        if (STUDY_LANGS.includes(s.lang)) return <StudyBlock key={i} lang={s.lang} code={s.code} closed={s.closed && !live} />;
        if (s.lang === 'followups') return null;
        if (s.lang === 'slides') return <SlidesBlock key={i} code={s.code} closed={s.closed && !live} />;
        if (s.lang === 'data') return <DataBlock key={i} code={s.code} closed={s.closed && !live} ask={ctx?.ask} />;
        if (s.lang === 'map') return <MapBlock key={i} code={s.code} closed={s.closed && !live} />;
        if (s.lang === 'ask') return <AskCard key={i} code={s.code} closed={s.closed && !live} id={`${msg?.id ?? 'x'}:${s.n}`} send={ctx?.ask} />;
        if (s.lang === 'questions') return <QuestionsBlock key={i} code={s.code} closed={s.closed && !live} id={`${msg?.id ?? 'x'}:${s.n}`} ask={ctx?.ask} redo={ctx?.redo} />;
        if (s.lang === 'coe-plan') return s.closed && i === lastPlan && !(msg && ctx?.oldPlans?.has(msg.id)) ? <PlanCard key={i} code={s.code} /> : null;
        if (s.lang === 'coe-tool') return msg ? <ToolSlot key={i} msg={msg} n={s.n} closed={s.closed} code={s.code} /> : null;
        return null;
      })}
    </>
  );
});

// ---------------------------------------------------------------- the checklist in Deep Work
function PlanCard({ code }: { code: string }) {
  let p: { steps?: string[]; done?: number } | null = null; try { p = JSON.parse(code); } catch { /* shown as nothing */ }
  const steps = (p?.steps ?? []).map(String).slice(0, 20), done = Math.max(0, Math.min(steps.length, Number(p?.done) || 0));
  if (!steps.length) return null;
  return (
    <div className="cx-plan" role="group" aria-label="Plan">
      <div className="cx-plan-h d"><UiIcon name="list" size={16} />Plan<i>{done} of {steps.length}</i></div>
      <div className="cx-plan-bar" aria-hidden><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol>{steps.map((s, i) => <li key={i} className={i < done ? 'done' : i === done ? 'now' : ''}><span aria-hidden>{i < done ? <UiIcon name="check" size={14} /> : i + 1}</span><span className="tx">{s}</span></li>)}</ol>
    </div>
  );
}

// ---------------------------------------------------------------- previews: pages, pictures, diagrams
type Kind = 'html' | 'svg' | 'mermaid';
/** The title a picture or diagram gives itself: an svg's <title>, or a mermaid title line. */
function pvTitle(kind: Kind, code: string): string {
  if (kind === 'svg') return /<title[^>]*>([^<]{1,70})/i.exec(code)?.[1]?.trim() || '';
  if (kind === 'mermaid') return /^\s*title:\s*["']?(.{1,70}?)["']?\s*$/im.exec(code)?.[1]?.trim() || /^\s*%%\s*title:\s*(.{1,70})$/im.exec(code)?.[1]?.trim() || '';
  return '';
}
const SIZES = [{ k: 'phone', n: 'Phone', w: 390 }, { k: 'tablet', n: 'Tablet', w: 768 }, { k: 'full', n: 'Full', w: 0 }] as const;

let mermaidQ: Promise<unknown> = Promise.resolve();
async function drawMermaid(code: string): Promise<string> {
  const run = async () => {
    const m = (await import('mermaid')).default;
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' });   // the standard look: a diagram follows what it is about, not Coe's own colours
    const id = 'mm' + Math.random().toString(36).slice(2);
    try { return (await m.render(id, code.trim())).svg; } finally { document.getElementById('d' + id)?.remove(); }
  };
  const p = mermaidQ.then(run, run); mermaidQ = p.catch(() => {}); return p;
}

function svgSize(svg: string): [number, number] {
  const vb = /viewBox=["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(svg); if (vb) return [+vb[1], +vb[2]];
  const w = /\swidth=["']([\d.]+)/i.exec(svg), h = /\sheight=["']([\d.]+)/i.exec(svg); return [w ? +w[1] : 1024, h ? +h[1] : 768];
}
async function svgToPng(svg: string): Promise<Blob> {
  const [w, h] = svgSize(svg), k = Math.min(3, 2400 / Math.max(w, h)) || 1;
  const img = new Image(); const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('That picture could not be turned into a PNG.')); img.src = url; });
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const x = c.getContext('2d')!; x.fillStyle = '#FBF6EC'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
}

const ZOOMS = [{ k: '50', n: '50%' }, { k: '75', n: '75%' }, { k: 'fit', n: 'Fit' }, { k: '125', n: '125%' }] as const;
/** A page in a box that always fits: the page is laid out at its real width and scaled down to the space there is. */
function ScaledFrame({ vw, zoom, srcDoc, title, sandbox, k }: { vw: number; zoom: string; srcDoc: string; title: string; sandbox: string; k: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 600, h: 400 });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const read = () => setDim({ w: el.clientWidth || 600, h: el.clientHeight || 400 });
    read(); if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read); ro.observe(el); return () => ro.disconnect();
  }, []);
  const sc = zoom === 'fit' ? (vw ? Math.min(1, dim.w / vw) : 1) : Number(zoom) / 100;
  const W = vw || Math.round(dim.w / sc);
  return (
    <div ref={box} className="cx-pv-box">
      <div className="cx-pv-sizer" style={{ width: W * sc, height: dim.h }}>
        <iframe key={k} className="cx-pv-frame" title={title} sandbox={sandbox} referrerPolicy="no-referrer" srcDoc={srcDoc} style={{ width: W, height: dim.h / sc, transform: `scale(${sc})` }} />
      </div>
    </div>
  );
}

export function Preview({ kind, code, closed, title }: { kind: Kind; code: string; closed: boolean; title?: string }) {
  const [tab, setTab] = useState<'view' | 'code'>('view');
  const [size, setSize] = useState<(typeof SIZES)[number]['k']>('full'), [zoom, setZoom] = useState('fit');
  const [big, setBig] = useState(false);
  const [run, setRun] = useState(0);
  const [svg, setSvg] = useState<string | null>(null), [err, setErr] = useState('');
  const shared = !!useContext(RichContext)?.shared;      // on a shared page the words came from someone else, so a page only runs when asked
  const [trusted, setTrusted] = useState(!shared);
  const showCode = tab === 'code' || !closed;
  const codeRef = useRef<HTMLPreElement>(null);
  useEffect(() => { const el = codeRef.current; if (el && !closed) el.scrollTop = el.scrollHeight; }, [code, closed]);   // follow the code as it is written

  // SVG pictures are cleaned first. Diagrams are drawn by Mermaid once the block is complete.
  useEffect(() => {
    if (!closed) return; let live = true;
    if (kind === 'svg') { setSvg(cleanSvg(code)); setErr(cleanSvg(code) ? '' : 'That is not an SVG picture I can show.'); }
    if (kind === 'mermaid') { setErr(''); drawMermaid(code).then((s) => { if (live) setSvg(s); }, (e) => { if (live) { setSvg(null); setErr(String(e?.message || e).split('\n')[0].slice(0, 200)); } }); }
    return () => { live = false; };
  }, [kind, code, closed]);

  const label = kind === 'html' ? 'Page' : pvTitle(kind, code) || (kind === 'svg' ? 'Picture' : 'Diagram');
  const name = kind === 'html' ? 'page.html' : kind === 'svg' ? 'picture.svg' : 'diagram.svg';
  const save = () => (kind === 'html' ? downloadText(name, code, 'text/html') : svg ? downloadText(name, svg, 'image/svg+xml') : undefined);
  const png = () => { if (svg) svgToPng(svg).then((b) => downloadBlob(name.replace('.svg', '.png'), b), () => {}); };
  const sw = SIZES.find((s) => s.k === size)!.w;

  const frame = kind === 'html' && closed && !showCode ? (
    <div className="cx-pv-stage">
      {!trusted
        ? <div className="cx-pv-gate"><p className="tx"><b>This page was written by the person who shared the chat.</b> It can run code. Show it only if you trust them, and never type a password or card number into it.</p><button type="button" className="btn gold" onClick={() => setTrusted(true)}>Show the page</button></div>
        : <ScaledFrame k={run} vw={sw} zoom={zoom} title={title || 'Preview'} sandbox={shared ? 'allow-scripts' : 'allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock'} srcDoc={code} />}
    </div>
  ) : null;
  const pic = kind !== 'html' && closed && !showCode ? (
    <div className="cx-pv-pic">{svg ? (kind === 'svg' ? <img alt="Picture" src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} /> : <div dangerouslySetInnerHTML={{ __html: svg }} />) : err ? <p className="cx-pv-err tx">{err} <button type="button" className="cx-link" onClick={() => setTab('code')}>See the code</button></p> : <p className="tx cx-pv-wait">Drawing…</p>}</div>
  ) : null;
  const body = showCode ? <pre ref={codeRef} className="cx-pv-code"><code>{code}</code></pre> : frame ?? pic;

  const head = (
    <div className="cx-pv-top">
      <span className="d cx-pv-name"><UiIcon name={kind === 'html' ? 'globe' : 'image'} size={15} />{label}{!closed && <i>writing…</i>}</span>
      <span className="cx-grow" />
      {closed && (
        <div className="seg cx-pv-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={tab === 'view'} onClick={() => setTab('view')}>Preview</button>
          <button type="button" aria-pressed={tab === 'code'} onClick={() => setTab('code')}>Code</button>
        </div>
      )}
      {closed && kind === 'html' && tab === 'view' && (
        <div className="seg cx-pv-seg" role="group" aria-label="Screen size">{SIZES.map((s) => <button key={s.k} type="button" aria-pressed={size === s.k} onClick={() => setSize(s.k)}>{s.n}</button>)}</div>
      )}
      {closed && kind === 'html' && tab === 'view' && <div className="seg cx-pv-seg" role="group" aria-label="Zoom">{ZOOMS.map((z) => <button key={z.k} type="button" aria-pressed={zoom === z.k} onClick={() => setZoom(z.k)}>{z.n}</button>)}</div>}
    </div>
  );
  const foot = closed && (
    <div className="cx-pv-bar">
      {kind === 'html' && <button type="button" className="cx-act" onClick={() => setRun((n) => n + 1)}><UiIcon name="refresh" size={14} />Reload</button>}
      <button type="button" className="cx-act" onClick={() => setBig(true)}><UiIcon name="expand" size={14} />Bigger</button>
      <button type="button" className="cx-act" onClick={save} disabled={kind !== 'html' && !svg}><UiIcon name="download" size={14} />{kind === 'html' ? 'Save .html' : 'Save .svg'}</button>
      {kind !== 'html' && <button type="button" className="cx-act" onClick={png} disabled={!svg}><UiIcon name="image" size={14} />Save .png</button>}
      <CopyButton text={code} label="Copy code" small />
    </div>
  );

  return (
    <figure className={`cx-pv ${kind}${kind !== 'html' ? ' flat' : ''}`}>
      {head}
      {body}
      {foot}
      {big && (
        <div className="cx-pv-big" role="dialog" aria-label="Preview">
          <div className="cx-pv-big-top"><b className="d">{label}</b><span className="cx-grow" />
            {kind === 'html' && <div className="seg cx-pv-seg" role="group" aria-label="Screen size">{SIZES.map((s) => <button key={s.k} type="button" aria-pressed={size === s.k} onClick={() => setSize(s.k)}>{s.n}</button>)}</div>}
            {kind === 'html' && <div className="seg cx-pv-seg" role="group" aria-label="Zoom">{ZOOMS.map((z) => <button key={z.k} type="button" aria-pressed={zoom === z.k} onClick={() => setZoom(z.k)}>{z.n}</button>)}</div>}<button type="button" className="btn small" onClick={() => setBig(false)}><UiIcon name="close" size={15} />Close</button></div>
          <div className="cx-pv-big-body">
            {kind === 'html' ? <ScaledFrame k={run} vw={sw} zoom={zoom} title="Preview" sandbox={shared ? 'allow-scripts' : 'allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock'} srcDoc={code} />
              : svg ? (kind === 'svg' ? <img alt="Picture" src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} /> : <div dangerouslySetInnerHTML={{ __html: svg }} />) : null}
          </div>
        </div>
      )}
    </figure>
  );
}

/** A page made of the project folder's files. */
export function ProjectPreview({ files, entry }: { files: Files; entry?: string }) {
  const e = entry && files[entry] !== undefined ? entry : entryOf(files);
  const html = useMemo(() => (e ? inlinePage(files, e) : ''), [files, e]);
  if (!e) return <p className="tx cx-pv-err">There is no HTML page in the project yet.</p>;
  return <Preview kind="html" code={html} closed title={e} />;
}

// ---------------------------------------------------------------- tools
function ToolSlot({ msg, n, closed, code }: { msg: Msg; n: number; closed: boolean; code: string }) {
  const run = msg.runs?.[n];
  let call: Call | null = null; try { call = JSON.parse(code); } catch { /* not complete yet */ }
  if (!closed) return <div className="cx-tool working" role="status"><div className="cx-tool-h"><span className="cx-tool-star" aria-hidden><CoeWork phase="app" size={24} /></span><b className="d">Getting a tool ready</b></div></div>;
  if (!call || typeof call.tool !== 'string') return null;
  return <ToolCard msg={msg} call={call} run={run} />;
}

const TITLES: Record<string, string> = { js: 'Running code', maths: 'Working it out', search: 'Searching the web', image: 'Making a picture', remember: 'Remembering', chat: 'Chats', workspace: 'Project folder', pmc_app: 'PMC App' };
const ICON: Record<string, string> = { js: 'code', maths: 'sigma', search: 'globe', image: 'image', remember: 'pin', chat: 'chat', workspace: 'folder', pmc_app: 'apps' };
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function titleOf(c: Call): string {
  if (c.tool === 'pmc_app') return `PMC App: ${appBySlug(str(c.slug))?.title ?? str(c.slug)}`;
  if (c.tool === 'workspace') return `Project folder: ${str(c.action)}${c.path ? ' ' + str(c.path) : ''}`;
  if (c.tool === 'search') return `Searching the web: ${str(c.q).slice(0, 70)}`;
  return TITLES[c.tool] ?? c.tool;
}

/** The web, in one small card: what Coe looked up and the sites it read. Nothing else; the answer is the reply. */
function WebCard({ call, run }: { call: Call; run?: ToolRun }) {
  const st = run?.status ?? 'running';
  const q = str(call.q).replace(/\s+/g, ' ').trim();
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const sites: { url: string; title: string; host: string }[] = [];
  if (run?.out?.kind === 'search') for (const s of run.out.sources) { const h = host(s.url); if (h && !sites.some((x) => x.host === h)) sites.push({ url: s.url, title: s.title, host: h }); }
  return (
    <div className={`web ${st}`} role="group" aria-label={st === 'running' ? 'Searching the web' : 'The web'}>
      <div className="web-h">
        <UiIcon name={st === 'error' ? 'alert' : 'globe'} size={16} />
        <b className="d">{st === 'running' ? 'Searching the web' : st === 'error' ? 'Could not search the web' : 'Searched the web'}</b>
        {q && <span className="web-q tx" title={q}>{q}</span>}
      </div>
      {st === 'error' && run?.result && <p className="web-e tx" title={run.shown ?? run.result}>{run.shown ?? run.result}</p>}
      {sites.length > 0 && <ul className="web-s">{sites.slice(0, 6).map((s) => <li key={s.host}><a href={s.url} target="_blank" rel="noopener noreferrer" title={s.title || s.host}><i className="d" aria-hidden>{s.host[0].toUpperCase()}</i>{s.host}</a></li>)}</ul>}
      {st === 'running' && <i className="web-bar" aria-hidden />}
    </div>
  );
}

function ToolCard({ msg, call, run }: { msg: Msg; call: Call; run?: ToolRun }) {
  const ctx = useContext(RichContext);
  const st = run?.status ?? 'running';
  if ((st as string) === 'error') return null;   // a step that did not work is said once, in the reply. No red card that says it again.
  // Running code and working in an app are steps, not part of the answer: they sit under "What Coe did", unless they made files or a picture for you.
  if (['js', 'maths'].includes(call.tool) && st !== 'error' && st !== 'pending' && run?.out?.kind !== 'files' && run?.out?.kind !== 'image') return null;
  if (call.tool === 'pmc_app' && st !== 'error' && st !== 'pending') return null;   // its result is the card under the reply, with Open app
  if (run?.out?.kind === 'permit') return <PermitCard run={run} ctx={ctx} />;
  if (call.tool === 'editor') return run?.out?.kind === 'doc' ? <DocCard out={run.out} ctx={ctx} /> : st === 'error' ? <div className="cx-tool error"><div className="cx-tool-h"><UiIcon name="alert" size={16} /><b className="d">Editor</b><span className="cx-grow" /><i className="cx-tool-st">Did not work</i></div><p className="cx-tool-err tx">{run?.shown ?? run?.result}</p></div> : null;   // changes to a document are steps, shown under "What Coe did"
  if (call.tool === 'read' || call.tool === 'screenshot') return st === 'error' ? <div className="cx-tool error"><div className="cx-tool-h"><UiIcon name="alert" size={16} /><b className="d">{call.tool === 'read' ? 'Reading a file' : 'Screenshot'}</b><span className="cx-grow" /><i className="cx-tool-st">Did not work</i></div><p className="cx-tool-err tx">{run?.shown ?? run?.result}</p></div> : null;
  if (call.tool === 'search') return <WebCard call={call} run={run} />;
  const state = st === 'running' ? 'Working' : st === 'error' ? 'Did not work' : 'Done';
  return (
    <div className={`cx-tool ${st}`}>
      <div className="cx-tool-h">
        <UiIcon name={ICON[call.tool] ?? 'sparkle'} size={16} />
        <b className="d">{titleOf(call)}</b><span className="cx-grow" /><i className="cx-tool-st">{state}</i>
      </div>
      <ToolBody msg={msg} call={call} run={run} ctx={ctx} />
    </div>
  );
}


// ---------------------------------------------------------------- a document Coe made, and the question before the editor opens
const asked = (k: string) => { try { return localStorage.getItem(`pmc:coe:asked:${k}`); } catch { return null; } };
const mark = (k: string, v: string) => { try { localStorage.setItem(`pmc:coe:asked:${k}`, v); } catch { /* not saved */ } };

/** Three buttons that answer at once. Keys 1, 2 and 3 work too. */
export function Choice({ id, title, text, icon, yes, onPick, done, doneTitle }: { id: string; title: string; text: string; icon: string; yes: string; onPick: (c: 'yes' | 'always' | 'never') => void; done?: React.ReactNode; doneTitle?: string }) {
  const [got, setGot] = useState<string | null>(() => asked(id));
  const pick = (c: 'yes' | 'always' | 'never') => { mark(id, c); setGot(c); onPick(c); };
  if (got) return <div className="dk" role="status"><div className="dk-h"><span className="dk-ic"><UiIcon name={icon as never} size={20} /></span><span className="dk-n"><b className="d">{doneTitle ?? title}</b><i className="tx">{got === 'never' ? 'You chose not to open it.' : got === 'always' ? 'Opened. It will open by itself in this chat.' : 'Opened.'}</i></span></div>{done}</div>;
  return (
    <div className="dk" role="group" aria-label={title} tabIndex={-1} onKeyDown={(e) => { const n = Number(e.key); if (n >= 1 && n <= 3) { e.preventDefault(); pick((['yes', 'always', 'never'] as const)[n - 1]); } }}>
      <div className="dk-h"><span className="dk-ic"><UiIcon name={icon as never} size={20} /></span><span className="dk-n"><b className="d">{title}</b></span></div>
      <p className="dk-q tx">{text}</p>
      <div className="dk-acts">
        <button type="button" className="btn gold" onClick={() => pick('yes')}>{yes}</button>
        <button type="button" className="btn" onClick={() => pick('always')}>Always open in this chat</button>
        <button type="button" className="btn" onClick={() => pick('never')}>Don’t open</button>
      </div>
    </div>
  );
}

function DocCard({ out, ctx }: { out: Extract<ToolOut, { kind: 'doc' }>; ctx: RichCtx | null }) {
  const d = ctx?.docs?.find((x) => x.id === out.id), name = d?.title ?? out.title, kind = KINDS[d?.kind ?? out.dk];
  if (ctx?.perm?.editor || ctx?.edOpen) return (
    <div className="dk"><div className="dk-h"><span className="dk-ic"><UiIcon name={kind.icon} size={20} /></span><span className="dk-n"><b className="d">{name}</b><i className="tx">{kind.name}{d ? '' : ' (deleted)'}</i></span><span className="cx-grow" />
      {d && <button type="button" className="btn gold" onClick={() => ctx?.openDoc?.(out.id)}><UiIcon name="edit" size={16} />Open in editor</button>}</div></div>
  );
  return <Choice id={`doc:${out.id}`} icon={kind.icon} title={`Open “${name}” in the editor?`} text={`Coe made a ${kind.name.toLowerCase()}. The editor opens on the right and the chat stays here.`} yes="Yes, open it" doneTitle={name}
    done={d ? <div className="dk-acts"><button type="button" className="btn" onClick={() => ctx?.openDoc?.(out.id)}><UiIcon name="edit" size={16} />Open in editor</button></div> : undefined}
    onPick={(c) => ctx?.decide?.('editor', c, out.id)} />;
}

function PermitCard({ run, ctx }: { run: ToolRun; ctx: RichCtx | null }) {
  const o = run.out as Extract<ToolOut, { kind: 'permit' }>;
  return <Choice id={`app:${run.id}`} icon="apps" title={`Open ${o.title}?`} text={`Coe wants to open ${o.title} here in the chat to do this. You can say no.`} yes="Yes, open it" onPick={(c) => ctx?.decide?.('app', c, o.slug, run.id)} />;
}

function Files({ items }: { items: Extract<ToolOut, { kind: 'files' }>['items'] }) {
  return (
    <ul className="cx-files">
      {items.map((f, i) => (
        <li key={i}>
          {f.type.startsWith('image/') ? <img alt="" src={`data:${f.type};base64,${f.data}`} /> : <span className="cx-file-ic"><UiIcon name="file" size={22} /></span>}
          <span className="cx-file-n tx"><b>{f.name}</b><i>{f.size > 1e6 ? (f.size / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB'}</i></span>
          <button type="button" className="btn small" onClick={() => { const bin = atob(f.data), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); downloadBlob(f.name, new Blob([u], { type: f.type })); }}><UiIcon name="download" size={14} />Save</button>
        </li>
      ))}
    </ul>
  );
}

function ToolBody({ msg, call, run, ctx }: { msg: Msg; call: Call; run?: ToolRun; ctx: RichCtx | null }) {
  const out = run?.out, st = run?.status ?? 'running';
  const err = st === 'error' && run?.result ? <p className="cx-tool-err tx">{run.shown ?? run.result}</p> : null;
  const tool = call.tool;

  if (tool === 'maths') return <>
    <details className="cx-tool-d"><summary className="tx">{str(call.op) || 'eval'}: {str(call.expr ?? (call.exprs as string[] | undefined)?.join(', '))}</summary></details>
    {out?.kind === 'maths' && <Md text={out.text} />}{err}</>;

  if (tool === 'js') return <>
    <details className="cx-tool-d"><summary className="tx">Code</summary><pre className="cx-pv-code"><code>{str(call.code)}</code></pre></details>
    {out?.kind === 'text' && <pre className="cx-tool-out">{out.text}</pre>}
  </>;
  if (tool === 'image') return <>
    {out?.kind === 'image' && <figure className="cx-gen"><img alt={str(call.prompt).slice(0, 120)} src={dataUrl(out.img)} />
      <figcaption><button type="button" className="cx-act" onClick={() => { const bin = atob(out.img.data), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); downloadBlob(out.img.name, new Blob([u], { type: out.img.type })); }}><UiIcon name="download" size={14} />Save picture</button></figcaption></figure>}
    {st === 'running' && <p className="tx cx-tool-wait">Drawing it. This can take half a minute.</p>}{err}
  </>;
  if (tool === 'remember') return <>{out?.kind === 'text' && <p className="tx cx-tool-text">Saved: “{out.text}”</p>}{err}</>;
  if (tool === 'pmc_app') return <AppCard call={call} run={run} ctx={ctx} />;
  if (tool === 'workspace') {
    const a = str(call.action);
    if (a === 'preview' && ctx) return <ProjectPreview files={ctx.files} entry={str(call.path) || undefined} />;
    return <>{out?.kind === 'text' && (a === 'list' || a === 'run' ? <pre className="cx-tool-out">{out.text}</pre> : <p className="tx cx-tool-text">{out.text.split('\n')[0]}</p>)}{err}</>;
  }
  return err;
}


// ---------------------------------------------------------------- a PMC App, open in the chat
function AppCard({ call, run, ctx }: { call: Call; run?: ToolRun; ctx: RichCtx | null }) {
  const slug = str(call.slug), app = appBySlug(slug);
  const out = run?.out;
  if (!app) return <p className="cx-tool-err tx">There is no app called “{slug}”.</p>;
  return (
    <>
      {run?.note === 'open' && <p className="tx cx-tool-sub">{app.title} is open in the screen below.</p>}
      {run && run.note !== 'open' && run.status === 'ok' && <p className="tx cx-tool-sub">Worked the same window ({app.title}).</p>}
      {out?.kind === 'files' && <Files items={out.items} />}
      {run?.status === 'error' && run.result && <p className="cx-tool-err tx">{run.shown ?? run.result}</p>}
    </>
  );
}

export function AppFrame({ run, app, slug, fullscreen, convId, call }: { run: ToolRun; app: string; slug: string; fullscreen: boolean; convId: string; call: Call }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(fullscreen ? 620 : 460), [big, setBig] = useState(false);
  const src = useMemo(() => appsFrameSrc(slug, typeof location === 'undefined' ? '' : location.origin), [slug]);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const f = makeFrame(el, slug);
    const offA = registerFrame(run.id, f), offB = registerFrame(`${convId}:${slug}`, f);
    const offH = f.onHeight((px) => { if (!fullscreen) setH(Math.max(320, Math.min(820, px + 4))); });
    // A chat opened again later: put back what was filled in, but do not press anything again.
    if (run.status !== 'running') void f.ready.then(() => f.act({ fill: call.fill as Record<string, unknown>, state: call.state as Record<string, unknown>, call: call.call as Record<string, unknown> }));
    return () => { offA(); offB(); offH(); f.dispose(); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`cx-app${big ? ' big' : ''}`}>
      <div className="cx-app-top"><b className="d">{app}</b><span className="cx-grow" />
        <a className="cx-act" href={`${APPS_URL}/${slug}`} target="_blank" rel="noopener noreferrer"><UiIcon name="link" size={14} />Open on its own</a>
        <button type="button" className="cx-act" onClick={() => setBig((b) => !b)}><UiIcon name={big ? 'close' : 'expand'} size={14} />{big ? 'Smaller' : 'Bigger'}</button></div>
      <iframe ref={ref} className="cx-app-frame" title={app} src={src} style={big ? undefined : { height: h }} allow="clipboard-write" />
    </div>
  );
}

/**
 * The screen: what Coe is looking at (a PMC App it opened), at the end of the one reply it belongs to, under the text.
 * The steps and commands that went with it are under the picture, shut until you open them. Hide it with Hide.
 */
/** What the screen shows now: the latest app Coe opened. An app stays until the chat moves on to something else. */
export function dockTarget(messages: Msg[]): { run: ToolRun; end: number; app: boolean } | null {
  let app: ToolRun | undefined, end = -1;
  messages.forEach((m, i) => (m.runs ?? []).forEach((r) => { if (r.tool === 'pmc_app' && r.note === 'open') { app = r; end = i; } }));
  return app ? { run: app, end, app: true } : null;
}

/** What a PMC App made, as a result: pictures shown, other files as chips. The live app is kept out of sight until you press Open app. */
function AppResult({ run, title, slug, extra }: { run: ToolRun; title: string; slug: string; extra: { name: string; type: string; size: number; data: string }[] }) {
  const items = extra;
  const pics = items.filter((f) => f.type.startsWith('image/')), others = items.filter((f) => !f.type.startsWith('image/'));
  // What the person reads is a plain sentence. What the app told Coe ("Shown by the app: [div] Loading...") is for Coe, not for the screen.
  const worked = !!(run.args.fill || (Array.isArray(run.args.click) && run.args.click.length) || run.args.call || run.args.state);
  const said = run.status === 'error' ? String(run.shown ?? '').replace(/\s+/g, ' ').trim() || `Coe could not use ${title}.` : worked ? `Coe worked in ${title}. Press Open app to see it.` : `${title} is ready. Press Open app to use it.`;
  const dl = (f: { name: string; type: string; data: string }) => { const bin = atob(f.data); const u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); downloadBlob(f.name, new Blob([u], { type: f.type })); };
  return (
    <div className="cx-res">
      {pics.length > 0 && <div className="cx-res-pics">{pics.map((p, k) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={k} src={`data:${p.type};base64,${p.data}`} alt={p.name} />)}</div>}
      {others.length > 0 && <div className="cx-res-files">{others.map((f, k) => <button key={k} type="button" className="cx-res-f" onClick={() => dl(f)} aria-label={`Download ${f.name}`}><UiIcon name="file" size={16} /><b className="d">{f.name}</b><i className="tx">{Math.max(1, Math.round(f.size / 1024))} KB</i><UiIcon name="download" size={15} /></button>)}</div>}
      {!items.length && run.status !== 'running' && said && <p className="cx-res-t tx">{said.length > 180 ? said.slice(0, 179) + '…' : said}</p>}
      {run.status === 'running' && <p className="cx-res-t tx">Working in {title}…</p>}
      <span className="cx-res-by tx">{slug}</span>
    </div>
  );
}

export function Dock({ messages, convId, live, from, to }: { messages: Msg[]; convId: string; live: boolean; from: number; to: number }) {
  const [openApp, setOpenApp] = useState<string | null>(null);
  const t = dockTarget(messages);
  if (!t || t.end < from || t.end > to) return null;
  const { run } = t;
  const steps = turnSteps(messages, to);   // the steps of the whole turn this belongs to
  const slug = str(run.args.slug), meta = appBySlug(slug);
  if (!meta) return null;
  const filesIn: { name: string; type: string; size: number; data: string }[] = [];
  for (let k = Math.max(0, from); k <= to; k++) for (const r of messages[k]?.runs ?? []) if (r.tool === 'pmc_app' && str(r.args.slug) === slug && r.out?.kind === 'files') for (const f of r.out.items) if (!filesIn.some((x) => x.name === f.name)) filesIn.push(f);
  const open = openApp === run.id;
  return (
    <section className={`cx-dock app${open ? ' open' : ''}`} aria-label={`${meta!.title}, result`}>
      <div className="cx-dock-bar"><b className="d">{meta!.title}</b><span className="cx-grow" />
        <button type="button" className="cx-act cx-open" onClick={() => setOpenApp(open ? null : run.id)} aria-expanded={open} title={open ? 'Close the app' : 'Open the app with these changes'}><UiIcon name={open ? 'close' : 'expand'} size={14} /><span>{open ? 'Close app' : 'Open app'}</span></button></div>
      {!open && <AppResult run={run} title={meta!.title} slug={slug} extra={filesIn} />}
      {/* the app stays running out of sight, so Coe can keep using it and "Open app" shows it exactly as Coe left it */}
      <div className={open ? 'cx-dock-body' : 'cx-app-hold'}>
        <AppFrame key={run.id} run={run} app={meta!.title} slug={slug} fullscreen={meta!.fullscreen} convId={convId} call={run.args as Call} />
      </div>
      {!live && steps.length > 5 && <div className="cx-dock-steps"><Activity steps={steps} live={false} /></div>}
    </section>
  );
}

export const hasProject = hasFiles;
