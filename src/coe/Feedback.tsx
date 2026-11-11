'use client';
/** "How am I doing?": a small row above the message box, made by the site (not by Coe), so it costs nothing to answer. */
import { useEffect, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { type Rating } from '@/lib/coe/feedback';

const FACES: { id: Rating; label: string; fill: string }[] = [
  { id: 'bad', label: 'Bad', fill: '#E8A99E' },
  { id: 'fine', label: 'Fine', fill: '#E9D58E' },
  { id: 'good', label: 'Good', fill: '#9DD3B5' },
];

/** A round face. */
export function Face({ kind, size = 24 }: { kind: Rating; size?: number }) {
  const f = FACES.find((x) => x.id === kind)!;
  return (
    <svg className={`fb-face ${kind}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="21" fill={f.fill} stroke="#171717" strokeWidth="3" />
      {kind === 'bad' && <path d="M11 13 L19 17 M37 13 L29 17" stroke="#171717" strokeWidth="3" strokeLinecap="round" fill="none" />}
      <ellipse cx="17" cy="21" rx="2.6" ry="3.4" fill="#171717" /><ellipse cx="31" cy="21" rx="2.6" ry="3.4" fill="#171717" />
      {kind === 'bad' && <path d="M15 35 Q24 26 33 35" stroke="#171717" strokeWidth="3.4" strokeLinecap="round" fill="none" />}
      {kind === 'fine' && <path d="M16 33 L32 33" stroke="#171717" strokeWidth="3.4" strokeLinecap="round" fill="none" />}
      {kind === 'good' && <path d="M13 28 Q24 42 35 28 Z" stroke="#171717" strokeWidth="3" strokeLinejoin="round" fill="#fff" />}
    </svg>
  );
}

export function Feedback({ onRate, onMessage, onLater, onDone }: { onRate: (r: Rating) => void; onMessage: (r: Rating, text: string) => Promise<boolean>; onLater: () => void; onDone: () => void }) {
  const [done, setDone] = useState<Rating | null>(null), [text, setText] = useState(''), [state, setState] = useState<'' | 'sending' | 'sent' | 'failed'>('');
  const more = done && done !== 'good' && state !== 'sent';
  useEffect(() => { if (!done || more || state === 'sending') return; const t = window.setTimeout(onDone, 2000); return () => window.clearTimeout(t); }, [done, more, state, onDone]);
  if (done) {
    return (
      <div className="fb fb-thanks" role="status">
        <Face kind={done} />
        <span className="fb-q d">{state === 'sent' ? 'Sent. Thank you.' : done === 'good' ? 'Thanks!' : 'Thanks. What could be better?'}</span>
        {more && (
          <form className="fb-more" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; setState('sending'); void onMessage(done, text).then((ok) => setState(ok ? 'sent' : 'failed')); }}>
            <input className="cx-in" value={text} maxLength={600} placeholder="Optional" aria-label="What could be better?" onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="btn small" disabled={!text.trim() || state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send'}</button>
            {state === 'failed' && <span className="tx fb-fail">It did not send. Try again.</span>}
            <button type="button" className="cx-act" onClick={onDone}>Skip</button>
          </form>
        )}
      </div>
    );
  }
  return (
    <div className="fb" role="group" aria-label="How am I doing?">
      <b className="fb-q d">How am I doing?</b>
      <div className="fb-btns">
        {FACES.map((f) => (
          <button key={f.id} type="button" className={`fb-b ${f.id}`} onClick={() => { setDone(f.id); onRate(f.id); }}><Face kind={f.id} /><span className="d">{f.label}</span></button>
        ))}
      </div>
      <button type="button" className="fb-x" aria-label="Not now" title="Not now" onClick={onLater}><UiIcon name="close" size={16} /></button>
    </div>
  );
}
