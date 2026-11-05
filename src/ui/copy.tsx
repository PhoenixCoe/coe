'use client';
import { useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/copy';

export function CopyButton({ text, label = 'Copy', small = true, disabled }: { text: string; label?: string; small?: boolean; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button" className={`btn${small ? ' small' : ''}`} disabled={disabled || !text}
      onClick={async () => { if (await copyText(text)) { setDone(true); clearTimeout(t.current); t.current = setTimeout(() => setDone(false), 1400); } }}
    >
      <span aria-live="polite">{done ? 'Copied' : label}</span>
    </button>
  );
}

export function downloadText(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
