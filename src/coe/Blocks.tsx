'use client';
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { CopyButton, downloadBlob, downloadText } from '@/ui/copy';
import { cleanSvg, hasMath, loadMath, renderMarkdown } from './markdown';
import { STUDY_LANGS, StudyBlock } from './Study';
import { SlidesBlock } from './Slides';
import { DataBlock } from './DataTable';
import { AskCard } from './AskCard';
import { MapBlock } from './MapBlock';
import { dataUrl, type Img, type Msg, type ToolOut, type ToolRun } from './store';
import { appsFrameSrc, defOf, findTool, needsApproval, summary, type Call } from '@/lib/coe/tools';
import { APPS_URL, appBySlug, makeFrame, registerFrame } from '@/lib/coe/pmc';
import { googleAvailable } from '@/lib/coe/google';
import { links } from '@/lib/coe/links';
import { entryOf, hasFiles, inlinePage, type Files } from '@/lib/coe/workspace';
import type { PlanKey } from '@/lib/coe/models';

// ---------------------------------------------------------------- what the blocks need from the chat
export interface RichCtx { shared?: boolean; /** Pictures in this chat, oldest first: ![](pic:1) shows the first. */ pics?: Img[]; /** Text effects on or off. */ effects?: boolean; plan: PlanKey; files: Files; convId: string; ask?: (text: string) => void; approve: (msgId: string, runId: string) => void; skip: (msgId: string, runId: string) => void }
export const RichContext = createContext<RichCtx | null>(null);

// ---------------------------------------------------------------- splitting a reply into words and special blocks
export type Seg = { t: 'md'; text: string } | { t: 'block'; lang: string; code: string; closed: boolean; n: number };
const SPECIAL = new Set(['html', 'htm', 'svg', 'mermaid', 'coe-tool', 'coe-plan', 'followups', 'slides', 'data', 'map', 'ask', ...STUDY_LANGS]);

export function splitBlocks(text: string): Seg[] {
  const lines = text.split('\n'), segs: Seg[] = [], count: Record<string, number> = {};
  let buf: string[] = [], i = 0;
  const flush = () => { if (buf.length) { const t = buf.join('\n'); if (t.trim()) segs.push({ t: 'md', text: t }); buf = []; } };
  while (i < lines.length) {
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
    if (live) return;
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

export function Preview({ kind, code, closed, title }: { kind: Kind; code: string; closed: boolean; title?: string }) {
  const [tab, setTab] = useState<'view' | 'code'>('view');
  const [size, setSize] = useState<(typeof SIZES)[number]['k']>('full');
  const [big, setBig] = useState(false);
  const [run, setRun] = useState(0);
  const [svg, setSvg] = useState<string | null>(null), [err, setErr] = useState('');
  const shared = !!useContext(RichContext)?.shared;      // on a shared page the words came from someone else, so a page only runs when asked
  const [trusted, setTrusted] = useState(!shared);
  const showCode = tab === 'code' || !closed;

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
    <div className="cx-pv-stage" style={{ background: 'repeating-conic-gradient(#e9dfcd 0 25%, #f4ecdc 0 50%) 0 0 / 18px 18px' }}>
      {!trusted
        ? <div className="cx-pv-gate"><p className="tx"><b>This page was written by the person who shared the chat.</b> It can run code. Show it only if you trust them, and never type a password or card number into it.</p><button type="button" className="btn gold" onClick={() => setTrusted(true)}>Show the page</button></div>
        : <iframe key={run} className="cx-pv-frame" title={title || 'Preview'} sandbox={shared ? 'allow-scripts' : 'allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock'} referrerPolicy="no-referrer" srcDoc={code} style={{ width: sw ? sw : '100%' }} />}
    </div>
  ) : null;
  const pic = kind !== 'html' && closed && !showCode ? (
    <div className="cx-pv-pic">{svg ? (kind === 'svg' ? <img alt="Picture" src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} /> : <div dangerouslySetInnerHTML={{ __html: svg }} />) : err ? <p className="cx-pv-err tx">{err} <button type="button" className="cx-link" onClick={() => setTab('code')}>See the code</button></p> : <p className="tx cx-pv-wait">Drawing…</p>}</div>
  ) : null;
  const body = showCode ? <pre className="cx-pv-code"><code>{code}{!closed && <span className="cx-cursor" aria-hidden />}</code></pre> : frame ?? pic;

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
            <button type="button" className="btn small" onClick={() => setBig(false)}><UiIcon name="close" size={15} />Close</button></div>
          <div className="cx-pv-big-body">
            {kind === 'html' ? <iframe className="cx-pv-frame" title="Preview" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock" referrerPolicy="no-referrer" srcDoc={code} style={{ width: sw ? sw : '100%', height: '100%' }} />
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

const TITLES: Record<string, string> = { js: 'Running code', maths: 'Working it out', search: 'Searching the web', image: 'Making a picture', remember: 'Remembering', google_doc: 'Google Doc', google_sheet: 'Google Sheet', google_slides: 'Google Slides', google_read: 'Reading Google', github: 'GitHub', workspace: 'Project folder', pmc_app: 'PMC App' };
const ICON: Record<string, string> = { js: 'code', maths: 'sigma', search: 'globe', image: 'image', remember: 'pin', google_doc: 'file', google_sheet: 'list', google_slides: 'panel', google_read: 'file', github: 'branch', workspace: 'folder', pmc_app: 'apps' };
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function titleOf(c: Call): string {
  if (c.tool === 'pmc_app') return `PMC App: ${appBySlug(str(c.slug))?.title ?? str(c.slug)}`;
  if (c.tool === 'workspace') return `Project folder: ${str(c.action)}${c.path ? ' ' + str(c.path) : ''}`;
  if (c.tool === 'github') return `GitHub: ${str(c.action)}${c.repo ? ' ' + str(c.repo) : ''}`;
  if (c.tool === 'search') return `Searching the web: ${str(c.q).slice(0, 70)}`;
  return TITLES[c.tool] ?? c.tool;
}

function ToolCard({ msg, call, run }: { msg: Msg; call: Call; run?: ToolRun }) {
  const ctx = useContext(RichContext);
  const st = run?.status ?? 'running';
  const waiting = needsApproval(call) && (st === 'pending' || (st === 'error' && !!run?.note));
  const state = st === 'running' ? 'Working' : st === 'pending' ? 'Waiting for you' : st === 'error' ? 'Did not work' : 'Done';
  return (
    <div className={`cx-tool ${st}${waiting ? ' wait' : ''}`}>
      <div className="cx-tool-h">
        {st === 'running' ? <span className="cx-spin" aria-hidden /> : <UiIcon name={ICON[call.tool] ?? 'sparkle'} size={16} />}
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
  if (tool === 'github') {
    const a = str(call.action);
    if (!needsApproval(call)) return <>{out?.kind === 'text' && <pre className="cx-tool-out">{out.text}</pre>}{err}</>;
    const files = Array.isArray(call.files) ? (call.files as { path?: string; delete?: boolean }[]) : [];
    return <>
      <p className="tx cx-tool-text">{summary(call)}</p>
      {a === 'commit' && <ul className="cx-diff">{files.map((f, i) => <li key={i} className={f.delete ? 'del' : 'add'}><b>{f.delete ? '−' : '+'}</b>{str(f.path)}</li>)}{call.from_workspace === true && <li className="add"><b>+</b>every file in the project folder</li>}</ul>}
      {str(call.body) && <p className="tx cx-tool-sub">{str(call.body).slice(0, 400)}</p>}
      <Approve msg={msg} run={run} ctx={ctx} label={a === 'commit' ? (call.pr ? 'Commit and open pull request' : 'Commit') : a === 'issue' ? 'Open the issue' : 'Open the pull request'} need="github" />
    </>;
  }
  if (tool === 'google_doc' || tool === 'google_sheet' || tool === 'google_slides') return <GoogleCard msg={msg} call={call} run={run} ctx={ctx} />;
  if (tool === 'google_read') return <>{out?.kind === 'text' && <p className="tx cx-tool-text">{out.text}</p>}{err}</>;
  return err;
}

function Approve({ msg, run, ctx, label, need }: { msg: Msg; run?: ToolRun; ctx: RichCtx | null; label: string; need: 'google' | 'github' }) {
  const st = run?.status ?? 'running';
  const pro = ctx?.plan === 'pro';
  useEffect(() => { if (need === 'google' && googleAvailable) void import('@/lib/coe/google').then(() => { const s = document.createElement('link'); s.rel = 'preconnect'; s.href = 'https://accounts.google.com'; document.head.appendChild(s); }); }, [need]);
  if (st === 'ok' && run?.out?.kind === 'link') return <a className="btn small gold" href={run.out.url} target="_blank" rel="noopener noreferrer"><UiIcon name="link" size={14} />{run.out.label}</a>;
  if (st === 'running') return <p className="tx cx-tool-wait">Working on it…</p>;
  const noGoogle = need === 'google' && !googleAvailable, noGh = need === 'github' && !links().github;
  return (
    <div className="cx-appr">
      {!pro
        ? <a className="btn small gold" href="/plans/"><UiIcon name="bolt" size={14} />{label} (Pro)</a>
        : noGoogle ? <p className="tx cx-tool-sub">Google is not switched on for this site yet.</p>
        : noGh ? <button type="button" className="btn small" onClick={() => window.dispatchEvent(new CustomEvent('pmc:coe-open', { detail: 'connections' }))}>Connect GitHub first</button>
        : <><button type="button" className="btn small gold" onClick={() => ctx?.approve(msg.id, run?.id ?? '')}>{label}</button><button type="button" className="cx-act" onClick={() => ctx?.skip(msg.id, run?.id ?? '')}>No thanks</button></>}
      {run?.note && st !== 'ok' && <p className="cx-tool-err tx">{run.note}</p>}
      {!run && <p className="tx cx-tool-sub">Getting ready…</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Docs, Sheets, Slides: preview first
const col = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const csv = (rows: unknown[][]) => rows.map((r) => r.map((c) => { const t = String(c ?? ''); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(',')).join('\n');

function GoogleCard({ msg, call, run, ctx }: { msg: Msg; call: Call; run?: ToolRun; ctx: RichCtx | null }) {
  const [sheet, setSheet] = useState(0), [slide, setSlide] = useState(0);
  const title = str(call.title) || 'Untitled';
  const sheets = (Array.isArray(call.sheets) ? call.sheets : []) as { name?: string; rows?: unknown[][] }[];
  const slides = (Array.isArray(call.slides) ? call.slides : []) as { title?: string; bullets?: string[]; text?: string }[];
  const label = call.tool === 'google_doc' ? 'Create in Google Docs' : call.tool === 'google_sheet' ? 'Create in Google Sheets' : 'Create in Google Slides';
  const md = str(call.markdown);
  const html = useMemo(() => (call.tool === 'google_doc' ? renderMarkdown(md) : ''), [call.tool, md]);
  const cur = sheets[Math.min(sheet, sheets.length - 1)];

  return (
    <>
      <p className="cx-gdoc-title d">{title}</p>
      {call.tool === 'google_doc' && <div className="cx-gpage"><div className="cx-md tx" dangerouslySetInnerHTML={{ __html: html }} /></div>}
      {call.tool === 'google_sheet' && cur && (
        <div className="cx-gsheet">
          {sheets.length > 1 && <div className="cx-gtabs" role="tablist">{sheets.map((s, i) => <button key={i} type="button" role="tab" aria-selected={i === sheet} className={i === sheet ? 'on' : ''} onClick={() => setSheet(i)}>{s.name || `Sheet${i + 1}`}</button>)}</div>}
          <div className="cx-gscroll"><table><thead><tr><th />{Array.from({ length: Math.max(1, ...(cur.rows ?? []).map((r) => r.length)) }, (_, i) => <th key={i}>{col(i)}</th>)}</tr></thead>
            <tbody>{(cur.rows ?? []).slice(0, 60).map((r, ri) => <tr key={ri} className={ri === 0 ? 'head' : ''}><th>{ri + 1}</th>{r.map((c, ci) => <td key={ci}>{String(c ?? '')}</td>)}</tr>)}</tbody></table></div>
          {(cur.rows?.length ?? 0) > 60 && <p className="tx cx-tool-sub">Showing the first 60 rows of {cur.rows!.length}.</p>}
        </div>
      )}
      {call.tool === 'google_slides' && slides.length > 0 && (
        <div className="cx-gslides">
          <div className={`cx-slide${slide === 0 ? ' cover' : ''}`}><b className="d">{slides[Math.min(slide, slides.length - 1)].title}</b>
            {(slides[Math.min(slide, slides.length - 1)].bullets?.length ? <ul>{slides[Math.min(slide, slides.length - 1)].bullets!.map((b, i) => <li key={i} className="tx">{b}</li>)}</ul> : <p className="tx">{slides[Math.min(slide, slides.length - 1)].text}</p>)}
            <i>{Math.min(slide, slides.length - 1) + 1} / {slides.length}</i></div>
          <div className="cx-gthumbs">{slides.map((s, i) => <button key={i} type="button" className={i === slide ? 'on' : ''} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`}><span className="tx">{(s.title || '').slice(0, 26)}</span></button>)}</div>
        </div>
      )}
      <div className="cx-appr">
        <Approve msg={msg} run={run} ctx={ctx} label={label} need="google" />
        <button type="button" className="cx-act" onClick={() => {
          if (call.tool === 'google_doc') downloadText(`${title}.md`, md, 'text/markdown');
          else if (call.tool === 'google_sheet') downloadText(`${(cur?.name || title)}.csv`, csv(cur?.rows ?? []), 'text/csv');
          else downloadText(`${title}.md`, slides.map((s, i) => `## ${i + 1}. ${s.title}\n${(s.bullets ?? [s.text ?? '']).map((b) => '- ' + b).join('\n')}`).join('\n\n'), 'text/markdown');
        }}><UiIcon name="download" size={14} />{call.tool === 'google_sheet' ? 'Save .csv' : 'Save .md'}</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- a PMC App, open in the chat
function AppCard({ call, run, ctx }: { call: Call; run?: ToolRun; ctx: RichCtx | null }) {
  const slug = str(call.slug), app = appBySlug(slug);
  const out = run?.out;
  if (!app) return <p className="cx-tool-err tx">There is no app called “{slug}”.</p>;
  return (
    <>
      {run?.note === 'open' && ctx && <AppFrame run={run} app={app.title} slug={slug} fullscreen={app.fullscreen} convId={ctx.convId} call={call} />}
      {run && run.note !== 'open' && run.status === 'ok' && <p className="tx cx-tool-sub">Worked the same window ({app.title}).</p>}
      {out?.kind === 'files' && <Files items={out.items} />}
      {run?.status === 'error' && run.result && <p className="cx-tool-err tx">{run.shown ?? run.result}</p>}
    </>
  );
}

function AppFrame({ run, app, slug, fullscreen, convId, call }: { run: ToolRun; app: string; slug: string; fullscreen: boolean; convId: string; call: Call }) {
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

export const hasProject = hasFiles;
