/** How Coe looks and sounds on this device: which colour leads, and the click sounds. */
export type Lead = 'cream' | 'ink' | 'gold' | 'green';
export const LEADS: { id: Lead; name: string; blurb: string; page: string; edge: string }[] = [
  { id: 'cream', name: 'Cream', blurb: 'The classic', page: '#FBF6EC', edge: '#171717' },
  { id: 'ink', name: 'Ink', blurb: 'Dark', page: '#171717', edge: '#F2E4CE' },
  { id: 'gold', name: 'Gold', blurb: 'Warm', page: '#B49A57', edge: '#171717' },
  { id: 'green', name: 'Green', blurb: 'PMC green', page: '#1A4934', edge: '#F2E4CE' },
];
const LEAD = 'pmc:coe:lead', SFX = 'pmc:coe:sfx';
export function loadLead(): Lead { try { const v = localStorage.getItem(LEAD); return LEADS.some((l) => l.id === v) ? (v as Lead) : 'cream'; } catch { return 'cream'; } }
export function setLead(l: Lead) {
  try { localStorage.setItem(LEAD, l); } catch { /* storage blocked */ }
  document.documentElement.dataset.lead = l;
  try { window.dispatchEvent(new CustomEvent('pmc:coe-look')); } catch { /* no window */ }
}

// ---------------------------------------------------------------- sound: short, hard, machine-like. Off until the person turns it on.
export const sfxOn = () => { try { return localStorage.getItem(SFX) === '1'; } catch { return false; } };
export function setSfx(v: boolean) { try { localStorage.setItem(SFX, v ? '1' : '0'); } catch { /* storage blocked */ } try { window.dispatchEvent(new CustomEvent('pmc:coe-look')); } catch { /* no window */ } if (v) sfx.on(); }
let ac: AudioContext | null = null;
function ctx(): AudioContext | null {
  try { const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return null; ac = ac ?? new AC(); if (ac.state === 'suspended') void ac.resume(); return ac; } catch { return null; }
}
function tone(freq: number, ms: number, opt: { type?: OscillatorType; vol?: number; to?: number; at?: number } = {}) {
  const c = ctx(); if (!c) return;
  const t0 = c.currentTime + (opt.at ?? 0), o = c.createOscillator(), g = c.createGain();
  o.type = opt.type ?? 'square'; o.frequency.setValueAtTime(freq, t0); if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t0 + ms / 1000);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(opt.vol ?? 0.035, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + ms / 1000 + 0.02);
}
const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
export const sfx = {
  /** a heavy press */ send() { if (!sfxOn()) return; tone(110, 90, { to: 55, vol: 0.06 }); tone(220, 40, { type: 'square', vol: 0.02 }); buzz(10); },
  /** a reply has finished */ done() { if (!sfxOn()) return; tone(392, 70, { at: 0 }); tone(587, 110, { at: 0.08 }); },
  /** switched on */ on() { if (!sfxOn()) return; tone(330, 50); tone(494, 70, { at: 0.05 }); },
  /** switched off */ off() { if (!sfxOn()) return; tone(494, 50); tone(247, 80, { at: 0.05 }); },
  /** something went wrong */ error() { if (!sfxOn()) return; tone(130, 160, { type: 'sawtooth', vol: 0.04 }); buzz(30); },
  /** a right answer */ right() { if (!sfxOn()) return; tone(523, 60); tone(784, 120, { at: 0.07 }); },
  /** a wrong answer */ wrong() { if (!sfxOn()) return; tone(196, 150, { type: 'sawtooth', vol: 0.035, to: 130 }); },
};

// ---------------------------------------------------------------- how the page is drawn: text size, motion, spacing
/** Puts the display settings on the page. Called whenever they change. */
export function applyDisplay(d: { scale: number; motion: 'full' | 'calm' | 'off'; compact: boolean; easy: boolean }) {
  const h = document.documentElement;
  h.style.fontSize = `${Math.round(15 * Math.min(150, Math.max(80, d.scale || 100))) / 100}px`;
  if (d.motion === 'full') delete h.dataset.motion; else h.dataset.motion = d.motion;
  if (d.compact && !d.easy) h.dataset.density = 'compact'; else if (d.easy) h.dataset.density = 'easy'; else delete h.dataset.density;
}
