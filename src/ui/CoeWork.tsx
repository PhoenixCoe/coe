'use client';
/**
 * Coe is the Coe star. Only while it writes does the star turn into a pencil that writes a line. Everything else (thinking, searching, reading, checking) is the star moving its own way, with the words next to it saying what it is doing.
 */
import type { ReactNode } from 'react';
import { CoeStar, type Phase } from './Mark';

const g = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'square', strokeLinejoin: 'miter' } as const;

const GLYPH: Partial<Record<Phase, ReactNode>> = {
  write: (<g {...g}>
    <path className="cw-line" d="M5 27H27" strokeDasharray="22" />
    <g className="cw-pencil"><path d="M21 5l5 5L12 24l-6 1 1-6z" fill="var(--tint)" /><path d="M18 8l5 5" /></g>
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
