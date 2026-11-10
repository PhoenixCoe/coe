'use client';
/**
 * The editor: a window on the right of the chat (the side list stays). It is kept as plain as it can be:
 * a big BACK TO CHAT button, one small row with the document's name and a few buttons, and then the page.
 * A Document is a Word-style page, Code has colours and Run, a Web page has a live preview, a Table has a grid.
 * It opens with a very short loading animation and saves as you type.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { CoeStar } from '@/ui/Mark';
import { downloadBlob, downloadText } from '@/ui/copy';
import { copyText } from '@/lib/copy';
import { KINDS, docPage, docText, docxBlob, exportOf, fileName, type EDoc } from '@/lib/coe/editors';
import { LANG_NAME } from '@/lib/coe/codesplit';
import { useBackClose } from './back';
import { DocEditor } from './EdDoc';
import { CodeArea, DataView, WebPreview } from './EdCode';
import { MI, Pop, Sep, Seg, type Ctl } from './EdUi';

export interface EditorProps {
  docs: EDoc[]; activeId: string | null; over: boolean; width: number;
  onDocs: (docs: EDoc[]) => void; onActive: (id: string) => void; onClose: () => void; onSize: (w: number) => void;
  send: (t: string) => void; compose: (t: string) => void; toast: (t: string) => void;
}
type View = 'preview' | 'code' | 'both' | 'table' | 'text';
const LOAD_MS = 650;
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off'; } catch { return false; } };
const dateOf = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function Editor(p: EditorProps) {
  const { docs, over } = p;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false), [confirm, setConfirm] = useState(false);
  const [views, setViews] = useState<Record<string, View>>({});
  const [live, setLive] = useState<Record<string, { rev: number; text: string }>>({});
  const [stats, setStats] = useState({ w: 0, c: 0 }), [sel, setSel] = useState('');
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const root = useRef<HTMLElement>(null), pend = useRef<{ id: string; rev: number; text: string } | null>(null), timer = useRef<number | undefined>(undefined);
  const ctl = useRef<Ctl>({});
  const docsRef = useRef(docs); docsRef.current = docs;
  const onDocsRef = useRef(p.onDocs); onDocsRef.current = p.onDocs;
  const active = docs.find((d) => d.id === p.activeId) ?? docs[0] ?? null;
  const id = active?.id;
  useBackClose(p.onClose);

  // the loading animation: quick, and shorter still when motion is off
  useEffect(() => { const t = window.setTimeout(() => setLoading(false), calm() ? 120 : LOAD_MS); return () => window.clearTimeout(t); }, []);
  useEffect(() => {
    if (loading || over) return;
    const el = root.current?.querySelector<HTMLElement>('.ed-page, .ed-ta'); el?.focus({ preventScroll: true });
  }, [loading, id, over]);
  useEffect(() => { setSel(''); setConfirm(false); }, [id]);

  // saving: a moment after you stop typing, and always before anything leaves
  const flush = useCallback(() => {
    window.clearTimeout(timer.current); const q = pend.current; pend.current = null; if (!q) { setSaving(false); return; }
    const cur = docsRef.current.find((d) => d.id === q.id); setSaving(false);
    if (!cur || cur.rev !== q.rev || cur.text === q.text) return;
    onDocsRef.current(docsRef.current.map((d) => (d.id === q.id ? { ...d, text: q.text, at: Date.now(), by: 'you', prev: undefined } : d)));
  }, []);
  const push = useCallback((d: EDoc, text: string) => {
    pend.current = { id: d.id, rev: d.rev, text }; setLive((o) => ({ ...o, [d.id]: { rev: d.rev, text } })); setSaving(true);
    window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 450);
  }, [flush]);
  useEffect(() => { const on = () => { if (document.visibilityState === 'hidden') flush(); }; document.addEventListener('visibilitychange', on); window.addEventListener('pagehide', flush); return () => { document.removeEventListener('visibilitychange', on); window.removeEventListener('pagehide', flush); flush(); }; }, [flush]);

  const textOf = (d: EDoc) => { const l = live[d.id]; return l && l.rev === d.rev ? l.text : d.text; };
  const close = () => { flush(); p.onClose(); };
  const pick = (nid: string) => { flush(); setConfirm(false); p.onActive(nid); };
  const patch = (d: EDoc, change: Partial<EDoc>) => { flush(); p.onDocs(docsRef.current.map((x) => (x.id === d.id ? { ...x, ...change } : x))); };
  const remove = (d: EDoc) => { flush(); const rest = docsRef.current.filter((x) => x.id !== d.id); p.onDocs(rest); setConfirm(false); if (rest.length) p.onActive(rest[Math.max(0, docsRef.current.findIndex((x) => x.id === d.id) - 1)]?.id ?? rest[0].id); };
  const undoCoe = (d: EDoc) => { if (d.prev === undefined) return; p.onDocs(docsRef.current.map((x) => (x.id === d.id ? { ...x, text: d.prev as string, prev: undefined, rev: x.rev + 1, by: 'you', at: Date.now() } : x))); };

  const view: View = active ? views[active.id] ?? (active.kind === 'web' ? 'both' : active.kind === 'data' ? (active.by === 'coe' ? 'table' : 'text') : 'text') : 'text';
  const setView = (v: View) => { if (active) setViews((o) => ({ ...o, [active.id]: v })); };
  const api = useMemo(() => ({ send: p.send, compose: p.compose, toast: p.toast }), [p.send, p.compose, p.toast]);

  const save = async (how: 'docx' | 'html' | 'txt' | 'print' | 'file') => {
    if (!active) return; flush();
    const d = { ...active, text: textOf(active) };
    try {
      if (how === 'docx') downloadBlob(fileName(d.title, 'docx'), await docxBlob(d.title, d.text));
      else if (how === 'html') downloadText(fileName(d.title, 'html'), docPage(d.title, d.text), 'text/html');
      else if (how === 'txt') downloadText(fileName(d.title, 'txt'), docText(d.text));
      else if (how === 'print') {
        const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;left:-20000px;top:0;width:800px;height:600px;border:0';
        f.onload = () => { try { f.contentWindow?.focus(); f.contentWindow?.print(); } catch { p.toast('Printing is not available here.'); } window.setTimeout(() => f.remove(), 60000); };
        f.srcdoc = docPage(d.title, d.text); document.body.appendChild(f);
      } else { const e = exportOf(d); downloadText(e.name, e.text, e.type); }
    } catch { p.toast('That file could not be made. Try another way to save it.'); }
  };
  const copy = async () => { if (!active) return; const t = active.kind === 'doc' ? docText(textOf(active)) : textOf(active); p.toast((await copyText(t)) ? 'Copied.' : 'Could not copy.'); };

  // what "Ask Coe" can do for this kind of page; if some words are selected it works on those
  const asks = useMemo((): { n: string; t: string }[] => {
    if (!active) return [];
    const ti = active.title, about = sel ? `the part I selected in “${ti}”: “${sel.length > 300 ? sel.slice(0, 300) + '…' : sel}”` : `“${ti}”`;
    if (active.kind === 'doc') return [
      { n: 'Fix spelling and grammar', t: `Fix the spelling and grammar in ${about}. Change only what is wrong, in the editor.` },
      { n: 'Make it shorter', t: `Make ${about} shorter and clearer. Do it in the editor.` },
      { n: 'Make it simpler', t: `Rewrite ${about} in simpler words. Do it in the editor.` },
      { n: 'Carry on writing', t: `Carry on writing “${ti}” from where it stops. Add to it in the editor.` },
      { n: 'Mark it like a teacher', t: `Read ${about} like a teacher marking it. Say what is good, what to improve, and a rough grade. Do not change the text.` },
      { n: 'Add headings', t: `Add a good title and headings to “${ti}” in the editor.` },
    ];
    if (active.kind === 'code') return [
      { n: 'Explain it', t: `Explain ${about} step by step, simply, as if I am new to coding. Do not change it.` },
      { n: 'Find and fix mistakes', t: `Find the mistakes in ${about} and fix them in the editor. Tell me what was wrong.` },
      { n: 'Add comments', t: `Add short comments to ${about} so it is easy to follow. Do it in the editor.` },
      { n: 'Make it tidier', t: `Tidy ${about}: clearer names, less repeating, same result. Do it in the editor.` },
    ];
    if (active.kind === 'web') return [
      { n: 'Make it look better', t: `Make the page “${ti}” look better: spacing, colours and fonts. Edit it in the editor.` },
      { n: 'Make it work on a phone', t: `Make the page “${ti}” work well on a phone. Edit it in the editor, then take a screenshot to check.` },
      { n: 'Add something to it', t: `I want to add something to the page “${ti}”: ` },
      { n: 'Fix problems', t: `Check the page “${ti}” for mistakes and fix them in the editor.` },
    ];
    return [
      { n: 'Explain what it shows', t: `Look at the table “${ti}” and tell me what it shows, in a few short points.` },
      { n: 'Clean it up', t: `Tidy the table “${ti}”: fix the spacing and obvious mistakes. Do it in the editor.` },
      { n: 'Make a chart', t: `Make a chart from the table “${ti}”.` },
    ];
  }, [active, sel]);

  // drag the left edge to make the window wider or narrower
  const grip = useRef<{ x: number; w: number } | null>(null);
  const gripDown = (e: React.PointerEvent) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); grip.current = { x: e.clientX, w: p.width }; };
  const gripMove = (e: React.PointerEvent) => { if (grip.current) p.onSize(grip.current.w + (grip.current.x - e.clientX)); };
  const gripUp = () => { grip.current = null; };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if ((e.target as HTMLElement).closest('.ed-find')) return;   // a find box shuts itself first
    e.preventDefault(); close();
  };

  const style = over ? undefined : ({ width: p.width } as React.CSSProperties);
  const head = active && active.kind === 'doc' ? (
    <div className="ed-top">
      <input className="ed-h1" type="text" value={active.title} maxLength={80} placeholder="Untitled" aria-label="Title" onChange={(e) => patch(active, { title: e.target.value })} onBlur={() => { if (!active.title.trim()) patch(active, { title: KINDS[active.kind].name }); }} />
      <div className="ed-meta tx">
        <span className="ed-chip"><UiIcon name="calendar" size={13} />{dateOf(active.at)}</span>
        <span className="ed-chip">{active.by === 'coe' ? 'Written with Coe' : 'By you'}</span>
        <span className="ed-chip">{stats.w.toLocaleString()} {stats.w === 1 ? 'word' : 'words'}</span>
      </div>
    </div>
  ) : null;
  const c = ctl.current;

  return (
    <aside ref={root} className={`cx-ed${over ? ' over' : ''}`} style={style} role="dialog" aria-label="Editor" onKeyDown={onKey}>
      {!over && <div className="ed-grip" role="separator" aria-orientation="vertical" aria-label="Make the editor wider or narrower" tabIndex={0} title="Drag to resize"
        onPointerDown={gripDown} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={gripUp}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); p.onSize(p.width + 32); } else if (e.key === 'ArrowRight') { e.preventDefault(); p.onSize(p.width - 32); } else if (e.key === 'Home') { e.preventDefault(); p.onSize(0); } }} />}

      {loading && (
        <div className="ed-load" role="status" aria-live="polite">
          <CoeStar size={46} live mode="code" />
          <span className="ed-dots" aria-hidden><i /><i /><i /></span>
          <b className="d">Opening the editor</b>
        </div>
      )}

      <header className="ed-bar">
        <button type="button" className="ed-back" onClick={close} aria-label="Back to chat"><UiIcon name="back" size={22} strokeWidth={3} /><span className="d">Back to chat</span></button>
        <span className="cx-grow" />
        {active && (
          <>
            <Pop label="Ask Coe" icon="wand" text="Ask Coe" className="gold" align="right" wide>{(shut) => (<>
              {asks.map((a) => <MI key={a.n} onClick={() => { shut(); p.send(a.t); }}>{a.n}</MI>)}
              <Sep />
              <MI icon="chat" onClick={() => { shut(); p.compose(sel ? `About this part of “${active.title}”: “${sel.slice(0, 300)}” — ` : `About “${active.title}”: `); }}>Ask something else…</MI>
            </>)}</Pop>
            <Pop label="Save as" icon="download" text="Save" align="right" wide>{(shut) => (active.kind === 'doc' ? (<>
              <MI icon="file" hint="Opens in Word" onClick={() => { shut(); void save('docx'); }}>Word file (.docx)</MI>
              <MI icon="print" hint="Print, then choose Save as PDF" onClick={() => { shut(); void save('print'); }}>PDF</MI>
              <MI icon="globe" onClick={() => { shut(); void save('html'); }}>Web page (.html)</MI>
              <MI icon="text" onClick={() => { shut(); void save('txt'); }}>Plain text (.txt)</MI>
            </>) : <MI icon="download" onClick={() => { shut(); void save('file'); }}>{exportOf(active).name}</MI>)}</Pop>
            <Pop label="More" icon="more" align="right">{(shut) => (<>
              {c.undo && <MI icon="undo" onClick={() => { shut(); c.undo?.(); }}>Undo</MI>}
              {c.redo && <MI icon="redo" onClick={() => { shut(); c.redo?.(); }}>Redo</MI>}
              {c.find && <MI icon="search" onClick={() => { shut(); c.find?.(); }}>Find and replace</MI>}
              {c.goto && <MI icon="arrow" onClick={() => { shut(); c.goto?.(); }}>Go to a line</MI>}
              {c.comment && <MI icon="code" onClick={() => { shut(); c.comment?.(); }}>Comment or uncomment</MI>}
              {c.smaller && <MI onClick={() => c.smaller?.()}>Smaller text</MI>}
              {c.bigger && <MI onClick={() => c.bigger?.()}>Bigger text</MI>}
              {c.again && <MI icon="refresh" onClick={() => { shut(); c.again?.(); }}>Run the page again</MI>}
              {c.picture && <MI icon="camera" onClick={() => { shut(); c.picture?.(); }}>Save a picture of the page</MI>}
              {c.openTab && <MI icon="link" onClick={() => { shut(); c.openTab?.(); }}>Open in a new tab</MI>}
              <MI icon="copy" onClick={() => { shut(); void copy(); }}>Copy all</MI>
              <Sep />
              <MI icon="trash" danger onClick={() => { shut(); setConfirm(true); }}>Delete…</MI>
            </>)}</Pop>
          </>
        )}
      </header>

      {active && (
        <div className="ed-strip">
          <Pop label="Open documents" icon={KINDS[active.kind].icon} text={active.title || KINDS[active.kind].name} className="ed-docbtn" wide>{(shut) => (<>
            <label className="ed-name"><span className="tx">Name</span>
              <input className="cx-in" type="text" value={active.title} maxLength={80} aria-label="Name" onChange={(e) => patch(active, { title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); shut(); } }} /></label>
            {docs.length > 1 && <Sep />}
            {docs.map((d) => <MI key={d.id} icon={KINDS[d.kind].icon} on={d.id === id} onClick={() => { shut(); pick(d.id); }}>{d.title || KINDS[d.kind].name}</MI>)}
          </>)}</Pop>
          {active.kind === 'code' && (
            <select className="ed-sel" aria-label="Language" value={active.lang ?? 'code'} onChange={(e) => patch(active, { lang: e.target.value })}>{Object.entries(LANG_NAME).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          )}
          {active.kind === 'web' && <Seg label="What to show" value={view as 'preview' | 'code' | 'both'} onChange={setView} items={[{ v: 'preview', n: 'Page' }, { v: 'code', n: 'Code' }, { v: 'both', n: 'Both' }]} />}
          {active.kind === 'data' && <Seg label="What to show" value={view as 'table' | 'text'} onChange={setView} items={[{ v: 'table', n: 'Table' }, { v: 'text', n: 'Text' }]} />}
          <span className="ed-tools" ref={setSlot} />
          <span className="cx-grow" />
          <span className={`ed-saved tx${saving ? ' on' : ''}`} aria-live="polite">{saving ? 'Saving…' : 'Saved'}</span>
        </div>
      )}

      {confirm && active && (
        <div className="ed-note warn" role="alertdialog" aria-label="Delete this document?">
          <span className="tx">Delete “{active.title}”? This cannot be undone.</span><span className="cx-grow" />
          <button type="button" className="ed-tb lbl danger" onClick={() => remove(active)}>Delete</button>
          <button type="button" className="ed-tb lbl" onClick={() => setConfirm(false)} autoFocus>Keep it</button>
        </div>
      )}
      {active && active.by === 'coe' && active.prev !== undefined && !confirm && (
        <div className="ed-note" role="status">
          <UiIcon name="wand" size={15} /><span className="tx">Coe changed this.</span><span className="cx-grow" />
          <button type="button" className="ed-tb lbl" onClick={() => undoCoe(active)}><UiIcon name="undo" size={14} />Undo Coe’s change</button>
          <button type="button" className="ed-tb lbl" onClick={() => patch(active, { prev: undefined })}>Keep it</button>
        </div>
      )}

      <div className="ed-body">
        {active?.kind === 'doc' && <DocEditor key={`${active.id}:${active.rev}`} initial={active.text} title={active.title} api={api} slot={slot} ctl={ctl} head={head} onText={(h) => push(active, h)} onStats={(w, ch) => setStats({ w, c: ch })} onSel={setSel} />}
        {active?.kind === 'code' && <div className="ed-pane"><CodeArea key={`${active.id}:${active.rev}`} initial={active.text} lang={active.lang ?? 'code'} label={`${active.title}, code`} api={api} slot={slot} ctl={ctl} fileName={exportOf(active).name} onSel={setSel} onText={(t) => push(active, t)} /></div>}
        {active?.kind === 'web' && (
          <div className="ed-pane"><div className={`ed-split${view === 'both' ? ' both' : ''}`}>
            {view !== 'preview' && <div className="ed-half"><CodeArea key={`${active.id}:${active.rev}`} initial={active.text} lang="html" label={`${active.title}, page code`} api={api} ctl={ctl} fileName={exportOf(active).name} runnable={false} onSel={setSel} onText={(t) => push(active, t)} /></div>}
            {view !== 'code' && <div className="ed-half"><WebPreview html={textOf(active)} title={active.title} api={api} ctl={ctl} /></div>}
          </div></div>
        )}
        {active?.kind === 'data' && (
          <div className="ed-pane"><div className="ed-split">
            {view === 'text' ? <div className="ed-half"><CodeArea key={`${active.id}:${active.rev}`} initial={active.text} lang={/^\s*[[{]/.test(active.text) ? 'json' : 'code'} label={`${active.title}, table text`} api={api} ctl={ctl} fileName={exportOf(active).name} runnable={false} onSel={setSel} onText={(t) => push(active, t)} /></div>
              : <div className="ed-half"><DataView text={textOf(active)} /></div>}
          </div></div>
        )}
      </div>
    </aside>
  );
}
