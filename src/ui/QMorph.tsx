'use client';
/**
 * The Coe star that bends, cartoon-style, into a question mark and back again. Drawn by hand each frame:
 * the star's outline is sampled into points, the question mark is built from the same number of points,
 * and every point slides from one to the other a moment after its neighbour, so the shape ripples.
 */
import { useEffect, useRef } from 'react';
import { STAR } from './Mark';

const N = 180, H = 48, NS = 'http://www.w3.org/2000/svg';
type Pt = [number, number];
let cache: { star: Pt[]; ask: Pt[]; hole: Pt[] } | null = null;

const area = (p: Pt[]) => p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + (q[0] * r[1] - r[0] * q[1]); }, 0) / 2;
function resample(poly: Pt[], n: number): Pt[] {
  const seg: number[] = [0]; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; seg.push(seg[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = seg[seg.length - 1], out: Pt[] = []; let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (total * i) / n; while (seg[j + 1] < d) j++;
    const a = poly[j], b = poly[(j + 1) % poly.length], f = (d - seg[j]) / Math.max(1e-6, seg[j + 1] - seg[j]);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
function sampleSub(d: string, n: number): Pt[] {
  const svg = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute'; p.setAttribute('d', d); svg.appendChild(p); document.body.appendChild(svg);
  const L = p.getTotalLength(), out: Pt[] = [];
  for (let i = 0; i < n; i++) { const q = p.getPointAtLength((L * i) / n); out.push([(q.x - 406) / 7.8, (q.y - 8) / 7.8]); }
  document.body.removeChild(svg); return out;
}
/** The question mark's outline: a thick curved line with round ends. */
function askOutline(): Pt[] {
  const w = 7.6, cub = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
  const mid: Pt[] = [];
  for (let i = 0; i <= 40; i++) mid.push(cub([30, 34], [30, 12], [70, 12], [70, 34], i / 40));
  for (let i = 1; i <= 40; i++) mid.push(cub([70, 34], [70, 50], [50, 47], [50, 63], i / 40));
  const left: Pt[] = [], right: Pt[] = [];
  mid.forEach((p, i) => { const a = mid[Math.max(0, i - 1)], b = mid[Math.min(mid.length - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l; left.push([p[0] + nx * w, p[1] + ny * w]); right.push([p[0] - nx * w, p[1] - ny * w]); });
  const cap = (c: Pt, from: Pt, to: Pt): Pt[] => { const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]); let a1 = Math.atan2(to[1] - c[1], to[0] - c[0]); const out: Pt[] = []; let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; const dir = da >= 0 ? 1 : -1; for (let i = 1; i < 10; i++) { const a = a0 + dir * (Math.PI * i) / 10; out.push([c[0] + Math.cos(a) * w, c[1] + Math.sin(a) * w]); } return out; };
  const end = mid[mid.length - 1], start = mid[0];
  // down the left side, round the bottom end, up the right side, round the top end
  const endCap = cap(end, left[left.length - 1], right[right.length - 1]);
  const startCap = cap(start, right[0], left[0]);
  return [...left, ...endCap, ...right.slice().reverse(), ...startCap];
}
function shapes() {
  if (cache) return cache;
  const [outer, inner] = STAR.split(/(?=M)/);
  let star = sampleSub(outer, N), hole = sampleSub(inner ?? outer, H), ask = resample(askOutline(), N);
  if (area(star) < 0) star = star.slice().reverse();
  if (area(ask) < 0) ask = ask.slice().reverse();
  // Start the question mark where it is closest to the star's points, so nothing twists on the way.
  let best = 0, bestD = Infinity;
  for (let k = 0; k < N; k += 2) { let d = 0; for (let i = 0; i < N; i += 3) { const a = star[i], b = ask[(i + k) % N]; d += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2; } if (d < bestD) { bestD = d; best = k; } }
  ask = ask.map((_, i) => ask[(i + best) % N]);
  cache = { star, ask, hole }; return cache;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const back = (x: number) => { const c1 = 1.9, c3 = c1 + 1; return x < 0.5 ? (Math.pow(2 * x, 2) * ((c1 * 1.525 + 1) * 2 * x - c1 * 1.525)) / 2 : (Math.pow(2 * x - 2, 2) * ((c1 * 1.525 + 1) * (x * 2 - 2) + c1 * 1.525) + 2) / 2 + 0 * c3; };
const popOut = (x: number) => { const c1 = 2.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export function QMorph({ size = 56, mode = 'loop', className }: { size?: number; mode?: 'loop' | 'ask' | 'star'; className?: string }) {
  const body = useRef<SVGPathElement>(null), dot = useRef<SVGCircleElement>(null), grp = useRef<SVGGElement>(null);
  const t = useRef(mode === 'ask' ? 1 : 0);
  useEffect(() => {
    const { star, ask, hole: h0 } = shapes();
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';
    let target = mode === 'ask' ? 1 : 0, clock = 0, last = performance.now(), raf = 0;
    const draw = (x: number, now: number) => {
      const S = 0.55; let d = '';
      for (let i = 0; i < N; i++) { const e = back(clamp(x * (1 + S) - (i / N) * S)); const a = star[i], b = ask[i]; d += (i ? 'L' : 'M') + (a[0] + (b[0] - a[0]) * e).toFixed(1) + ' ' + (a[1] + (b[1] - a[1]) * e).toFixed(1); }
      const f = 1 - clamp(x / 0.4), c: Pt = [49.9, 50]; let hd = '';
      h0.forEach((p, i) => { hd += (i ? 'L' : 'M') + (c[0] + (p[0] - c[0]) * f).toFixed(1) + ' ' + (c[1] + (p[1] - c[1]) * f).toFixed(1); });
      body.current?.setAttribute('d', d + 'Z' + (f > 0.02 ? hd + 'Z' : ''));   // the round hole in the middle of the star shrinks away as it becomes a question mark
      const dr = 8.2 * clamp(popOut(clamp((x - 0.5) / 0.45))), drop = (1 - clamp((x - 0.5) / 0.45)) * -26;
      dot.current?.setAttribute('r', String(Math.max(0, dr))); dot.current?.setAttribute('cy', String(86 + drop + (x > 0.97 && !still ? Math.sin(now / 160) * 1.4 : 0)));
      const k = Math.sin(Math.PI * x), wob = still ? 0 : (x > 0.97 ? Math.sin(now / 220) * 5 : Math.sin(x * Math.PI * 2) * 9);
      grp.current?.setAttribute('transform', `translate(50 50) rotate(${wob.toFixed(1)}) scale(${(1 - 0.16 * k).toFixed(3)} ${(1 + 0.2 * k).toFixed(3)}) translate(-50 -50)`);
    };
    if (still) { t.current = target; draw(target, 0); return; }
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
      if (mode === 'loop') { if (target === 0 && clock > 1.15) { target = 1; clock = 0; } else if (target === 1 && clock > 2.5) { target = 0; clock = 0; } }
      else target = mode === 'ask' ? 1 : 0;
      const v = 1 / 0.95; t.current = t.current < target ? Math.min(target, t.current + dt * v) : Math.max(target, t.current - dt * v);
      draw(t.current, now); raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mode]);
  return (
    <svg className={`qm${className ? ' ' + className : ''}`} width={size} height={size} viewBox="-6 -6 112 112" role="img" aria-label="Coe" fill="currentColor" style={{ overflow: 'visible' }}>
      <g ref={grp}><path ref={body} fillRule="evenodd" /><circle ref={dot} cx="50" cy="86" r="0" /></g>
    </svg>
  );
}
