'use client';
import { useEffect, useRef, useState } from 'react';
import { CoeWordmark } from './Mark';
import { PmcMark } from './PmcMark';

export interface LoadStep { label: string; run: () => Promise<void> | void }

/** Runs real set-up steps in order and reports where it is. */
export function useLoadSequence(steps: LoadStep[], minMs = 0, attempt = 0) {
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(steps);
  useEffect(() => {
    let dead = false; setError(null); setIndex(0);
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
  }, [minMs, attempt]);
  return { index, total: steps.length, ready: index >= steps.length && !error, error };
}

/**
 * The full-window loading screen: the Coe logo with its star turning, a step count (2/5), a bar that fills with the real steps, and what is happening.
 * It is plain HTML and CSS, so it moves before any script has loaded. If it takes too long, it says so and offers to try again or clear old saved files.
 */
export function CoeLoader({ title, steps, index, error, onRetry }: { title: string; steps: string[]; index: number; error?: string | null; onRetry?: () => void }) {
  const [wait, setWait] = useState(0);
  useEffect(() => { const a = setTimeout(() => setWait(1), 8000), b = setTimeout(() => setWait(2), 20000); return () => { clearTimeout(a); clearTimeout(b); }; }, []);
  const done = Math.min(index, steps.length);
  // The page's own recovery bar (one set of Reload / Fix and reload buttons) is used when it is there, so the buttons never show twice.
  const bar = () => typeof window !== 'undefined' && typeof (window as unknown as { __coeStuck?: unknown }).__coeStuck === 'function';
  useEffect(() => {
    if (!(wait > 0 || error) || !bar()) return;
    (window as unknown as { __coeStuck: (t: string, x: string, y: string) => void }).__coeStuck(
      error ? 'Coe could not open' : wait === 1 ? 'Coe is taking a while' : 'Coe is still not open',
      error ? 'Part of Coe didn’t load, probably because the connection dropped. Press Reload. Still stuck? Press Fix and reload.' : wait === 1 ? 'Slower than usual. Your connection may be weak. Coe is still trying. You can wait, or press Reload.' : 'Something is holding it up. Press Fix and reload to clear the old saved files and start fresh.',
      error || '');
  }, [wait, error]);
  const fix = () => {
    const go = () => { window.location.replace(window.location.pathname + '?fresh=' + Date.now()); };
    try { navigator.serviceWorker?.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))).catch(() => {}); caches?.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).catch(() => {}); } catch { /* not supported */ }
    setTimeout(go, 700);
  };
  return (
    <div className="ld" role="status" aria-live="polite">
      <div className="ld-logo" aria-hidden><CoeWordmark height={84} live /></div>
      <p className="ld-title d"><span>Loading {title}</span><span className="ld-count" aria-label={`${done} of ${steps.length}`}>{done}/{steps.length}</span></p>
      <div className="ld-bar" aria-hidden><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <p className="ld-line tx">{error ? error : `${steps[Math.min(index, steps.length - 1)]}…`}</p>
      <div className="ld-by"><PmcMark height={26} /></div>
      {(wait > 0 || error) && !bar() && (
        <div className="ld-help">
          <p className="ld-sorry tx">{error ? 'Coe could not finish opening.' : wait === 1 ? 'Coe is taking a while.' : 'Coe is still not open.'}</p>
          <div className="ld-btns"><button type="button" className="btn small gold" onClick={onRetry ?? (() => window.location.reload())}>Reload</button><button type="button" className="btn small" onClick={fix}>Fix and reload</button></div>
        </div>
      )}
    </div>
  );
}
