'use client';
/** Ctrl+K (or Cmd+K): type to find anything Coe can do, and do it. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';

export interface Cmd { id: string; title: string; group: string; hint?: string; on?: boolean; run: () => void }

export function Palette({ cmds, onClose }: { cmds: Cmd[]; onClose: () => void }) {
  const [q, setQ] = useState(''), [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return cmds.filter((c) => words.every((w) => (c.title + ' ' + c.group + ' ' + (c.hint ?? '')).toLowerCase().includes(w))).slice(0, 60);
  }, [cmds, q]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [at]);
  const go = (c?: Cmd) => { if (!c) return; onClose(); window.setTimeout(c.run, 0); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(shown[at]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  let last = '';
  return (
    <div className="cx-pal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cx-pal" role="dialog" aria-label="Commands" onKeyDown={onKey}>
        <div className="cx-pal-in"><UiIcon name="command" size={18} /><input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Do anything: voice, quiz, export, switch style…" aria-label="Search commands" role="combobox" aria-expanded aria-controls="cx-pal-list" /><kbd>Esc</kbd></div>
        <ul id="cx-pal-list" ref={list} role="listbox">
          {shown.map((c, i) => {
            const head = c.group !== last ? c.group : ''; last = c.group;
            return (
              <li key={c.id} role="presentation">
                {head && <div className="cx-pal-g d">{head}</div>}
                <button type="button" role="option" aria-selected={i === at} className={i === at ? 'on' : ''} onMouseMove={() => setAt(i)} onClick={() => go(c)}><span>{c.title}</span>{c.on && <UiIcon name="check" size={14} />}{c.hint && <i className="tx">{c.hint}</i>}</button>
              </li>
            );
          })}
          {!shown.length && <li className="tx cx-pal-none">Nothing matches. Try a shorter word.</li>}
        </ul>
      </div>
    </div>
  );
}
