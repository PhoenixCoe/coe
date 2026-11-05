'use client';
import { useId, useLayoutEffect, useRef, useState } from 'react';

interface Opt<T extends string> { value: T; label: string }

/** A "choose one" bar. The black block slides to the choice you pick, so the change is easy to follow. */
export function Seg<T extends string>({ value, options, onChange, label, labelledBy }: {
  value: T; options: Opt<T>[]; onChange: (v: T) => void; label?: string; labelledBy?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>('[aria-checked="true"]');
      if (on) setThumb({ x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    if (document.fonts?.ready) document.fonts.ready.then(place);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div ref={box} className={`seg${thumb ? ' ready' : ''}`} role="radiogroup" aria-label={label} aria-labelledby={labelledBy}>
      {thumb && <span className="seg-thumb" aria-hidden style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)`, width: thumb.w, height: thumb.h }} />}
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
