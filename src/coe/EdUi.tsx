'use client';
/**
 * The small parts the editor is made from: a button that opens a short list, a row in that list, and the list of things the
 * page being edited can be told to do (undo, find, run, and so on) from the bar at the top.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { UiIcon, type UiName } from '@/ui/icons';

/** What the bar at the top can ask the page underneath to do. Each kind of page fills in the ones it has. */
export interface Ctl { undo?: () => void; redo?: () => void; find?: () => void; goto?: () => void; comment?: () => void; bigger?: () => void; smaller?: () => void; again?: () => void; picture?: () => void; openTab?: () => void; clear?: () => void }

/**
 * A button that opens a short list. Esc or a click anywhere else shuts it, the arrow keys move through it.
 * `keep` stops the button taking the cursor out of the page (for bold, headings and the like).
 */
export function Pop({ icon, text, label, keep, align = 'left', className = '', on, disabled, children, wide }: {
  icon?: UiName; text?: string; label: string; keep?: boolean; align?: 'left' | 'right'; className?: string; on?: boolean; disabled?: boolean; wide?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null), btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  // A list that would run off the side of the window (a narrow phone) slides back in, so the page never scrolls sideways
  useLayoutEffect(() => {
    const el = pop.current; if (!open || !el) { setDx(0); return; }
    const box = el.closest('.cx-ed')?.getBoundingClientRect(), lo = Math.max(0, box?.left ?? 0) + 8, hi = Math.min(window.innerWidth, box?.right ?? window.innerWidth) - 8, r = el.getBoundingClientRect();
    let d = 0; if (r.right > hi) d = hi - r.right; if (r.left + d < lo) d = lo - r.left; setDx(Math.round(d));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    // Esc shuts the list wherever the cursor is, and goes no further (so it does not also close the editor)
    const esc = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; e.preventDefault(); e.stopPropagation(); setOpen(false); if (root.current?.contains(document.activeElement)) btn.current?.focus({ preventScroll: true }); };
    document.addEventListener('pointerdown', down, true); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>('.ed-pop [role="menuitem"]:not(:disabled)') ?? []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus({ preventScroll: true }); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (!open) { if (e.target === btn.current) { e.preventDefault(); setOpen(true); window.setTimeout(() => items()[0]?.focus(), 0); } return; }
    const list = items(); if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.target instanceof HTMLInputElement) { if (e.key === 'ArrowDown') { e.preventDefault(); list[0].focus(); } return; }
    e.preventDefault(); list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus();
  };
  const close = () => setOpen(false);
  return (
    <span ref={root} className={`ed-pw${open ? ' open' : ''}`} onKeyDown={onKey}>
      <button ref={btn} type="button" className={`ed-tb ${text ? 'lbl' : 'ic'} ${className}`.trim()} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-pressed={on} disabled={disabled}
        onMouseDown={keep ? (e) => e.preventDefault() : undefined} onClick={() => setOpen((o) => !o)}>
        {icon && <UiIcon name={icon} size={16} />}{text && <span className="ed-lbl">{text}</span>}{text && <UiIcon name="down" size={12} />}
      </button>
      {open && <div ref={pop} style={dx ? { transform: `translateX(${dx}px)` } : undefined} className={`ed-pop${align === 'right' ? ' r' : ''}${wide ? ' wide' : ''}`} role="menu" aria-label={label} onMouseDown={keep ? (e) => e.preventDefault() : undefined}>{children(close)}</div>}
    </span>
  );
}

/** One row in a list. */
export function MI({ icon, children, hint, on, danger, onClick, disabled }: { icon?: UiName; children: ReactNode; hint?: string; on?: boolean; danger?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" className={`ed-mi${danger ? ' danger' : ''}${on ? ' on' : ''}`} onClick={onClick} disabled={disabled}>
      {icon ? <UiIcon name={icon} size={17} /> : <span className="ed-mi-gap" aria-hidden />}
      <span className="ed-mi-t"><b>{children}</b>{hint && <i className="tx">{hint}</i>}</span>
      {on && <UiIcon name="check" size={15} />}
    </button>
  );
}
export const Sep = () => <hr className="ed-hr" role="separator" />;

/** A short row of choices where one is on. */
export function Seg<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { v: T; n: string; icon?: UiName }[]; label: string }) {
  return (
    <span className="ed-seg" role="group" aria-label={label}>
      {items.map((i) => <button key={i.v} type="button" className="ed-sg" aria-pressed={value === i.v} onClick={() => onChange(i.v)}>{i.icon && <UiIcon name={i.icon} size={14} />}<span>{i.n}</span></button>)}
    </span>
  );
}

/** A page hands the bar the things it can do. Two pages side by side (code and preview) each add their own, and take them back when they go. */
export function useCtl(ctl: MutableRefObject<Ctl> | undefined, m: Ctl) {
  useEffect(() => {
    if (!ctl) return;
    Object.assign(ctl.current, m);
    return () => { for (const k of Object.keys(m)) delete (ctl.current as Record<string, unknown>)[k]; };
  });
}
