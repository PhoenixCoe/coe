'use client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { copyText } from '@/lib/copy';
import { FILE_EXT, LANG_NAME, lineDiff, type CodeItem, type Row } from '@/lib/coe/codesplit';
import type { Finding, Lang } from '@/check/types';
import { highlight } from './hl';

const CAP = 4000;
const CHECKED = new Set(['javascript', 'typescript', 'json', 'html', 'css', 'python', 'sql']);
const WRAP = 'coe:cp-wrap';
const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const Line = memo(function Line({ ri, k, n, html, sel, mark, tip, onN }: { ri: number; k: Row['k']; n?: number; html: string; sel: boolean; mark?: string; tip?: string; onN: (n: number, shift: boolean) => void }) {
  return (
    <div className={`cp-l ${k}${sel ? ' sel' : ''}${mark ? ` ${mark}` : ''}`} data-r={ri} title={tip}>
      {n != null
        ? <button type="button" tabIndex={-1} className="cp-n" aria-label={`Line ${n}`} aria-pressed={sel} onClick={(e) => onN(n, e.shiftKey)}>{n}</button>
        : <span className="cp-n" aria-hidden />}
      <span className="cp-m" aria-hidden>{k === 'add' ? '+' : k === 'del' ? '−' : ''}</span>
      <code className="cp-c" dangerouslySetInnerHTML={{ __html: html || '&#8203;' }} />
    </div>
  );
});

/** The code, beside the chat: line numbers, colours, what changed, problems found on this device, and a way to ask about any lines. */
export function CodePane({ items, sel, changes, narrow, frac, onSel, onChanges, onClose, onSize, onCompose, onAsk, onCheck, say }: {
  items: CodeItem[]; sel: string; changes: boolean; narrow: boolean; frac: number;
  onSel: (id: string) => void; onChanges: (on: boolean) => void; onClose: () => void; onSize: (f: number | null) => void;
  onCompose: (t: string) => void; onAsk: (t: string) => void; onCheck: (code: string) => void; say: (t: string) => void;
}) {
  const item = items.find((i) => i.id === sel) ?? items[items.length - 1];
  const base = item?.from === 'coe' ? items.find((i) => i.id === item.base) : undefined;
  const root = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null);
  const [wrap, setWrap] = useState(() => { try { return localStorage.getItem(WRAP) === '1'; } catch { return false; } });
  const [range, setRange] = useState<[number, number] | null>(null);
  const [pi, setPi] = useState(-1);
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem('coe:cp-hint') === '1'; } catch { return false; } });
  const [ci, setCi] = useState(-1);
  const [found, setFound] = useState<{ id: string; list: Finding[]; done: boolean } | null>(null);
  useEffect(() => { setRange(null); setPi(-1); setCi(-1); }, [item?.id, changes]);
  useEffect(() => { try { localStorage.setItem(WRAP, wrap ? '1' : '0'); } catch { /* not saved */ } }, [wrap]);

  // Problems are looked for here, on this device, as soon as the code shows. Nothing is sent anywhere.
  useEffect(() => {
    if (!item) return;
    if (!CHECKED.has(item.lang) || item.code.length > 150000) { setFound({ id: item.id, list: [], done: false }); return; }
    let dead = false;
    const t = window.setTimeout(async () => {
      try { const m = await import('@/check'); const list = await m.check(item.code, item.lang as Lang); if (!dead) setFound({ id: item.id, list, done: true }); }
      catch { if (!dead) setFound({ id: item.id, list: [], done: false }); }
    }, 250);
    return () => { dead = true; window.clearTimeout(t); };
  }, [item?.id, item?.code, item?.lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  const diff = useMemo(() => (item && base && changes ? lineDiff(base.code, item.code) : null), [item, base, changes]);
  const rows: Row[] = useMemo(() => diff ?? (item ? item.code.split('\n').map((_, b): Row => ({ k: 'same', b })) : []), [diff, item]);
  const hlNew = useMemo(() => (item ? highlight(item.code, item.lang) : []), [item]);
  const hlOld = useMemo(() => (diff && base ? highlight(base.code, base.lang) : []), [diff, base]);
  const add = rows.filter((r) => r.k === 'add').length, del = rows.filter((r) => r.k === 'del').length;
  const groups = useMemo(() => rows.flatMap((r, i) => (r.k !== 'same' && (i === 0 || rows[i - 1].k === 'same') ? [i] : [])), [rows]);
  const problems = useMemo(() => (found && found.id === item?.id ? found.list.filter((f) => f.severity !== 'tip').sort((a, b) => a.line - b.line) : []), [found, item?.id]);
  const byLine = useMemo(() => { const m = new Map<number, Finding>(); problems.forEach((p) => { if (!m.has(p.line)) m.set(p.line, p); }); return m; }, [problems]);
  const checked = !!found && found.id === item?.id && found.done;

  if (!item) return null;
  const nLines = item.code.split('\n').length;
  const nameOf = (i: CodeItem) => { const same = items.filter((x) => x.from === i.from); return `${i.from === 'you' ? 'Your code' : "Coe's code"}${same.length > 1 ? ` ${same.indexOf(i) + 1}` : ''}`; };
  const label = (i: CodeItem) => `${nameOf(i)} · ${i.file ?? LANG_NAME[i.lang] ?? 'Code'}`;

  const scrollTo = (ri: number) => { const el = body.current?.querySelector<HTMLElement>(`[data-r="${ri}"]`); el?.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' }); };
  const goProblem = (i: number) => {
    if (!problems.length) return;
    const k = (i + problems.length) % problems.length; setPi(k); setRange(null);
    const ri = rows.findIndex((r) => r.b === problems[k].line - 1); if (ri >= 0) scrollTo(ri);
  };
  const goChange = (d: number) => { if (!groups.length) return; const k = ((ci < 0 ? (d > 0 ? -1 : 0) : ci) + d + groups.length) % groups.length; setCi(k); scrollTo(groups[k]); };
  const pick = (n: number, shift: boolean) => { setPi(-1); if (!seen) { setSeen(true); try { localStorage.setItem('coe:cp-hint', '1'); } catch { /* not saved */ } } setRange((r) => (shift && r ? [Math.min(r[0], n), Math.max(r[1], n)] : r && r[0] === n && r[1] === n ? null : [n, n])); };
  const where = range ? (range[0] === range[1] ? `line ${range[0]}` : `lines ${range[0]}–${range[1]}`) : '';
  const lines = item.code.split('\n');
  const download = () => {
    const name = item.file ?? `code.${FILE_EXT[item.lang] ?? 'txt'}`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([item.code], { type: 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = root.current?.parentElement?.getBoundingClientRect(); if (!box) return;
    e.preventDefault(); const t = e.currentTarget; t.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => onSize((ev.clientX - box.left) / box.width);
    const up = () => { t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); t.removeEventListener('pointercancel', up); };
    t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up);
  };
  const shown = rows.length > CAP ? rows.slice(0, CAP) : rows;
  const p = pi >= 0 ? problems[pi] : null;

  return (
    <aside ref={root} className={`cx-cp${narrow ? ' narrow' : ''}${wrap ? ' wrap' : ''}`} aria-label="Code">
      <header className="cp-h">
        {narrow && <button type="button" className="cp-back" onClick={onClose}><UiIcon name="left" size={18} />Chat</button>}
        <label className="cp-pick">
          <UiIcon name="code" size={18} />
          <select value={item.id} aria-label="Which code" onChange={(e) => onSel(e.target.value)}>
            {items.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}
          </select>
          <UiIcon name="down" size={14} />
        </label>
        <div className="cp-tools">
          <button type="button" className={`cp-t txt${wrap ? ' on' : ''}`} aria-pressed={wrap} title="Wrap long lines" onClick={() => setWrap((w) => !w)}>Wrap</button>
          <button type="button" className="cp-t" title="Copy all the code" aria-label="Copy all the code" onClick={async () => say((await copyText(item.code)) ? 'Code copied.' : 'Could not copy.')}><UiIcon name="copy" size={18} /></button>
          <button type="button" className="cp-t" title="Save as a file" aria-label="Save as a file" onClick={download}><UiIcon name="download" size={18} /></button>
          {!narrow && <button type="button" className="cp-t" title="Hide the code" aria-label="Hide the code" onClick={onClose}><UiIcon name="close" size={18} /></button>}
        </div>
      </header>

      {(base || checked || problems.length > 0) && (
        <div className="cp-sub">
          {base && diff && (
            <div className="cp-seg" role="group" aria-label="What to show">
              <button type="button" aria-pressed={!changes} onClick={() => onChanges(false)}>Code</button>
              <button type="button" aria-pressed={changes} onClick={() => onChanges(true)}>Changes{(add || del) ? <i>+{add} −{del}</i> : null}</button>
            </div>
          )}
          {changes && diff && groups.length > 0 && (
            <div className="cp-nav" role="group" aria-label="Go through the changes">
              <button type="button" className="cp-t sm" aria-label="Previous change" title="Previous change" onClick={() => goChange(-1)}><UiIcon name="up" size={16} /></button>
              <span className="tx">{ci >= 0 ? `${ci + 1} of ${groups.length}` : `${groups.length} ${groups.length === 1 ? 'change' : 'changes'}`}</span>
              <button type="button" className="cp-t sm" aria-label="Next change" title="Next change" onClick={() => goChange(1)}><UiIcon name="down" size={16} /></button>
            </div>
          )}
          {changes && !diff && base && <span className="cp-chip tx">Too long to compare</span>}
          {problems.length > 0
            ? <button type="button" className="cp-chip bad" title="Found on this device. Nothing was sent anywhere." onClick={() => goProblem(pi + 1)}><UiIcon name="alert" size={15} />{problems.length} {problems.length === 1 ? 'problem' : 'problems'}<UiIcon name="down" size={13} /></button>
            : checked ? <span className="cp-chip ok" title="Checked on this device. Nothing was sent anywhere."><UiIcon name="check" size={15} />No typing mistakes</span> : null}
          <button type="button" className="cp-chip" title="Open the full Code check" onClick={() => onCheck(item.code)}>Code check<UiIcon name="right" size={13} /></button>
        </div>
      )}

      <div className="cp-body" ref={body} key={`${item.id}${diff ? 'd' : ''}`} role="region" aria-label={label(item)} tabIndex={0}>
        {shown.map((r, ri) => {
          const n = r.k === 'del' ? undefined : (r.b ?? 0) + 1;
          const html = r.k === 'del' ? hlOld[r.a ?? 0] : hlNew[r.b ?? 0];
          const f = n != null ? byLine.get(n) : undefined;
          return <Line key={ri} ri={ri} k={r.k} n={n} html={html} sel={!!range && n != null && n >= range[0] && n <= range[1]} mark={f ? (f.severity === 'error' ? 'err' : 'warn') : (p && n === p.line ? 'cur' : undefined)} tip={f?.title} onN={pick} />;
        })}
        {rows.length > CAP && <p className="cp-more tx">Showing the first {CAP.toLocaleString()} lines. Copy or save the file to get all {nLines.toLocaleString()}.</p>}
      </div>

      {range ? (
        <div className="cp-bar" role="toolbar" aria-label="Chosen lines">
          <b className="d">{where.charAt(0).toUpperCase() + where.slice(1)}</b>
          <button type="button" className="cp-bb" onClick={() => { onCompose(`About ${where}${item.from === 'coe' ? " of Coe's code" : ''}: `); setRange(null); }}><UiIcon name="chat" size={16} />Ask Coe</button>
          <button type="button" className="cp-t" title="Copy these lines" aria-label="Copy these lines" onClick={async () => say((await copyText(lines.slice(range[0] - 1, range[1]).join('\n'))) ? 'Copied.' : 'Could not copy.')}><UiIcon name="copy" size={17} /></button>
          <button type="button" className="cp-t" title="Clear" aria-label="Clear the choice" onClick={() => setRange(null)}><UiIcon name="close" size={17} /></button>
        </div>
      ) : p ? (
        <div className={`cp-bar prob ${p.severity}`} role="status">
          <span className="cp-pt"><b className="d">Line {p.line}</b><span className="tx">{p.title}{p.idea ? `. ${p.idea}` : ''}</span></span>
          <button type="button" className="cp-bb" onClick={() => { onAsk(`Fix line ${p.line}: ${p.title}${p.idea ? `. ${p.idea}` : ''}`); setPi(-1); }}><UiIcon name="wand" size={16} />Fix it</button>
          {problems.length > 1 && <button type="button" className="cp-t" title="Next problem" aria-label="Next problem" onClick={() => goProblem(pi + 1)}><UiIcon name="down" size={17} /></button>}
          <button type="button" className="cp-t" title="Close" aria-label="Close" onClick={() => setPi(-1)}><UiIcon name="close" size={17} /></button>
        </div>
      ) : (!seen && !changes && nLines > 1 && <p className="cp-hint tx">Tap a line number to ask Coe about it.</p>)}

      {!narrow && (
        <div className="cp-grip" role="separator" aria-orientation="vertical" aria-label="Make the code wider or narrower" aria-valuemin={25} aria-valuemax={65} aria-valuenow={Math.round(frac * 100)} tabIndex={0}
          title="Drag to resize. Double-click to reset." onPointerDown={drag} onDoubleClick={() => onSize(null)}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); onSize(frac - 0.03); } else if (e.key === 'ArrowRight') { e.preventDefault(); onSize(frac + 0.03); } else if (e.key === 'Home' || e.key === 'Escape') { onSize(null); } }} />
      )}
    </aside>
  );
}
