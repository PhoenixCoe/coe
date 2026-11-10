'use client';
import { useEffect, useRef } from 'react';

/** The Coe logo: a C, a star and an E. The star is its own shape so it can move on its own. */
const C = "M249.023 0C252.93 0 256.999 0.16276 261.23 0.488281C272.624 0.488281 284.505 1.13932 296.875 2.44141C383.464 17.7409 445.475 79.1016 482.91 186.523L488.77 215.82L380.859 245.117C360.026 186.198 333.822 147.298 302.246 128.418C270.996 109.212 238.118 108.724 203.613 126.953C174.316 145.182 152.669 172.689 138.672 209.473C125 245.931 118.164 305.339 118.164 387.695C114.909 439.779 118.49 491.862 128.906 543.945C139.323 596.029 157.715 632.812 184.082 654.297C210.775 675.456 245.768 681.478 289.062 672.363C328.451 657.064 358.887 617.513 380.371 553.711L488.77 585.449C472.168 651.855 436.849 709.961 382.812 759.766C347.982 785.156 305.339 797.852 254.883 797.852C248.698 798.503 242.676 798.828 236.816 798.828H227.539C150.716 795.247 91.3086 752.767 49.3164 671.387C19.043 619.629 2.76693 527.669 0.488281 395.508C0.16276 386.719 0 377.93 0 369.141C0.651042 256.51 18.2292 170.736 52.7344 111.816C85.9375 61.0352 124.349 28.8086 167.969 15.1367C193.359 5.04557 220.378 0 249.023 0Z";
const E = "M1626.09 115.234H1351.19V329.102H1534.29V448.242H1351.19V670.898H1640.25V794.922H1234.49L1234.98 2.92969H1626.09V115.234Z";
export const STAR = "M786.886 22.9033C790.107 14.1976 802.421 14.1978 805.643 22.9033L825.213 75.79C875.855 212.649 983.761 320.556 1120.62 371.198L1173.51 390.768C1182.21 393.989 1182.21 406.304 1173.51 409.525L1120.62 429.095C983.761 479.737 875.855 587.643 825.213 724.503L805.643 777.39C802.421 786.095 790.107 786.095 786.886 777.39L767.316 724.503C716.674 587.643 608.768 479.737 471.908 429.095L419.021 409.525C410.316 406.304 410.316 393.989 419.021 390.768L471.908 371.198C608.768 320.556 716.674 212.65 767.316 75.79L786.886 22.9033ZM796.265 272.595C726.494 272.595 669.934 329.155 669.934 398.926C669.934 468.696 726.494 525.257 796.265 525.257C866.035 525.257 922.595 468.696 922.596 398.926C922.596 329.155 866.035 272.595 796.265 272.595Z";


/**
 * A little easter egg: grab the star and turn it. It follows your finger, keeps its speed when you let go and slows down slowly
 * (like a real wheel with a bit of friction), and a plain tap gives it a push. The wordmark's own slow turn picks up again where it ends.
 */
const FRICTION = 0.85;    // how quickly it loses speed (per second)
const MAX_SPEED = 2600;   // degrees a second
function useSpin(on: boolean, idle: number, whole: boolean) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = svg.current, star = el?.querySelector<SVGPathElement>('.cm-star');
    if (!on || !el || !star) return;
    const target: Element = whole ? el : star;
    let ang = 0, w = 0, raf = 0, own = false, pid = -1, lastPa = 0, off = 0, path = 0, lastXY = [0, 0];
    let samples: { t: number; a: number }[] = [];
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';
    const paint = () => { star.style.transform = `rotate(${ang}deg)`; };
    const centre = () => { const r = star.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const angleAt = (e: PointerEvent) => { const [cx, cy] = centre(); return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI; };
    const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
    const take = () => {
      if (own) return; own = true;
      try { const m = new DOMMatrix(getComputedStyle(star).transform); ang = (Math.atan2(m.b, m.a) * 180) / Math.PI; } catch { ang = 0; }
      star.style.animation = 'none'; paint();
    };
    const give = () => {   // hand the slow turn back to the stylesheet, from the angle it stopped at
      const t = (((ang % 360) + 360) % 360) / 360 * (360 / idle);
      star.style.transform = ''; star.style.animation = ''; star.style.animationDelay = `-${t}s`; own = false; w = 0;
    };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const coast = () => {
      stop(); let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        ang += w * dt; w = idle + (w - idle) * Math.exp(-FRICTION * dt); paint();
        if (Math.abs(w - idle) < (idle ? 2 : 3)) { if (idle) give(); else { w = 0; } raf = 0; return; }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || pid !== -1) return;
      e.preventDefault(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId); pid = e.pointerId;
      stop(); take(); w = 0; path = 0; lastXY = [e.clientX, e.clientY];
      lastPa = angleAt(e); off = 0; samples = [{ t: performance.now(), a: ang }];
      el.classList.add('grabbing');
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      const pa = angleAt(e); ang += wrap(pa - lastPa); lastPa = pa; off = 0;
      path += Math.hypot(e.clientX - lastXY[0], e.clientY - lastXY[1]); lastXY = [e.clientX, e.clientY];
      const now = performance.now(); samples.push({ t: now, a: ang }); while (samples.length > 2 && now - samples[0].t > 110) samples.shift();
      paint();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return; pid = -1; el.classList.remove('grabbing');
      const now = performance.now(), s0 = samples[0], dt = Math.max(0.016, (now - s0.t) / 1000);
      if (path < 5) w = (Math.random() < 0.5 ? -1 : 1) * 340;                    // a tap is a push
      else w = Math.abs(now - samples[samples.length - 1].t) > 120 ? 0 : (ang - s0.a) / dt;   // held still before letting go: no speed
      w = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, w));
      if (calm()) { w = 0; if (idle) { give(); } return; }
      coast();
    };
    target.addEventListener('pointerdown', down as EventListener); el.addEventListener('pointermove', move as EventListener); el.addEventListener('pointerup', up as EventListener); el.addEventListener('pointercancel', up as EventListener);
    return () => { stop(); target.removeEventListener('pointerdown', down as EventListener); el.removeEventListener('pointermove', move as EventListener); el.removeEventListener('pointerup', up as EventListener); el.removeEventListener('pointercancel', up as EventListener); };
  }, [on, idle, whole]);
  return svg;
}

/** What the star is doing. Each one moves differently, so you can see at a glance what Coe is up to. */
export type Phase = 'rest' | 'idle' | 'think' | 'write' | 'search' | 'code' | 'image' | 'read' | 'app' | 'check' | 'ask' | 'listen' | 'speak';

/** The whole wordmark. It takes the colour of the text around it. The star turns slowly, and faster while Coe is answering. */
export function CoeWordmark({ height = 28, live = false, mode, className, spin = false }: { height?: number; live?: boolean; mode?: Phase; className?: string; spin?: boolean }) {
  const m = mode ?? (live ? 'think' : 'brand');
  const ref = useSpin(spin && m === 'brand', 360 / 14, false);
  return (
    <svg ref={ref} className={`cm-word${spin ? ' cm-spin' : ''}${className ? ' ' + className : ''}`} height={height} width={(height * 1641) / 799} viewBox="0 0 1641 799" role="img" aria-label="Coe" fill="currentColor">
      <path d={C} />
      <path d={E} />
      <path className={`cm-star m-${m}`} fillRule="evenodd" clipRule="evenodd" d={STAR} />
    </svg>
  );
}

/** Just the star. */
export function CoeStar({ size = 24, live = false, mode, className, spin = false }: { size?: number; live?: boolean; mode?: Phase; className?: string; spin?: boolean }) {
  const m = mode ?? (live ? 'think' : 'rest');
  const ref = useSpin(spin && m === 'rest', 0, true);
  return (
    <svg ref={ref} className={`cm-starbox${spin ? ' cm-spin' : ''}${className ? ' ' + className : ''}`} width={size} height={size} viewBox="406 8 780 780" role="img" aria-label="Coe" fill="currentColor">
      <path className={`cm-star m-${m}`} fillRule="evenodd" clipRule="evenodd" d={STAR} />
    </svg>
  );
}

/** The star on a teal square: for small places like the tab icon and the loading screen. */
export function CoeMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Coe">
      <rect width="100" height="100" fill="var(--g1)" />
      <svg x="16" y="16" width="68" height="68" viewBox="406 8 780 780"><path fill="var(--cream)" fillRule="evenodd" clipRule="evenodd" d={STAR} /></svg>
    </svg>
  );
}
