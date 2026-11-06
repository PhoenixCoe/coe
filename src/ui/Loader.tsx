'use client';
import { useEffect, useRef, useState } from 'react';

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

const TIPS = [
  'Select words in an answer to explain them, simplify them or be quizzed on them.',
  'Press Ctrl+K to find anything Coe can do.',
  'Drop in a song and Coe measures its tempo and key in the Sound lab.',
  'Coe can ask you questions with sliders and tick boxes, and cost nothing to answer.',
  'Your chats stay on your device unless you sign in to sync them.',
  'Say "quiz me on this chat" to turn any conversation into flash cards.',
];
const CELLS = 10;

/**
 * The full-window loading screen. Five blocks fly in from the edges and lock together as Coe's star, turn, and burst apart again,
 * while a row of ten squares fills with the real steps. It is plain HTML and CSS, so it moves before any script has loaded.
 * If it takes too long, it says so and offers to try again or clear old saved files.
 */
export function CoeLoader({ title, steps, index, error, onRetry }: { title: string; steps: string[]; index: number; error?: string | null; onRetry?: () => void }) {
  const [wait, setWait] = useState(0), [tip, setTip] = useState(0);
  useEffect(() => { const a = setTimeout(() => setWait(1), 8000), b = setTimeout(() => setWait(2), 20000); return () => { clearTimeout(a); clearTimeout(b); }; }, []);
  useEffect(() => { if (wait < 0) return; const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 4200); return () => clearInterval(t); }, [wait]);
  const done = Math.min(index, steps.length), lit = Math.round((done / steps.length) * CELLS);
  const fix = () => {
    const go = () => { window.location.replace(window.location.pathname + '?fresh=' + Date.now()); };
    try { navigator.serviceWorker?.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))).catch(() => {}); caches?.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).catch(() => {}); } catch { /* not supported */ }
    setTimeout(go, 700);
  };
  return (
    <div className="ld" role="status" aria-live="polite">
      <div className="ldx" aria-hidden><i /><i /><i /><i /><i /></div>
      <p className="ld-title d"><span>Loading {title}</span><span className="ld-count" aria-label={`${done} of ${steps.length}`}>{done}/{steps.length}</span></p>
      <div className="ld-cells" aria-hidden>{Array.from({ length: CELLS }, (_, i) => <i key={i} className={i < lit ? 'on' : i === lit ? 'next' : ''} />)}</div>
      <p className="ld-line tx">{error ? error : `${steps[Math.min(index, steps.length - 1)]}…`}</p>
      {!error && wait === 0 && <p className="ld-tip tx" key={tip}>{TIPS[tip]}</p>}
      {(wait > 0 || error) && (
        <div className="ld-help">
          <p className="ld-sorry tx">{error ? 'Coe could not finish opening.' : wait === 1 ? 'Sorry, this is taking longer than usual. It is still going, and it will be quicker next time.' : 'Still not open. Your connection may be weak, or an old saved copy is in the way.'}</p>
          <div className="ld-btns"><button type="button" className="btn small gold" onClick={onRetry ?? (() => window.location.reload())}>Try again</button><button type="button" className="btn small" onClick={fix}>Fix and reload</button></div>
        </div>
      )}
    </div>
  );
}
