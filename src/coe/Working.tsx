'use client';
/** The star plus a symbol and a few words: what Coe is doing right now. Each job moves the star its own way. */
import { type Phase } from '@/ui/Mark';
import { CoeWork } from '@/ui/CoeWork';
import type { UiIcon } from '@/ui/icons';

type IconName = Parameters<typeof UiIcon>[0]['name'];
export const PHASES: Record<Exclude<Phase, 'rest'>, { label: string; icon: IconName }> = {
  idle: { label: 'Ready', icon: 'check' },
  think: { label: 'Thinking', icon: 'sparkle' },
  write: { label: 'Writing', icon: 'edit' },
  search: { label: 'Searching the web', icon: 'globe' },
  code: { label: 'Running code', icon: 'code' },
  image: { label: 'Making a picture', icon: 'image' },
  read: { label: 'Reading your file', icon: 'file' },
  app: { label: 'Using a tool', icon: 'apps' },
  check: { label: 'Double-checking', icon: 'shield' },
  ask: { label: 'Waiting for your answer', icon: 'info' },
  listen: { label: 'Listening', icon: 'mic' },
  speak: { label: 'Speaking', icon: 'volume' },
};
/** Which star movement goes with which tool. */
export const phaseOfTool = (tool: string): Phase => (tool === 'js' || tool === 'maths' ? 'code' : tool === 'search' ? 'search' : tool === 'image' ? 'image' : tool === 'remember' ? 'think' : tool === 'ask' ? 'ask' : 'app');

export function Working({ phase, label, detail, size = 30 }: { phase: Phase; label?: string; detail?: string; size?: number }) {
  const p = PHASES[phase === 'rest' ? 'idle' : phase];
  return (
    <div className={`cx-think cx-live ph-${phase}`} role="status" aria-live="polite">
      <span className="cx-live-star"><CoeWork phase={phase} size={size} /></span>
      <span className="d cx-live-t">{label ?? p.label}</span>{detail && <span className="cx-live-d tx">{detail}</span>}<span className="cx-dots" aria-hidden><i /><i /><i /></span>
    </div>
  );
}

/** The one "Coe is working" element: soft sweeping lines before the first word, then a small shimmering label. Nothing else animates while a reply is made. */
export function Generating({ phase, label, detail, empty }: { phase: Phase; label?: string; detail?: string; empty?: boolean }) {
  const p = PHASES[phase === 'rest' ? 'idle' : phase];
  return (
    <div className={`gen${empty ? ' empty' : ''}`} role="status" aria-live="polite">
      {empty && <div className="gen-lines" aria-hidden><i /><i /><i /></div>}
      <div className="gen-row"><span className="gen-spark" aria-hidden /><span className="gen-t d">{label ?? p.label}</span>{detail && <span className="gen-d tx">{detail}</span>}</div>
    </div>
  );
}
