'use client';
/**
 * Coe is the Coe star. It moves its own way for each job (thinking, searching, reading, checking), and turns the same way while it writes. The words next to it say what it is doing.
 */
import { CoeStar, type Phase } from './Mark';

/** Writing used to turn the star into a pencil. It does not any more: while Coe writes you see the same turning Coe star as while it thinks. */
export function CoeWork({ phase, size = 30 }: { phase: Phase; size?: number }) {
  return <CoeStar size={size} mode={phase === 'write' ? 'think' : phase} />;
}
