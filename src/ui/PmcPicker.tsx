'use client';
import { useEffect, useRef } from 'react';
import { mountPicker, type Picker } from '@/lib/coe/picker';
import { fitAccent } from '@/lib/coe/look';

/** The PMC colour picker (wheel, sliders or square) for React. The page stores a slightly darkened copy of a colour that is too light,
 *  so the picker keeps the colour you are dragging and only follows changes that came from somewhere else (a theme, a dot, "Back to green"). */
export function PmcPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const host = useRef<HTMLDivElement>(null), pk = useRef<Picker | null>(null), cb = useRef(onChange), mine = useRef('');
  cb.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    pk.current = mountPicker(host.current, { value, onChange: (h) => { mine.current = h; cb.current(h); } });
    return () => { pk.current?.destroy(); pk.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (mine.current && fitAccent(mine.current).toLowerCase() === value.toLowerCase()) return; pk.current?.set(value); }, [value]);
  return <div ref={host} className="pk-host" />;
}
