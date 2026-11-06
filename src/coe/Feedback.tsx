'use client';
/** "How am I doing?": a box above the message box, made by the site (not by Coe), so it costs nothing to answer. */
import { useEffect, useState } from 'react';
import { QMorph } from '@/ui/QMorph';
import { CoeStar } from '@/ui/Mark';
import { UiIcon } from '@/ui/icons';
import type { Rating } from '@/lib/coe/feedback';

const FACES: { id: Rating; label: string; fill: string }[] = [
  { id: 'bad', label: 'Bad', fill: '#E8A99E' },
  { id: 'fine', label: 'Fine', fill: '#E9D58E' },
  { id: 'good', label: 'Good', fill: '#9DD3B5' },
];

/** A round face. The eyes blink and the mouth moves when you point at it. */
export function Face({ kind, size = 44 }: { kind: Rating; size?: number }) {
  const f = FACES.find((x) => x.id === kind)!;
  return (
    <svg className={`fb-face ${kind}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="21" fill={f.fill} stroke="#171717" strokeWidth="3" />
      {kind === 'bad' && <><path className="fb-brow" d="M11 13 L19 17 M37 13 L29 17" stroke="#171717" strokeWidth="3" strokeLinecap="round" fill="none" /></>}
      <ellipse className="fb-eye" cx="17" cy="21" rx="2.6" ry="3.4" fill="#171717" /><ellipse className="fb-eye" cx="31" cy="21" rx="2.6" ry="3.4" fill="#171717" />
      {kind === 'bad' && <path className="fb-mouth" d="M15 35 Q24 26 33 35" stroke="#171717" strokeWidth="3.4" strokeLinecap="round" fill="none" />}
      {kind === 'fine' && <path className="fb-mouth" d="M16 33 L32 33" stroke="#171717" strokeWidth="3.4" strokeLinecap="round" fill="none" />}
      {kind === 'good' && <><path className="fb-mouth" d="M13 28 Q24 42 35 28 Z" stroke="#171717" strokeWidth="3" strokeLinejoin="round" fill="#fff" /><circle cx="10" cy="29" r="2.6" fill="#E27D6B" opacity="0.8" /><circle cx="38" cy="29" r="2.6" fill="#E27D6B" opacity="0.8" /></>}
    </svg>
  );
}

export function Feedback({ onRate, onLater, onDone }: { onRate: (r: Rating) => void; onLater: () => void; onDone: () => void }) {
  const [done, setDone] = useState<Rating | null>(null);
  useEffect(() => { if (!done) return; const t = window.setTimeout(onDone, 2400); return () => window.clearTimeout(t); }, [done, onDone]);   // after "Thanks", the box slides away
  if (done) {
    return (
      <div className="fb fb-thanks" role="status">
        <span className="fb-star"><CoeStar size={40} mode="idle" /></span>
        <div className="fb-q"><b className="d">Thanks!</b><span className="tx">{done === 'good' ? 'Glad it is going well.' : done === 'fine' ? 'I will keep working on it.' : 'Sorry about that. I will try to do better.'}</span></div>
        <Face kind={done} size={40} />
      </div>
    );
  }
  return (
    <div className="fb" role="group" aria-label="How am I doing?">
      <div className="fb-top">
        <span className="fb-star"><QMorph size={52} mode="loop" /></span>
        <div className="fb-q"><b className="d">How am I doing?</b><span className="tx">Tap one. It takes a second and helps me get better.</span></div>
        <button type="button" className="fb-x" aria-label="Not now" title="Not now" onClick={onLater}><UiIcon name="close" size={16} /></button>
      </div>
      <div className="fb-btns">
        {FACES.map((f) => (
          <button key={f.id} type="button" className={`fb-b ${f.id}`} onClick={() => { setDone(f.id); onRate(f.id); }}>
            <Face kind={f.id} /><span className="d">{f.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
