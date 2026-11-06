'use client';
/**
 * The PMC form parts: a dropdown, a slider and a switch. Nothing in Coe uses the browser's own
 * grey dropdowns or sliders, so every setting looks and works the same way.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { UiIcon } from './icons';

type IconName = Parameters<typeof UiIcon>[0]['name'];

// ---------------------------------------------------------------- dropdown
export interface Choice<T extends string = string> { value: T; label: string; hint?: string; badge?: string; icon?: IconName; disabled?: boolean }

export function Select<T extends string>({ value, options, onChange, label, className = '', block = true, small = false, disabled = false, id, placeholder = 'Choose', align = 'left' }: {
  value: T; options: Choice<T>[]; onChange: (v: T) => void; label: string; className?: string; block?: boolean; small?: boolean; disabled?: boolean; id?: string; placeholder?: string; align?: 'left' | 'right';
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(-1);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; max: number } | null>(null);
  const root = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null);
  const type = useRef({ s: '', t: 0 });
  const cur = options.find((o) => o.value === value);

  const place = useCallback(() => {
    const b = btn.current; if (!b) return;
    const r = b.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
    const below = vh - r.bottom - 12, above = r.top - 12;
    const up = below < 220 && above > below;
    const width = Math.max(r.width, 230), left = align === 'right' ? Math.max(8, Math.min(r.right - width, vw - width - 8)) : Math.max(8, Math.min(r.left, vw - width - 8));
    setPos(up ? { bottom: vh - r.top + 6, left, width: Math.min(width, vw - 16), max: Math.max(160, Math.min(380, above)) } : { top: r.bottom + 6, left, width: Math.min(width, vw - 16), max: Math.max(160, Math.min(380, below)) });
  }, [align]);

  const show = () => { if (disabled) return; place(); setAt(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); };
  const hide = useCallback((focus = true) => { setOpen(false); if (focus) btn.current?.focus(); }, []);
  const pick = (o: Choice<T>) => { if (o.disabled) return; onChange(o.value); hide(); };

  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const re = () => place();
    const t0 = Date.now();   // a scroll that was already on its way when the list opened should not shut it again
    const sc = (e: Event) => { if (Date.now() - t0 < 200) return; if (!list.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', off); window.addEventListener('resize', re); window.addEventListener('scroll', sc, true);
    return () => { document.removeEventListener('pointerdown', off); window.removeEventListener('resize', re); window.removeEventListener('scroll', sc, true); };
  }, [open, place]);
  useEffect(() => { if (open && at >= 0) list.current?.children[at]?.scrollIntoView({ block: 'nearest' }); }, [open, at]);

  const step = (d: number) => { let i = at; for (let n = 0; n < options.length; n++) { i = (i + d + options.length) % options.length; if (!options[i].disabled) break; } setAt(i); };
  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); } return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setAt(0); }
    else if (e.key === 'End') { e.preventDefault(); setAt(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[at]) pick(options[at]); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      const t = type.current, now = Date.now(); t.s = now - t.t > 700 ? e.key.toLowerCase() : t.s + e.key.toLowerCase(); t.t = now;
      const i = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(t.s)); if (i >= 0) setAt(i);
    }
  };

  return (
    <div ref={root} className={`sel${block ? ' block' : ''}${small ? ' small' : ''}${open ? ' open' : ''} ${className}`}>
      <button ref={btn} id={id} type="button" className="sel-btn" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${uid}-l` : undefined} aria-activedescendant={open && at >= 0 ? `${uid}-o${at}` : undefined}
        disabled={disabled} onClick={() => (open ? hide(false) : show())} onKeyDown={onKey}>
        {cur?.icon && <UiIcon name={cur.icon} size={small ? 15 : 18} />}
        <span className="sel-val">{cur ? cur.label : placeholder}</span>
        {cur?.badge && <b className="sel-badge">{cur.badge}</b>}
        <UiIcon name="down" size={small ? 13 : 16} className="sel-chev" />
      </button>
      {open && pos && (
        <ul ref={list} id={`${uid}-l`} className="sel-list" role="listbox" aria-label={label} style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.max }}>
          {options.map((o, i) => (
            <li key={o.value} id={`${uid}-o${i}`} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}
              className={`sel-o${o.value === value ? ' on' : ''}${i === at ? ' at' : ''}${o.disabled ? ' off' : ''}`}
              onPointerEnter={() => setAt(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
              {o.icon && <UiIcon name={o.icon} size={18} />}
              <span className="sel-t"><span className="sel-n">{o.label}</span>{o.hint && <span className="sel-h">{o.hint}</span>}</span>
              {o.badge && <b className="sel-badge">{o.badge}</b>}
              {o.value === value && <UiIcon name="check" size={16} className="sel-tick" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- slider
export function Slider({ value, min, max, step = 1, onChange, label, format, marks, hint, disabled = false, icon, hideLabel = false }: {
  hideLabel?: boolean; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; format?: (v: number) => string; marks?: { value: number; label: string }[]; hint?: string; disabled?: boolean; icon?: IconName;
}) {
  const uid = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const show = format ? format(value) : String(value);
  return (
    <div className={`sld${disabled ? ' off' : ''}`}>
      <div className="sld-top"><label htmlFor={uid} className={`sld-l${hideLabel ? ' sr' : ''}`}>{icon && <UiIcon name={icon} size={17} />}{label}</label><output htmlFor={uid} className="sld-v">{show}</output></div>
      <input id={uid} type="range" className="sld-in" min={min} max={max} step={step} value={value} disabled={disabled} style={{ ['--p' as string]: `${pct}%` }} aria-valuetext={show} onChange={(e) => onChange(Number(e.target.value))} />
      {marks && marks.length > 0 && (
        <div className="sld-marks" aria-hidden>{marks.map((m) => <button key={m.value} type="button" tabIndex={-1} style={{ left: `${((m.value - min) / (max - min)) * 100}%` }} onClick={() => !disabled && onChange(m.value)}>{m.label}</button>)}</div>
      )}
      {hint && <p className="sld-h tx">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- switch
export function Switch({ on, onChange, label, hint, icon, disabled = false }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: IconName; disabled?: boolean }) {
  const uid = useId();
  return (
    <div className={`swt${on ? ' on' : ''}${disabled ? ' off' : ''}`}>
      <div className="swt-t">{icon && <span className="swt-ic" aria-hidden><UiIcon name={icon} size={19} /></span>}<div><label htmlFor={uid} className="swt-l">{label}</label>{hint && <p className="swt-h tx">{hint}</p>}</div></div>
      <button id={uid} type="button" role="switch" aria-checked={on} disabled={disabled} className="swt-b" onClick={() => onChange(!on)}><i /><span className="sr">{on ? 'On' : 'Off'}</span></button>
    </div>
  );
}

// ---------------------------------------------------------------- a settings row: words on the left, the control on the right (below on a phone)
export function Row({ label, hint, icon, children, wide = false }: { label: string; hint?: string; icon?: IconName; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`set-row${wide ? ' wide' : ''}`}>
      <div className="set-lab">{icon && <span className="set-ic" aria-hidden><UiIcon name={icon} size={19} /></span>}<div><b className="d">{label}</b>{hint && <p className="tx">{hint}</p>}</div></div>
      <div className="set-ctl">{children}</div>
    </div>
  );
}
