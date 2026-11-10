'use client';
/**
 * The code half of the editor: a text box with colours, line numbers, Tab to indent, brackets that close themselves, find and replace,
 * go to line, problems marked on the left as you type (checked on this device), and Run for JavaScript. Also the live page preview and the table view.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UiIcon } from '@/ui/icons';
import { highlight } from './hl';
import { DataBlock } from './DataTable';
import { runJs, type RunResult } from '@/lib/coe/sandbox';
import { shootHtml, withHelper } from '@/lib/coe/shot';
import { LANG_NAME } from '@/lib/coe/codesplit';
import { downloadBlob } from '@/ui/copy';
import type { Finding, Lang } from '@/check/types';
import { useCtl, type Ctl } from './EdUi';

const CHECKED = new Set(['javascript', 'typescript', 'json', 'html', 'css', 'python', 'sql']);
const BIG = 250000;
const FS = 'coe:ed-fs';
const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const FOUR = new Set(['python', 'java', 'c', 'cpp', 'csharp', 'rust', 'kotlin', 'swift', 'php', 'ruby']);
const HASH = new Set(['python', 'bash', 'ruby', 'yaml']);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Puts text in at the cursor the way typing does, so Undo still works. */
function put(ta: HTMLTextAreaElement, text: string) {
  ta.focus();
  let ok = false; try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
  if (!ok) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
}

export interface CodeApi { send: (t: string) => void; toast: (t: string) => void }

export const CodeArea = memo(function CodeArea({ initial, lang, onText, label, api, fileName, readOnly, onProblems, runnable = true, slot, ctl, onSel }: {
  initial: string; lang: string; onText: (t: string) => void; label: string; api: CodeApi; fileName: string; readOnly?: boolean; onProblems?: (n: number) => void; runnable?: boolean;
  slot?: HTMLElement | null; ctl?: React.MutableRefObject<Ctl>; onSel?: (t: string) => void;
}) {
  const [text, setText] = useState(initial);
  const [fs, setFs] = useState(() => { try { const v = Number(localStorage.getItem(FS)); return v >= 11 && v <= 20 ? v : 13; } catch { return 13; } });
  const [cur, setCur] = useState(1);
  const [find, setFind] = useState<null | 'find' | 'goto'>(null);
  const [fq, setFq] = useState(''), [rq, setRq] = useState(''), [cs, setCs] = useState(false), [gl, setGl] = useState('');
  const [probs, setProbs] = useState<Finding[]>([]), [showP, setShowP] = useState(false), [checked, setChecked] = useState(false);
  const [out, setOut] = useState<(RunResult & { ms: number }) | null>(null), [running, setRunning] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null), inner = useRef<HTMLDivElement>(null), gut = useRef<HTMLDivElement>(null), fi = useRef<HTMLInputElement>(null), gi = useRef<HTMLInputElement>(null);
  const lh = Math.round(fs * 1.65), unit = FOUR.has(lang) ? '    ' : '  ';
  const lines = useMemo(() => text.split('\n').length, [text]);
  const html = useMemo(() => (text.length > BIG ? esc(text) + '\n' : highlight(text, lang).join('\n') + '\n'), [text, lang]);

  const change = useCallback((v: string) => { setText(v); onText(v); }, [onText]);
  const sync = () => { const t = ta.current; if (!t) return; const tr = `translate(${-t.scrollLeft}px, ${-t.scrollTop}px)`; if (inner.current) inner.current.style.transform = tr; if (gut.current) gut.current.style.transform = `translateY(${-t.scrollTop}px)`; };
  const where = () => { const t = ta.current; if (!t) return; setCur(t.value.slice(0, t.selectionStart).split('\n').length); onSel?.(t.value.slice(t.selectionStart, t.selectionEnd).slice(0, 600)); };
  useEffect(sync, [text, fs]);
  useEffect(() => { try { localStorage.setItem(FS, String(fs)); } catch { /* not saved */ } }, [fs]);

  // problems, found here on this device a moment after you stop typing
  useEffect(() => {
    if (!CHECKED.has(lang) || text.length > 150000) { setProbs([]); setChecked(false); onProblems?.(0); return; }
    let dead = false;
    const t = window.setTimeout(async () => {
      try { const m = await import('@/check'); const list = (await m.check(text, lang as Lang)).filter((f) => f.severity !== 'tip').sort((a, b) => a.line - b.line); if (!dead) { setProbs(list); setChecked(true); onProblems?.(list.length); } }
      catch { if (!dead) { setProbs([]); setChecked(false); } }
    }, 700);
    return () => { dead = true; window.clearTimeout(t); };
  }, [text, lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  const goLine = useCallback((n: number, select = true) => {
    const t = ta.current; if (!t) return;
    const all = t.value.split('\n'), line = Math.max(1, Math.min(all.length, n));
    let pos = 0; for (let i = 0; i < line - 1; i++) pos += all[i].length + 1;
    t.focus(); if (select) t.setSelectionRange(pos, pos + all[line - 1].length); else t.setSelectionRange(pos, pos);
    t.scrollTop = Math.max(0, (line - 1) * lh - t.clientHeight / 3); sync(); setCur(line);
  }, [lh]);   // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    if (!fq) return [] as number[];
    const hay = cs ? text : text.toLowerCase(), nd = cs ? fq : fq.toLowerCase(), out: number[] = [];
    for (let i = hay.indexOf(nd); i >= 0 && out.length < 5000; i = hay.indexOf(nd, i + Math.max(1, nd.length))) out.push(i);
    return out;
  }, [text, fq, cs]);
  const jump = (dir: 1 | -1) => {
    const t = ta.current; if (!t || !matches.length) return;
    const at = dir === 1 ? t.selectionEnd : t.selectionStart - 1;
    let m = dir === 1 ? matches.find((x) => x >= at) : [...matches].reverse().find((x) => x <= at);
    if (m === undefined) m = dir === 1 ? matches[0] : matches[matches.length - 1];
    const line = t.value.slice(0, m).split('\n').length; t.focus(); t.setSelectionRange(m, m + fq.length);
    t.scrollTop = Math.max(0, (line - 1) * lh - t.clientHeight / 3); sync(); setCur(line);
  };
  const replaceOne = () => {
    const t = ta.current; if (!t || !fq) return;
    const sel = t.value.slice(t.selectionStart, t.selectionEnd);
    if ((cs ? sel === fq : sel.toLowerCase() === fq.toLowerCase())) { put(t, rq); }
    jump(1);
  };
  const replaceAll = () => {
    const t = ta.current; if (!t || !fq || !matches.length) return;
    let out = '', last = 0; for (const m of matches) { out += t.value.slice(last, m) + rq; last = m + fq.length; } out += t.value.slice(last);
    t.focus(); t.setSelectionRange(0, t.value.length); put(t, out); api.toast(`Replaced ${matches.length}.`);
  };

  const indentBlock = (back: boolean) => {
    const t = ta.current!, v = t.value, s = t.selectionStart, e = t.selectionEnd;
    if (s === e && !back) { put(t, unit); return; }
    const ls = v.lastIndexOf('\n', s - 1) + 1; let le = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e); if (le < 0) le = v.length;
    const block = v.slice(ls, le).split('\n');
    const next = block.map((l) => (back ? (l.startsWith(unit) ? l.slice(unit.length) : l.startsWith('\t') ? l.slice(1) : l.replace(/^ {1,3}/, '')) : (l.trim() ? unit + l : l))).join('\n');
    if (next === v.slice(ls, le)) return;
    t.setSelectionRange(ls, le); put(t, next);
    const d0 = next.split('\n')[0].length - block[0].length;
    t.setSelectionRange(Math.max(ls, s + d0), ls + next.length);
  };
  const comment = () => {
    const t = ta.current!, v = t.value, s = t.selectionStart, e = t.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1; let le = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e); if (le < 0) le = v.length;
    const block = v.slice(ls, le).split('\n');
    const wrap = lang === 'html' ? ['<!-- ', ' -->'] : lang === 'css' ? ['/* ', ' */'] : null;
    const pre = HASH.has(lang) ? '# ' : lang === 'sql' || lang === 'lua' ? '-- ' : '// ';
    if (lang === 'json') return;
    const live = block.filter((l) => l.trim());
    const on = live.length > 0 && live.every((l) => (wrap ? l.trim().startsWith(wrap[0].trim()) && l.trim().endsWith(wrap[1].trim()) : l.trim().startsWith(pre.trim())));
    const next = block.map((l) => {
      if (!l.trim()) return l;
      const ind = /^\s*/.exec(l)![0], body = l.slice(ind.length);
      if (on) return ind + (wrap ? body.replace(wrap[0].trim(), '').replace(new RegExp(wrap[1].trim().replace(/[*/]/g, '\\$&') + '$'), '').trim() : body.replace(pre.trim(), '').replace(/^ /, ''));
      return ind + (wrap ? wrap[0] + body + wrap[1] : pre + body);
    }).join('\n');
    t.setSelectionRange(ls, le); put(t, next); t.setSelectionRange(ls, ls + next.length);
  };

  const key = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    const t = ev.currentTarget, v = t.value, s = t.selectionStart, e = t.selectionEnd, mod = ev.ctrlKey || ev.metaKey;
    if (ev.key === 'Tab' && !mod && !ev.altKey) { ev.preventDefault(); indentBlock(ev.shiftKey); return; }
    if (mod && ev.key === '/') { ev.preventDefault(); comment(); return; }
    if (mod && ev.key.toLowerCase() === 'f') { ev.preventDefault(); setFind('find'); window.setTimeout(() => { fi.current?.focus(); fi.current?.select(); }, 0); return; }
    if (mod && ev.key.toLowerCase() === 'g') { ev.preventDefault(); setFind('goto'); window.setTimeout(() => gi.current?.focus(), 0); return; }
    if (mod && ev.key === 'Enter' && lang === 'javascript') { ev.preventDefault(); void run(); return; }
    if (ev.key === 'Escape' && find) { setFind(null); return; }
    if (mod || ev.altKey) return;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      const ls = v.lastIndexOf('\n', s - 1) + 1, ind = /^[ \t]*/.exec(v.slice(ls, s))![0], before = v.slice(ls, s).trimEnd(), prev = v[s - 1], next = v[e];
      const opens = lang === 'python' ? /:$/.test(before) : /[{(\[]$/.test(before) || (lang === 'html' && /<(div|ul|ol|section|main|nav|header|footer|body|head|table|tr|form)[^>]*>$/i.test(before));
      if (prev && PAIRS[prev] && PAIRS[prev] === next && '([{'.includes(prev)) { put(t, '\n' + ind + unit + '\n' + ind); const p = s + 1 + ind.length + unit.length; t.setSelectionRange(p, p); }
      else put(t, '\n' + ind + (opens ? unit : ''));
      return;
    }
    if (ev.key === 'Backspace' && s === e && s > 0 && PAIRS[v[s - 1]] && PAIRS[v[s - 1]] === v[s]) { ev.preventDefault(); t.setSelectionRange(s - 1, s + 1); put(t, ''); return; }
    if (ev.key.length === 1 && lang !== 'code') {
      const close = PAIRS[ev.key];
      if (close && s !== e) { ev.preventDefault(); const sel = v.slice(s, e); put(t, ev.key + sel + close); t.setSelectionRange(s + 1, s + 1 + sel.length); return; }
      if (close && s === e) {
        const quote = ev.key === close, prevCh = v[s - 1] ?? '', nextCh = v[s] ?? '';
        if (quote && (/\w/.test(prevCh) || nextCh === ev.key)) { if (nextCh === ev.key) { ev.preventDefault(); t.setSelectionRange(s + 1, s + 1); } return; }
        if (/^[\s)\]}.,;:]?$/.test(nextCh)) { ev.preventDefault(); put(t, ev.key + close); t.setSelectionRange(s + 1, s + 1); return; }
      }
      if (')]}'.includes(ev.key) && s === e && v[s] === ev.key) { ev.preventDefault(); t.setSelectionRange(s + 1, s + 1); return; }
    }
  };

  const run = useCallback(async () => {
    const t = ta.current; const code = t?.value ?? text; if (running) return;
    setRunning(true); setOut(null); const t0 = performance.now();
    const r = await runJs(code, 10000); setOut({ ...r, ms: Math.round(performance.now() - t0) }); setRunning(false);
  }, [running, text]);

  // the bar at the top reaches these
  useCtl(ctl, {
    find: () => { setFind('find'); window.setTimeout(() => { fi.current?.focus(); fi.current?.select(); }, 0); },
    goto: () => { setFind('goto'); window.setTimeout(() => gi.current?.focus(), 0); },
    comment: () => { if (!readOnly && lang !== 'json') comment(); else api.toast('Comments are not used in this kind of file.'); },
    bigger: () => setFs((n) => Math.min(20, n + 1)), smaller: () => setFs((n) => Math.max(11, n - 1)),
  });

  const probAt = useMemo(() => { const m = new Map<number, Finding>(); probs.forEach((p) => { if (!m.has(p.line)) m.set(p.line, p); }); return m; }, [probs]);
  const style = { '--fs': `${fs}px`, '--lh': `${lh}px` } as React.CSSProperties;
  const nd = String(lines).length;
  const name = LANG_NAME[lang] ?? 'Code';
  const err = probs.filter((p) => p.severity === 'error').length;

  return (
    <div className="ed-code" style={style}>
      {slot && createPortal(
        runnable && lang === 'javascript'
          ? <button type="button" className="ed-tb lbl run" onClick={() => void run()} disabled={running} title="Run the code (Ctrl+Enter)"><UiIcon name="play" size={14} /><span className="ed-lbl">{running ? 'Running' : 'Run'}</span></button>
          : <span className="ed-lang tx">{name}</span>, slot)}
      {find === 'find' && (
        <div className="ed-find" role="search">
          <input ref={fi} className="cx-in" type="text" value={fq} placeholder="Find" aria-label="Find" onChange={(e) => setFq(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); jump(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { setFind(null); ta.current?.focus(); } }} />
          <input className="cx-in" type="text" value={rq} placeholder="Replace with" aria-label="Replace with" onChange={(e) => setRq(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } else if (e.key === 'Escape') { setFind(null); ta.current?.focus(); } }} />
          <span className="ed-cnt tx">{fq ? `${matches.length} found` : ''}</span>
          <button type="button" className="ed-tb ic" onClick={() => jump(-1)} aria-label="Previous" title="Previous"><UiIcon name="up" size={14} /></button>
          <button type="button" className="ed-tb ic" onClick={() => jump(1)} aria-label="Next" title="Next"><UiIcon name="down" size={14} /></button>
          <button type="button" className="ed-tb lbl" aria-pressed={cs} onClick={() => setCs((v) => !v)} title="Match capital letters">Aa</button>
          <button type="button" className="ed-tb lbl" onClick={replaceOne} disabled={readOnly || !matches.length}>Replace</button>
          <button type="button" className="ed-tb lbl" onClick={replaceAll} disabled={readOnly || !matches.length}>All</button>
          <button type="button" className="ed-tb ic" onClick={() => { setFind(null); ta.current?.focus(); }} aria-label="Close find" title="Close"><UiIcon name="close" size={14} /></button>
        </div>
      )}
      {find === 'goto' && (
        <form className="ed-find" onSubmit={(e) => { e.preventDefault(); const n = parseInt(gl, 10); if (n > 0) { goLine(n); setFind(null); } }}>
          <input ref={gi} className="cx-in" type="number" min={1} max={lines} value={gl} placeholder={`Line 1 to ${lines}`} aria-label="Line number" onChange={(e) => setGl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setFind(null); ta.current?.focus(); } }} />
          <button type="submit" className="ed-tb lbl">Go</button>
          <button type="button" className="ed-tb ic" onClick={() => { setFind(null); ta.current?.focus(); }} aria-label="Close" title="Close"><UiIcon name="close" size={14} /></button>
        </form>
      )}
      <div className="ed-cbody">
        <div className="ed-gutw" style={{ width: `calc(${Math.max(2, nd)}ch + 22px)` }} aria-hidden>
          <div className="ed-gut" ref={gut}>
            <div className="ed-curg" style={{ top: 10 + (cur - 1) * lh, height: lh }} />
            <pre>{Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</pre>
            {Array.from(probAt.entries()).map(([ln, p]) => <b key={ln} className={`ed-mk ${p.severity}`} style={{ top: 10 + (ln - 1) * lh + lh / 2 - 4 }} title={p.title} />)}
          </div>
        </div>
        <div className="ed-cwrap">
          <div className="ed-lay" ref={inner} aria-hidden>
            <div className="ed-curl" style={{ top: 10 + (cur - 1) * lh, height: lh }} />
            <pre className="ed-hl"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
          </div>
          <textarea ref={ta} className="ed-ta" value={text} readOnly={readOnly} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" wrap="off" aria-label={label}
            onChange={(e) => change(e.target.value)} onScroll={sync} onKeyDown={key} onKeyUp={where} onClick={where} onSelect={where} onBlur={() => { /* the shell saves on blur */ }} />
        </div>
      </div>
      {(out || running) && (
        <div className="ed-out" role="region" aria-label="Output">
          <div className="ed-out-h"><b className="d">Output</b><span className="tx">{running ? 'Running…' : out ? `${out.ms} ms` : ''}</span><span className="cx-grow" />
            {out && !out.ok && <button type="button" className="ed-tb lbl" onClick={() => api.send(`My code in the editor gives this error:\n${(out.error ?? '').slice(0, 400)}\nPlease find the problem and fix it in the editor.`)}><UiIcon name="wand" size={14} />Ask Coe to fix</button>}
            <button type="button" className="ed-tb ic" onClick={() => setOut(null)} aria-label="Close output" title="Close"><UiIcon name="close" size={14} /></button></div>
          <pre className={`ed-out-b${out && !out.ok ? ' bad' : ''}`}>{running ? '' : [out?.log, out?.value !== undefined ? `→ ${out.value}` : '', out?.error ? `Error: ${out.error}` : ''].filter(Boolean).join('\n') || 'It ran and printed nothing.'}</pre>
        </div>
      )}
      <div className="ed-cst tx" title={fileName}>
        <span>Line {cur} of {lines}</span>
        <span className="cx-grow" />
        {checked && <button type="button" className={`ed-pb${probs.length ? (err ? ' err' : ' warn') : ' ok'}`} onClick={() => probs.length && setShowP((v) => !v)} aria-expanded={showP} disabled={!probs.length}>{probs.length ? `${probs.length} ${probs.length === 1 ? 'problem' : 'problems'}` : 'No typing mistakes'}</button>}
      </div>
      {showP && probs.length > 0 && (
        <ul className="ed-probs" aria-label="Problems">
          {probs.slice(0, 40).map((p) => <li key={p.id}><button type="button" onClick={() => { goLine(p.line); setShowP(false); }}><i className={p.severity}>{p.severity === 'error' ? 'Error' : 'Check'}</i><span className="tx">Line {p.line}: {p.title}{p.why ? `. ${p.why}` : ''}</span></button></li>)}
        </ul>
      )}
    </div>
  );
});

// ---------------------------------------------------------------- a web page with a live preview
type Dev = 'phone' | 'tablet' | 'full';
const DEV: Record<Dev, { w: number; name: string }> = { phone: { w: 390, name: 'Phone' }, tablet: { w: 768, name: 'Tablet' }, full: { w: 0, name: 'Full' } };
export const WebPreview = memo(function WebPreview({ html, title, api, ctl }: { html: string; title: string; api: CodeApi; ctl?: React.MutableRefObject<Ctl> }) {
  const [dev, setDev] = useState<Dev>('full');
  const [src, setSrc] = useState(html), [n, setN] = useState(0), [box, setBox] = useState({ w: 0, h: 0 });
  const [err, setErr] = useState<{ msg: string; line: number } | null>(null), [shot, setShot] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), fr = useRef<HTMLIFrameElement>(null);
  useEffect(() => { const t = window.setTimeout(() => { setSrc(html); setErr(null); }, 450); return () => window.clearTimeout(t); }, [html]);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.source === fr.current?.contentWindow && e.data && e.data.coeLog === 1) setErr({ msg: String(e.data.msg).slice(0, 200), line: Number(e.data.line) || 0 }); };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }, []);
  const doc = useMemo(() => withHelper(src), [src]);
  const dw = DEV[dev].w, scale = dw ? Math.min(1, Math.max(0.3, (box.w - 24) / dw)) : 1;
  const fw = dw || box.w, fh = dw ? Math.max(200, (box.h - 24) / scale) : box.h;
  const take = async () => {
    setShot(true);
    try { const r = await shootHtml(src, { width: dw || 1024 }); const bin = atob(r.img.data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); downloadBlob(`${title.replace(/[^\w-]+/g, '-').slice(0, 40) || 'page'}.png`, new Blob([u], { type: 'image/png' })); }
    catch (e) { api.toast((e as Error).message); }
    setShot(false);
  };
  const openTab = () => { const url = URL.createObjectURL(new Blob([src], { type: 'text/html' })); window.open(url, '_blank', 'noopener'); window.setTimeout(() => URL.revokeObjectURL(url), 60000); };
  useCtl(ctl, { again: () => setN((v) => v + 1), picture: () => void take(), openTab });
  return (
    <div className="ed-prev">
      <div className="ed-devs" role="group" aria-label="Screen size">
        {(Object.keys(DEV) as Dev[]).map((k) => <button key={k} type="button" className="ed-tb ic" aria-pressed={dev === k} aria-label={DEV[k].name} title={DEV[k].name} onClick={() => setDev(k)}><UiIcon name={k === 'phone' ? 'mobile' : k === 'tablet' ? 'tablet' : 'screen'} size={15} /></button>)}
      </div>
      <div className="ed-stage" ref={wrap}>
        {box.w > 0 && (
          <div className="ed-dev" style={dw ? { width: dw * scale, height: fh * scale } : { width: '100%', height: '100%' }}>
            <iframe key={n} ref={fr} className="ed-frame" title={`Preview of ${title}`} sandbox="allow-scripts allow-forms allow-modals allow-popups" referrerPolicy="no-referrer" srcDoc={doc}
              style={dw ? { width: dw, height: fh, transform: `scale(${scale})` } : { width: '100%', height: '100%' }} />
          </div>
        )}
      </div>
      {err && <div className="ed-err" role="alert"><UiIcon name="alert" size={15} /><span className="tx">{err.line ? `Line ${err.line}: ` : ''}{err.msg}</span><span className="cx-grow" /><button type="button" className="ed-tb lbl" onClick={() => api.send(`My web page in the editor has this error${err.line ? ` on line ${err.line}` : ''}: ${err.msg}\nFind the problem and fix it in the editor.`)}><UiIcon name="wand" size={14} />Fix it</button></div>}
    </div>
  );
});

// ---------------------------------------------------------------- a table
export const DataView = memo(function DataView({ text }: { text: string }) {
  return <div className="ed-data">{text.trim() ? <DataBlock code={text} closed /> : <p className="tx ed-empty">Type or paste rows in the Text view. The first row is the headings.</p>}</div>;
});
