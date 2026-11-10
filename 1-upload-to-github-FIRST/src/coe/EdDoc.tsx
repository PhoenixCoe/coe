'use client';
/**
 * The Word-style page. The page is all you see: a big title, then your writing. A few small buttons sit in the bar above it
 * (text style, bold, italic, bullets, table, and a "+" for the rest), and everything else is a keyboard shortcut or in a menu.
 * It saves as clean HTML and leaves as .docx, PDF (print), HTML or text.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UiIcon, type UiName } from '@/ui/icons';
import { cleanHtml, countWords, plainOf, replaceInDoc } from '@/lib/coe/editors';
import { MI, Pop, Sep, useCtl, type Ctl } from './EdUi';

const COLOURS = ['#171717', '#B03A2E', '#B85C1E', '#8A6D1F', '#337957', '#2B6CB0', '#7B4FA3', '#B83B6E'];
const cmd = (c: string, v?: string) => { try { document.execCommand(c, false, v); } catch { /* not supported */ } };
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safeUrl = (u: string): string | null => { const t = u.trim(); if (!t) return null; const w = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : /^(\/\/|#)/.test(t) ? t : 'https://' + t; return /^(https?:|mailto:)/i.test(w) ? w : null; };

interface Fmt { b: boolean; i: boolean; u: boolean; s: boolean; ul: boolean; ol: boolean; block: string }
const NONE: Fmt = { b: false, i: false, u: false, s: false, ul: false, ol: false, block: 'p' };

/** A button in the bar. Pressing it must not take the cursor out of the page, so mouse-down is stopped. */
function TB({ icon, label, on, onClick }: { icon: UiName; label: string; on?: boolean; onClick: () => void }) {
  return <button type="button" className="ed-tb ic" aria-pressed={on} aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}><UiIcon name={icon} size={16} /></button>;
}

export const DocEditor = memo(function DocEditor({ initial, onText, title, api, readOnly, onStats, onSel, slot, ctl, head }: {
  initial: string; onText: (html: string) => void; title: string; readOnly?: boolean; onStats?: (words: number, chars: number) => void; onSel?: (text: string) => void;
  api: { send: (t: string) => void; compose: (t: string) => void; toast: (t: string) => void };
  slot: HTMLElement | null; ctl: React.MutableRefObject<Ctl>; head?: React.ReactNode;
}) {
  const page = useRef<HTMLDivElement>(null);
  const [f, setF] = useState<Fmt>(NONE);
  const [bar, setBar] = useState<null | 'link' | 'find'>(null);
  const [url, setUrl] = useState(''), [fq, setFq] = useState(''), [rq, setRq] = useState(''), [cs, setCs] = useState(false);
  const saved = useRef<Range | null>(null);

  useLayoutEffect(() => { if (page.current) page.current.innerHTML = initial || '<p><br></p>'; }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { cmd('styleWithCSS', 'true'); cmd('defaultParagraphSeparator', 'p'); } catch { /* not supported */ } }, []);

  const stats = useCallback(() => { const t = plainOf(page.current?.innerHTML ?? ''); onStats?.(countWords(t), t.replace(/\s/g, '').length); }, [onStats]);
  useEffect(stats, [stats]);
  const emit = useCallback(() => { const el = page.current; if (!el) return; onText(el.innerHTML); stats(); }, [onText, stats]);

  // which buttons are lit follows the cursor; the selected words are what "Ask Coe" works on
  useEffect(() => {
    const on = () => {
      const el = page.current, s = window.getSelection(); if (!el || !s || !s.rangeCount || !el.contains(s.anchorNode)) return;
      saved.current = s.getRangeAt(0).cloneRange(); onSel?.(s.isCollapsed ? '' : s.toString().slice(0, 600));
      const q = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };
      let block = 'p', n: Node | null = s.anchorNode; while (n && n !== el) { if (n.nodeType === 1) { const t = (n as Element).tagName.toLowerCase(); if (/^h[1-3]$/.test(t) || t === 'blockquote') { block = t; break; } } n = n.parentNode; }
      setF({ b: q('bold'), i: q('italic'), u: q('underline'), s: q('strikeThrough'), ul: q('insertUnorderedList'), ol: q('insertOrderedList'), block });
    };
    document.addEventListener('selectionchange', on); return () => document.removeEventListener('selectionchange', on);
  }, [onSel]);

  const restore = () => { const r = saved.current, s = window.getSelection(); if (r && s && page.current && !page.current.contains(s.anchorNode)) { s.removeAllRanges(); s.addRange(r); } };
  const run = (c: string, v?: string) => { if (readOnly) return; page.current?.focus(); restore(); cmd(c, v); emit(); };
  const keep = (e: React.MouseEvent) => e.preventDefault();

  const paste = async (e: React.ClipboardEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const html = e.clipboardData.getData('text/html'), plain = e.clipboardData.getData('text/plain');
    let ins = '';
    if (html) { try { ins = await cleanHtml(html.replace(/<!--[\s\S]*?-->/g, '')); } catch { ins = ''; } }
    if (!ins.trim()) ins = plain.split(/\r?\n/).map((l) => (l.trim() ? `<p>${escHtml(l)}</p>` : '')).join('');
    if (ins.trim()) { restore(); cmd('insertHTML', ins); emit(); }
  };
  const insertTable = () => {
    const row = (t: string, x: string) => `<tr>${`<${t}>${x}</${t}>`.repeat(3)}</tr>`;
    run('insertHTML', `<table><tbody>${row('th', 'Heading')}${row('td', '&nbsp;')}${row('td', '&nbsp;')}</tbody></table><p><br></p>`);
  };
  const applyLink = () => {
    const u = safeUrl(url); if (!u) { api.toast('Type a web address that starts with http, https or mailto.'); return; }
    page.current?.focus(); restore();
    const s = window.getSelection(); if (s && s.isCollapsed) cmd('insertHTML', `<a href="${u.replace(/"/g, '&quot;')}">${escHtml(u)}</a>`); else cmd('createLink', u);
    setBar(null); setUrl(''); emit();
  };
  const replaceAll = () => {
    const el = page.current; if (!el || !fq) return;
    const r = replaceInDoc(el.innerHTML, fq, rq, true, cs);
    if ('error' in r) { api.toast(r.error); return; }
    el.innerHTML = r.html; emit(); api.toast(`Replaced ${r.n}.`);
  };
  const countFind = () => { const el = page.current; if (!el || !fq) return 0; const t = plainOf(el.innerHTML); return (t.match(new RegExp(fq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi')) ?? []).length; };

  // the bar at the top reaches these
  useCtl(ctl, { undo: () => run('undo'), redo: () => run('redo'), find: () => setBar('find'), clear: () => run('removeFormat') });

  const style = (v: string) => run('formatBlock', v === 'p' ? '<p>' : `<${v}>`);
  const tools = (
    <>
      <Pop icon="text" label="Text style" keep>{(close) => (<>
        <MI on={f.block === 'p'} onClick={() => { style('p'); close(); }}>Normal text</MI>
        <MI on={f.block === 'h1'} onClick={() => { style('h1'); close(); }}>Big heading</MI>
        <MI on={f.block === 'h2'} onClick={() => { style('h2'); close(); }}>Heading</MI>
        <MI on={f.block === 'h3'} onClick={() => { style('h3'); close(); }}>Small heading</MI>
        <MI on={f.block === 'blockquote'} onClick={() => { style(f.block === 'blockquote' ? 'p' : 'blockquote'); close(); }}>Quote</MI>
        <Sep />
        <MI icon="underline" on={f.u} onClick={() => { run('underline'); close(); }}>Underline</MI>
        <MI icon="strike" on={f.s} onClick={() => { run('strikeThrough'); close(); }}>Cross out</MI>
        <MI icon="highlight" onClick={() => { run('hiliteColor', '#F3E3A0'); close(); }}>Highlight</MI>
        <div className="ed-cols" role="group" aria-label="Text colour">
          {COLOURS.map((c) => <button key={c} type="button" className="ed-dot" style={{ background: c }} aria-label={`Colour ${c}`} onMouseDown={keep} onClick={() => { run('foreColor', c); close(); }} />)}
        </div>
        <MI icon="clear" onClick={() => { run('removeFormat'); close(); }}>Clear formatting</MI>
      </>)}</Pop>
      <TB icon="bold" label="Bold (Ctrl+B)" on={f.b} onClick={() => run('bold')} />
      <TB icon="italic" label="Italic (Ctrl+I)" on={f.i} onClick={() => run('italic')} />
      <TB icon="list" label="Bullet list" on={f.ul} onClick={() => run('insertUnorderedList')} />
      <TB icon="table" label="Add a table" onClick={insertTable} />
      <Pop icon="plus" label="Add something" keep>{(close) => (<>
        <MI icon="listnum" on={f.ol} onClick={() => { run('insertOrderedList'); close(); }}>Numbered list</MI>
        <MI icon="link" onClick={() => { close(); setBar('link'); }}>Link</MI>
        <MI icon="quote" onClick={() => { style('blockquote'); close(); }}>Quote</MI>
        <MI icon="alignl" onClick={() => { run('justifyLeft'); close(); }}>Line up left</MI>
        <MI icon="alignc" onClick={() => { run('justifyCenter'); close(); }}>Line up in the middle</MI>
        <MI icon="alignr" onClick={() => { run('justifyRight'); close(); }}>Line up right</MI>
        <MI onClick={() => { run('insertHorizontalRule'); close(); }}>Dividing line</MI>
      </>)}</Pop>
    </>
  );

  return (
    <div className="ed-doc">
      {slot && createPortal(tools, slot)}
      {bar === 'link' && (
        <form className="ed-find" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
          <input className="cx-in" type="text" autoFocus value={url} placeholder="https://…" aria-label="Web address" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setBar(null); } }} />
          <button type="submit" className="ed-tb lbl">Add link</button>
          <button type="button" className="ed-tb lbl" onClick={() => { page.current?.focus(); restore(); cmd('unlink'); setBar(null); emit(); }}>Remove link</button>
          <button type="button" className="ed-tb ic" onClick={() => setBar(null)} aria-label="Close"><UiIcon name="close" size={14} /></button>
        </form>
      )}
      {bar === 'find' && (
        <div className="ed-find" role="search">
          <input className="cx-in" type="text" autoFocus value={fq} placeholder="Find" aria-label="Find" onChange={(e) => setFq(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setBar(null); } }} />
          <input className="cx-in" type="text" value={rq} placeholder="Replace with" aria-label="Replace with" onChange={(e) => setRq(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setBar(null); } }} />
          <span className="ed-cnt tx">{fq ? `${countFind()} found` : ''}</span>
          <button type="button" className="ed-tb lbl" aria-pressed={cs} onClick={() => setCs((v) => !v)} title="Match capital letters">Aa</button>
          <button type="button" className="ed-tb lbl" disabled={readOnly || !fq} onClick={replaceAll}>Replace all</button>
          <button type="button" className="ed-tb ic" onClick={() => setBar(null)} aria-label="Close"><UiIcon name="close" size={14} /></button>
        </div>
      )}
      <div className="ed-pagew" onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); page.current?.focus(); } }}>
        <div className="ed-sheet">
          {head}
          <div ref={page} className="ed-page" contentEditable={!readOnly} suppressContentEditableWarning role="textbox" aria-multiline aria-label={`${title}, document`} spellCheck
            onInput={emit} onPaste={paste} onBlur={() => { const s = window.getSelection(); if (s && s.rangeCount && page.current?.contains(s.anchorNode)) saved.current = s.getRangeAt(0).cloneRange(); }}
            onDrop={(e) => { if (e.dataTransfer.files.length) e.preventDefault(); }}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBar('link'); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setBar('find'); } }} />
        </div>
      </div>
    </div>
  );
});
