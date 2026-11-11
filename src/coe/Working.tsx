'use client';
/** The star plus a symbol and a few words: what Coe is doing right now. Each job moves the star its own way. */
import { type Phase } from '@/ui/Mark';
import { CoeWork } from '@/ui/CoeWork';
import { useEffect, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { thinkOrder } from '@/lib/coe/thinking';
import { total, type Timing, type Took } from '@/lib/coe/timing';

type IconName = Parameters<typeof UiIcon>[0]['name'];

/** How long it has been going, in plain seconds: 7s, then 1m 05s. */
export const clock = (ms: number) => { const t = Math.max(0, Math.floor(ms / 1000)); return t < 60 ? `${t}s` : `${Math.floor(t / 60)}m ${String(t % 60).padStart(2, '0')}s`; };
function Timer({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(t); }, []);
  return <span className="gen-s tx" aria-hidden>{clock(Date.now() - since)}</span>;
}
/** Short spans in tenths (2.4s), long ones as 1m 05s. */
export const dur = (ms: number) => (ms < 10_000 ? `${(Math.max(0, ms) / 1000).toFixed(1)}s` : clock(ms));
/** The timer while Coe works: how long this reply has taken so far. */
export function Timers({ timing }: { timing: Timing }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 500); return () => window.clearInterval(t); }, []);
  return (
    <div className="tm" role="timer" aria-live="off" aria-label="How long Coe has been working">
      <span className="tm-c tot"><b className="d">Total</b><i>{clock(total(timing))}</i></span>
    </div>
  );
}
/** After the reply: how long it took. */
export function TookLine({ took }: { took: Took }) {
  return <p className="tk tx"><UiIcon name="timer" size={14} /><span>{took.stopped ? 'Stopped after' : 'Took'} {dur(took.total)}</span></p>;
}
/** The word shown while Coe is only thinking (not running anything): a new one every 3 to 5 seconds, never the same one twice in a row (the list is in lib/coe/thinking.ts). */
export const THINK_EVERY = [3000, 5000] as const;
export function ThinkWord({ seed }: { seed?: number }) {
  const [order] = useState(() => thinkOrder(seed ?? Date.now()));
  const [i, setI] = useState(0);
  useEffect(() => {
    let t = 0; const next = () => { t = window.setTimeout(() => { setI((n) => (n + 1) % order.length); next(); }, THINK_EVERY[0] + Math.random() * (THINK_EVERY[1] - THINK_EVERY[0])); };
    next(); return () => window.clearTimeout(t);
  }, [order]);
  return <span key={i} className="think-w">{order[i]}</span>;
}
export const PHASES: Record<Exclude<Phase, 'rest'>, { label: string; icon: IconName }> = {
  idle: { label: 'Ready', icon: 'check' },
  think: { label: 'Thinking', icon: 'sparkle' },
  write: { label: 'Writing', icon: 'edit' },
  search: { label: 'Searching the web', icon: 'globe' },
  code: { label: 'Running code', icon: 'code' },
  image: { label: 'Making a picture', icon: 'image' },
  read: { label: 'Reading your file', icon: 'file' },
  app: { label: 'Using a tool', icon: 'apps' },
  check: { label: 'Double-checking', icon: 'shield' },
  ask: { label: 'Waiting for your answer', icon: 'info' },
  listen: { label: 'Listening', icon: 'mic' },
  speak: { label: 'Speaking', icon: 'volume' },
};
/** Which star movement goes with which tool. */
export const phaseOfTool = (tool: string): Phase => (tool === 'js' || tool === 'maths' ? 'code' : tool === 'search' ? 'search' : tool === 'image' ? 'image' : tool === 'remember' ? 'think' : tool === 'ask' ? 'ask' : 'app');

export function Working({ phase, label, detail, size = 30 }: { phase: Phase; label?: string; detail?: string; size?: number }) {
  const p = PHASES[phase === 'rest' ? 'idle' : phase];
  return (
    <div className={`cx-think cx-live ph-${phase}`} role="status" aria-live={phase === 'think' && !label ? 'off' : 'polite'} aria-label={phase === 'think' && !label ? 'Thinking' : undefined}>
      <span className="cx-live-star"><CoeWork phase={phase} size={size} /></span>
      <span className="d cx-live-t">{label ?? p.label}</span>{detail && <span className="cx-live-d tx">{detail}</span>}
    </div>
  );
}

/** The one "Coe is working" element: the turning Coe star and a plain label. Nothing else animates while a reply is made. */
export function Generating({ phase, label, detail, empty, since, timing }: { phase: Phase; label?: string; detail?: string; empty?: boolean; since?: number; timing?: Timing }) {
  const p = PHASES[phase === 'rest' ? 'idle' : phase];
  return (
    <div className={`gen${empty ? ' empty' : ''}`} role="status" aria-live={phase === 'think' && !label ? 'off' : 'polite'} aria-label={phase === 'think' && !label ? 'Thinking' : undefined}>
      <div className="gen-row"><span className="gen-star" aria-hidden><CoeWork phase={phase} size={20} /></span><span className="gen-t tx">{label ?? (phase === 'think' ? <ThinkWord /> : p.label)}</span>{detail && <span className="gen-d tx">{detail}</span>}{since && !timing ? <Timer since={since} /> : null}</div>
      {timing && <Timers timing={timing} />}
    </div>
  );
}
