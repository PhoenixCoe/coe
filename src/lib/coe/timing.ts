/**
 * The timer while Coe works: one number, how long the reply has taken. Time spent waiting for the person to answer a question
 * is not counted, because that is not Coe's time.
 */
import type { Phase } from '@/ui/Mark';

interface Seg { p: Phase; t0: number; t1?: number }
export interface Timing { t0: number; segs: Seg[] }
/** What is kept with a finished reply. */
export interface Took { total: number; stopped?: boolean }

export const newTiming = (now = Date.now()): Timing => ({ t0: now, segs: [] });

/** Coe moved on to a new job. */
export function enter(t: Timing, p: Phase, now = Date.now()) {
  const cur = t.segs[t.segs.length - 1];
  if (cur && cur.t1 == null) { if (cur.p === p) return; cur.t1 = now; }
  if (p !== 'idle' && p !== 'rest') t.segs.push({ p, t0: now });
}
export function finish(t: Timing, now = Date.now()) { const cur = t.segs[t.segs.length - 1]; if (cur && cur.t1 == null) cur.t1 = now; }
/** Milliseconds of Coe's own time so far (waiting for the person excluded). */
export function total(t: Timing, now = Date.now()): number { let ms = 0; for (const s of t.segs) if (s.p !== 'ask') ms += Math.max(0, (s.t1 ?? now) - s.t0); return ms; }
export const took = (t: Timing, stopped = false): Took => ({ total: total(t), ...(stopped ? { stopped: true } : {}) });
