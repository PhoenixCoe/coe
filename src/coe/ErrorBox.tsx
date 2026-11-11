'use client';
import { useState } from 'react';
import { explain as shown, type ErrAct } from '@/lib/coe/errors';
import { isOwner } from '@/lib/coe/owner';

/** A problem, said plainly, with the button that fixes it. */
export function ErrorBox({ kind, text, canRetry, onAct, own, small }: { small?: boolean; own?: boolean; kind?: string; text: string; canRetry: boolean; onAct: (a: ErrAct) => void }) {
  const e = shown(kind as never, text, isOwner() || !!own, !!own);
  const label: Record<ErrAct, string> = { retry: 'Try again', settings: 'Open Settings', plans: 'See plans', signin: 'Sign in', appeal: 'Appeal' };
  const acts = e.acts.filter((a) => a !== 'retry' || canRetry);
  const [open, setOpen] = useState(kind === 'banned');   // one line by default; a tap on the words opens the full sentence
  return (
    <div className={`cx-err ${e.level}${small ? ' sm' : ''}${open ? ' open' : ''}`} role="alert">
      <span className="cx-err-i" aria-hidden>{e.level === 'grey' ? <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="9.5" y="3" width="5" height="5" /><rect x="9.5" y="10" width="5" height="11" /></svg> : '!'}</span>
      <h4 className="d"><button type="button" className="cx-err-t" aria-expanded={open} title={e.text} onClick={() => setOpen((o) => !o)}>{e.title}</button></h4>
      <p className="tx" title={e.text} onClick={() => setOpen((o) => !o)}>{e.text}</p>
      {acts.length > 0 && <div className="cx-err-acts">{acts.map((a, i) => <button key={a} type="button" className={`btn small${i === 0 ? ' gold' : ''}`} onClick={() => onAct(a)}>{label[a]}</button>)}</div>}
    </div>
  );
}

const INFO_ICON = <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="9.5" y="3" width="5" height="5" /><rect x="9.5" y="10" width="5" height="11" /></svg>;

/** A notice (grey, info icon) or a problem (orange or red, ! icon) with a line of words and one button, in the same PMC box as the errors. */
export function Notice({ title, text, act, onAct, level = 'grey', small }: { title: string; text: string; act?: string; onAct?: () => void; level?: 'grey' | 'orange' | 'red'; small?: boolean }) {
  return (
    <div className={`cx-err ${level}${small ? ' sm' : ''} open`} role="status">
      <span className="cx-err-i" aria-hidden>{level === 'grey' ? INFO_ICON : '!'}</span>
      <h4 className="d"><span className="cx-err-t">{title}</span></h4>
      <p className="tx">{text}</p>
      {act && onAct && <div className="cx-err-acts"><button type="button" className="btn small gold" onClick={onAct}>{act}</button></div>}
    </div>
  );
}
