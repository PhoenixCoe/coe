'use client';
import { useEffect, useRef, useState } from 'react';
import { CoeWordmark } from './Mark';

export interface LoadStep { label: string; run: () => Promise<void> | void }

/** Runs real set-up steps in order and reports where it is. */
export function useLoadSequence(steps: LoadStep[], minMs = 0) {
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(steps);
  useEffect(() => {
    let dead = false;
    (async () => {
      const hold = minMs / Math.max(1, ref.current.length);
      const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      for (let i = 0; i < ref.current.length; i++) {
        if (dead) return;
        setIndex(i);
        const t0 = performance.now();
        try { await ref.current[i].run(); const left = hold - (performance.now() - t0); if (left > 0 && !dead) await wait(left); }
        catch (e) { if (!dead) setError(`${ref.current[i].label} failed: ${e instanceof Error ? e.message : 'unknown error'}`); return; }
      }
      if (!dead) setIndex(ref.current.length);
    })();
    return () => { dead = true; };
  }, [minMs]);
  return { index, total: steps.length, ready: index >= steps.length && !error, error };
}

/** The full-window loading screen: moving blocks, a step count (2/5), and what is happening. */
export function CoeLoader({ title, steps, index, error }: { title: string; steps: string[]; index: number; error?: string | null }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 8000); return () => clearTimeout(t); }, []);
  const done = Math.min(index, steps.length);
  return (
    <div className="ld" role="status" aria-live="polite">
      <div className="ld-logo" aria-hidden><CoeWordmark height={84} live /></div>
      <p className="ld-title d"><span>Loading {title}</span><span className="ld-count" aria-label={`${done} of ${steps.length}`}>{done}/{steps.length}</span></p>
      <div className="ld-bar" aria-hidden><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <p className="ld-line tx">{error ? error : `${steps[Math.min(index, steps.length - 1)]}…`}</p>
      {slow && !error && <p className="ld-sorry tx">Sorry, this is taking longer than usual. It is still going, and it will be quicker next time.</p>}
    </div>
  );
}
