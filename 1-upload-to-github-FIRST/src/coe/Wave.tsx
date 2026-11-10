'use client';
/**
 * The voice wave: a row of blocks that moves with the sound. It shows your voice while you talk, Coe's voice while it speaks,
 * a travelling ripple while it thinks, and a slow breath when nothing is happening. Tap it to talk, interrupt or stop.
 */
import { useEffect, useRef } from 'react';

export type WavePhase = 'ready' | 'listening' | 'working' | 'thinking' | 'speaking' | 'paused';
export const WAVE_BANDS = 24;

export function Wave({ phase, bands, pulse, onTap, label }: { phase: WavePhase; bands: React.MutableRefObject<number[]>; pulse: React.MutableRefObject<number>; onTap: () => void; label: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const ph = useRef<WavePhase>(phase);
  ph.current = phase;

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const N = 33, mid = (N - 1) / 2;
    const cur = new Float32Array(N), seed = Array.from({ length: N }, () => Math.random() * 6.28);
    let w = 0, h = 0, raf = 0, t0 = performance.now(), colours = { gold: '#B49A57', tint: '#D5E8DC', cream: '#F2E4CE', g1: '#337957' };
    const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';

    const size = () => {
      const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      c.width = Math.round(w * d); c.height = Math.round(h * d); ctx.setTransform(d, 0, 0, d, 0, 0);
      const s = getComputedStyle(c), g = (n: string, f: string) => s.getPropertyValue(n).trim() || f;
      colours = { gold: g('--gold', colours.gold), tint: g('--tint', colours.tint), cream: g('--cream', colours.cream), g1: g('--g1', colours.g1) };
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(c);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000, p = ph.current, still = calm();
      ctx.clearRect(0, 0, w, h);
      const gap = Math.max(3, Math.round(w / N * 0.28)), bw = Math.max(4, (w - gap * (N - 1)) / N), maxH = h * 0.92, minH = Math.max(6, h * 0.05);
      const live = bands.current, liveSum = live.reduce((a, b) => a + b, 0);
      const colour = p === 'listening' ? colours.gold : p === 'speaking' ? colours.tint : p === 'paused' ? colours.cream : colours.cream;
      for (let i = 0; i < N; i++) {
        const d = Math.abs(i - mid) / mid;                       // 0 in the middle, 1 at the edges
        let target = 0;
        if (p === 'listening' || p === 'speaking') {
          const k = Math.min(WAVE_BANDS - 1, Math.floor(d * (WAVE_BANDS - 1)));
          const real = live[k] ?? 0;
          // With no real sound to follow (the browser's own voice or listening) the wave is made up from the pulse.
          const fake = (Math.sin(t * 7 + seed[i]) * 0.5 + 0.5) * (0.35 + 0.65 * Math.sin(t * 2.3 + d * 3) ** 2) * (1 - d * 0.55) * pulse.current;
          target = liveSum > 0.02 ? Math.min(1, real * 1.5) * (1 - d * 0.35) : fake;
          target = Math.max(target, 0.05 + (still ? 0 : 0.07 * (Math.sin(t * 2 + seed[i]) * 0.5 + 0.5) * (1 - d * 0.6)));
        } else if (p === 'thinking' || p === 'working') {
          const x = (t * 0.9) % 1.6 - 0.3;                         // a ripple that runs along the row
          const near = Math.max(0, 1 - Math.abs(i / (N - 1) - x) * 5);
          target = 0.06 + (still ? 0.06 : near * 0.55 + 0.03 * Math.sin(t * 3 + seed[i]));
        } else {
          target = 0.05 + (still ? 0 : 0.035 * (Math.sin(t * 1.4 + d * 5) * 0.5 + 0.5));
        }
        cur[i] += (target - cur[i]) * (still ? 1 : target > cur[i] ? 0.5 : 0.18);
        const bh = Math.max(minH, cur[i] * maxH), x = i * (bw + gap), y = (h - bh) / 2;
        ctx.fillStyle = colour; ctx.globalAlpha = p === 'ready' || p === 'paused' ? 0.55 : 0.55 + 0.45 * Math.min(1, cur[i] * 1.6);
        ctx.fillRect(x, y, bw, bh);
        if (cur[i] > 0.55 && p !== 'thinking') { ctx.globalAlpha = 1; ctx.fillStyle = colours.g1; ctx.fillRect(x, y, bw, Math.min(5, bh)); }
      }
      ctx.globalAlpha = 1;
      pulse.current = Math.max(0.0, pulse.current - 0.012);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [bands, pulse]);

  return (
    <button type="button" className={`cx-wave ${phase}`} onClick={onTap} aria-label={label}>
      <canvas ref={cv} aria-hidden />
    </button>
  );
}
