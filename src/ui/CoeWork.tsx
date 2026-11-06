'use client';
/**
 * Coe turns into the thing it is doing: the star squashes down, a symbol pops out (a pencil that writes,
 * a scanner that sweeps, a magnifier that searches...), and after a few seconds the star comes back.
 */
import type { ReactNode } from 'react';
import { CoeStar, type Phase } from './Mark';

const g = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'square', strokeLinejoin: 'miter' } as const;

const GLYPH: Partial<Record<Phase, ReactNode>> = {
  write: (<g {...g}>
    <path className="cw-line" d="M5 27H27" strokeDasharray="22" />
    <g className="cw-pencil"><path d="M21 5l5 5L12 24l-6 1 1-6z" fill="var(--tint)" /><path d="M18 8l5 5" /></g>
  </g>),
  think: (<g {...g}>
    <path className="cw-bulb" d="M16 4a8 8 0 0 0-4.5 14.6V22h9v-3.4A8 8 0 0 0 16 4z" fill="var(--tint)" />
    <path d="M12.5 26h7M14 29.2h4" />
    <path className="cw-ray" d="M16 0.5v0M3 10l-2-1M29 10l2-1M5 3l-1.5-1.5M27 3l1.5-1.5" />
  </g>),
  search: (<g {...g} className="cw-orbit"><circle cx="13" cy="13" r="8" fill="var(--tint)" /><path d="M19 19l9 9" strokeWidth="3.6" /><path className="cw-glint" d="M9 11a4.5 4.5 0 0 1 3-2.5" strokeWidth="1.8" /></g>),
  read: (<g {...g}>
    <path d="M7 3h13l5 5v21H7z" fill="var(--tint)" /><path d="M11 12h10M11 17h10M11 22h6" strokeWidth="1.8" />
    <path className="cw-bar" d="M2 6h28" stroke="var(--g1)" strokeWidth="3" />
  </g>),
  code: (<g {...g}>
    <path className="cw-l" d="M11 9L4 16l7 7" /><path className="cw-r" d="M21 9l7 7-7 7" /><path className="cw-slash" d="M18 6l-4 20" />
  </g>),
  image: (<g {...g}>
    <path d="M3 6h26v20H3z" fill="var(--tint)" /><circle className="cw-sun" cx="10.5" cy="12.5" r="2.6" fill="currentColor" />
    <path className="cw-hill" d="M3 24l8-7 6 5 4-3 8 6" strokeDasharray="40" />
  </g>),
  app: (<g {...g} className="cw-spin"><circle cx="16" cy="16" r="11.5" strokeWidth="4" strokeDasharray="3.1 3.1" /><circle cx="16" cy="16" r="8" fill="var(--tint)" /><circle cx="16" cy="16" r="3" /></g>),
  check: (<g {...g}><path d="M16 3l11 4v9c0 6.5-4.5 10.5-11 13C9.5 26.500 5 22.500 5 16V7z" fill="var(--tint)" /><path className="cw-tick" d="M10.500 16l4 4 7-8" strokeWidth="3.2" strokeDasharray="20" /></g>),
  ask: (<g {...g} className="cw-hop"><path d="M10.500 11.500C10.500 4.500 21.500 4.500 21.500 11.500c0 4.500-5.500 4.500-5.500 9" strokeWidth="3.4" /><path d="M14.500 24h3v3h-3z" fill="currentColor" strokeWidth="1" /></g>),
  listen: (<g {...g}>
    <path d="M12 4h8v14h-8z" fill="var(--tint)" /><path d="M7 14v3a9 9 0 0 0 18 0v-3M16 26v4" />
    <circle className="cw-rip" cx="16" cy="12" r="6" strokeWidth="1.6" /><circle className="cw-rip b" cx="16" cy="12" r="6" strokeWidth="1.6" />
  </g>),
  speak: (<g {...g}>
    <path d="M4 12h5l7-6v20l-7-6H4z" fill="var(--tint)" />
    <path className="cw-w1" d="M20 11a6 6 0 0 1 0 10" /><path className="cw-w2" d="M23.500 7a11 11 0 0 1 0 18" />
  </g>),
};

export function CoeWork({ phase, size = 30 }: { phase: Phase; size?: number }) {
  const sym = GLYPH[phase];
  if (!sym) return <CoeStar size={size} mode={phase} />;
  return (
    <span className={`cw cw-${phase}`} style={{ width: size, height: size }} aria-hidden>
      <span className="cw-st"><CoeStar size={size} mode="rest" /></span>
      <svg className="cw-sy" width={size} height={size} viewBox="0 0 32 32">{sym}</svg>
    </span>
  );
}
