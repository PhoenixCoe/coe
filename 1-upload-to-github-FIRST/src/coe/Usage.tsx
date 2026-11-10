'use client';
import { fmtTok } from '@/lib/coe/models';

/** How much of today is used, as a word and a colour: green while there is plenty, gold when it is half gone, red when it is nearly out. */
export type Tone = 'ok' | 'mid' | 'low' | 'out';
export const toneOf = (used: number, limit: number): Tone => { const p = limit > 0 ? used / limit : 0; return p >= 1 ? 'out' : p >= 0.8 ? 'low' : p >= 0.5 ? 'mid' : 'ok'; };
export const WORDS: Record<Tone, string> = { ok: 'Plenty left', mid: 'Half used', low: 'Getting low', out: 'All used' };

/** The next UTC midnight, in this person's own clock, because that is when the count starts again. */
export const resetAt = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }); };

export function UsageBar({ used, limit, note }: { used: number; limit: number; note?: string }) {
  const left = Math.max(0, limit - used), pct = Math.min(100, limit > 0 ? (used / limit) * 100 : 0), tone = toneOf(used, limit);
  return (
    <div className={`use ${tone}`}>
      <div className="use-top"><b className="use-n d">{fmtTok(left)}</b><span className="use-l tx">left today, of {fmtTok(limit)}</span><span className="use-w d">{WORDS[tone]}</span></div>
      <div className="use-bar" role="img" aria-label={`${fmtTok(used)} of ${fmtTok(limit)} tokens used, ${WORDS[tone].toLowerCase()}`}><i style={{ width: `${pct}%` }} /></div>
      <p className="use-f tx">{note ?? `Starts again at ${resetAt()}.`}</p>
    </div>
  );
}
