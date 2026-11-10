'use client';
import { useState } from 'react';
import { explain as shown, type ErrAct } from '@/lib/coe/errors';
import { isOwner } from '@/lib/coe/owner';

/** A problem, said plainly, with the button that fixes it. */
export function ErrorBox({ kind, text, canRetry, onAct, own, small }: { small?: boolean; own?: boolean; kind?: string; text: string; canRetry: boolean; onAct: (a: ErrAct) => void }) {
  const e = shown(kind as never, text, isOwner() || !!own, !!own);
  const label: Record<ErrAct, string> = { retry: 'Try again', settings: 'Open Settings', plans: 'See plans', signin: 'Sign in' };
  const acts = e.acts.filter((a) => a !== 'retry' || canRetry);
  const [open, setOpen] = useState(false);   // one line by default; a tap on the words opens the full sentence
  return (
    <div className={`cx-err ${e.level}${small ? ' sm' : ''}${open ? ' open' : ''}`} role="alert">
      <span className="cx-err-i" aria-hidden>!</span>
      <h4 className="d"><button type="button" className="cx-err-t" aria-expanded={open} title={e.text} onClick={() => setOpen((o) => !o)}>{e.title}</button></h4>
      <p className="tx" title={e.text} onClick={() => setOpen((o) => !o)}>{e.text}</p>
      {acts.length > 0 && <div className="cx-err-acts">{acts.map((a, i) => <button key={a} type="button" className={`btn small${i === 0 ? ' gold' : ''}`} onClick={() => onAct(a)}>{label[a]}</button>)}</div>}
    </div>
  );
}
