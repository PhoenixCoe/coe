'use client';
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BrowserWindow, turnSteps } from './Activity';
import { UiIcon } from '@/ui/icons';
import { CopyButton, downloadBlob, downloadText } from '@/ui/copy';
import { cleanSvg, hasMath, loadMath, renderMarkdown } from './markdown';
import { STUDY_LANGS, StudyBlock } from './Study';
import { SlidesBlock } from './Slides';
import { DataBlock } from './DataTable';
import { AskCard } from './AskCard';
import { MapBlock } from './MapBlock';
import { dataUrl, type Img, type Msg, type ToolOut, type ToolRun } from './store';
import { appsFrameSrc, defOf, findTool, type Call } from '@/lib/coe/tools';
import { APPS_URL, appBySlug, makeFrame, registerFrame } from '@/lib/coe/pmc';
import { entryOf, hasFiles, inlinePage, type Files } from '@/lib/coe/workspace';
import type { PlanKey } from '@/lib/coe/models';

// ---------------------------------------------------------------- what the blocks need from the chat
export interface RichCtx { shared?: boolean; /** Pictures in this chat, oldest first: ![](pic:1) shows the first. */ pics?: Img[]; /** Text effects on or off. */ effects?: boolean; plan: PlanKey; files: Files; convId: string; ask?: (text: string) => void }
export const RichContext = createContext<RichCtx | null>(null);

// ---------------------------------------------------------------- splitting a reply into words and special blocks
export type Seg = { t: 'md'; text: string } | { t: 'fold'; title: string; text: string; closed: boolean } | { t: 'block'; lang: string; code: string; closed: boolean; n: number };
const SPECIAL = new Set(['html', 'htm', 'svg', 'mermaid', 'coe-tool', 'coe-plan', 'followups', 'slides', 'data', 'map', 'ask', ...STUDY_LANGS]);

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
  const html = useMemo(() => renderMarkdown(text, fx), [text, ready, fx]);   // eslint-disable-line react-hooks/exhaustive-deps
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
        if (s.lang === 'coe-plan') return s.closed ? <PlanCard key={i} code={s.code} /> : null;
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
  const body = showCode ? <pre ref={codeRef} className="cx-pv-code"><code>{code}{!closed && <span className="cx-cursor" aria-hidden />}</code></pre> : frame ?? pic;

  const head = (
    <div className="cx-pv-top">
      <span className="d cx-pv-name"><UiIcon name={kind === 'html' ? 'globe' : 'image'} size={15} />{kind === 'html' ? 'Page' : kind === 'svg' ? 'Picture' : 'Diagram'}{!closed && <i>writing…</i>}</span>
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
    <figure className={`cx-pv ${kind}`}>
      {head}
      {body}
      {foot}
      {big && (
        <div className="cx-pv-big" role="dialog" aria-label="Preview">
          <div className="cx-pv-big-top"><b className="d">{kind === 'html' ? 'Page' : kind === 'svg' ? 'Picture' : 'Diagram'}</b><span className="cx-grow" />
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
  if (!closed) return <div className="cx-tool working"><div className="cx-tool-h"><span className="cx-spin" aria-hidden /><b className="d">Getting a tool ready</b></div></div>;
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

function ToolCard({ msg, call, run }: { msg: Msg; call: Call; run?: ToolRun }) {
  const ctx = useContext(RichContext);
  const st = run?.status ?? 'running';
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
  if (tool === 'search') return <>
    {out?.kind === 'search' && <>
      <div className="cx-md tx cx-tool-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(out.text.slice(0, 3000)) }} />
      {out.sources.length > 0 && <ul className="cx-sources">{out.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer"><UiIcon name="link" size={13} />{s.title.slice(0, 80)}</a></li>)}</ul>}
    </>}{err}
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
 * The screen: what Coe is looking at (a PMC App it opened, or the web it searched), at the end of the one reply it belongs to, under the text.
 * The steps and commands that went with it are under the picture, shut until you open them. Hide it with Hide.
 */
/** What the screen shows now: the latest app Coe opened, or the web it searched in the latest turn. */
export function dockTarget(messages: Msg[]): { run: ToolRun; end: number; app: boolean } | null {
  let app: ToolRun | undefined, web: ToolRun | undefined, end = -1;
  messages.forEach((m, i) => (m.runs ?? []).forEach((r) => {
    if (r.tool === 'pmc_app' && r.note === 'open') { app = r; web = undefined; end = i; }
    if (r.tool === 'search') { web = r; app = undefined; end = i; }
  }));
  let lastUser = -1; for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user' && !messages[i].hidden) { lastUser = i; break; }
  if (web && end < lastUser) web = undefined;   // the web view is for the latest turn; an app stays until the chat moves on to something else
  const run = app ?? web;
  return run ? { run, end, app: !!app } : null;
}

export function Dock({ messages, convId, live, from, to }: { messages: Msg[]; convId: string; live: boolean; from: number; to: number }) {
  const [hidden, setHidden] = useState<string | null>(null);
  const t = dockTarget(messages);
  if (!t || t.end < from || t.end > to || hidden === t.run.id) return null;
  const { run, end } = t, app = t.app ? run : undefined;
  const steps = turnSteps(messages, to);   // the steps of the whole turn this belongs to
  const slug = str(run.args.slug), meta = app ? appBySlug(slug) : undefined;
  if (app && !meta) return null;
  return (
    <section className="cx-dock" aria-label={app ? `${meta!.title}, open` : 'What Coe found on the web'}>
      <div className="cx-dock-bar"><b className="d">{app ? meta!.title : 'The web'}</b><span className="cx-grow" />
        <button type="button" className="cx-act" onClick={() => setHidden(run.id)} aria-label="Hide the screen"><UiIcon name="down" size={14} />Hide</button></div>
      <div className="cx-dock-body">
        {app ? <AppFrame key={run.id} run={run} app={meta!.title} slug={slug} fullscreen={meta!.fullscreen} convId={convId} call={run.args as Call} /> : <BrowserWindow run={run} />}
      </div>
      {!live && steps.length > 0 && <div className="cx-dock-steps"><Activity steps={steps} live={false} /></div>}
    </section>
  );
}

export const hasProject = hasFiles;
