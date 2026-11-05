'use client';
import { explain as shown, type ErrAct } from '@/lib/coe/errors';
import { isOwner } from '@/lib/coe/owner';

/** A problem, said plainly, with the button that fixes it. */
export function ErrorBox({ kind, text, canRetry, onAct, own }: { own?: boolean; kind?: string; text: string; canRetry: boolean; onAct: (a: ErrAct) => void }) {
  const e = shown(kind as never, text, isOwner() || !!own, !!own);
  const label: Record<ErrAct, string> = { retry: 'Try again', settings: 'Open Settings', plans: 'See plans', signin: 'Sign in' };
  const acts = e.acts.filter((a) => a !== 'retry' || canRetry);
  return (
    <div className={`cx-err${e.soft ? ' warn' : ''}`} role="alert">
      <span className="cx-err-i" aria-hidden>!</span>
      <h4 className="d">{e.title}</h4>
      <p className="tx">{e.text}</p>
      {acts.length > 0 && <div className="cx-err-acts">{acts.map((a, i) => <button key={a} type="button" className={`btn small${i === 0 ? ' gold' : ''}`} onClick={() => onAct(a)}>{label[a]}</button>)}</div>}
    </div>
  );
}
