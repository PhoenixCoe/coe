'use client';
/** Keeps a very long message to a sensible height, with a button to see all of it. Nothing is cut while the reply is still being written. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { UiIcon } from '@/ui/icons';

export function Clamp({ children, limit = 640, live }: { children: ReactNode; limit?: number; live?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false), [open, setOpen] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el || live) return;
    const read = () => setTall(el.scrollHeight > limit * 1.25);
    read(); if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read); ro.observe(el); return () => ro.disconnect();
  }, [live, limit, children]);
  const cut = tall && !open && !live;
  return (
    <div className="cx-clampw">
      <div ref={box} className={`cx-clamp${cut ? ' cut' : ''}`} style={cut ? { maxHeight: limit } : undefined}>{children}</div>
      {tall && !live && <button type="button" className="cx-act cx-showall" aria-expanded={open} onClick={() => setOpen(!open)}><UiIcon name="down" size={14} className={open ? 'flip' : ''} />{open ? 'Show less' : 'Show all'}</button>}
    </div>
  );
}
