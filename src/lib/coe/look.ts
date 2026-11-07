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
/** Every sound goes through one soft low-pass filter and a slow fade in and out, so nothing clicks, thuds or buzzes. */
let bus: { in: GainNode } | null = null;
function soft(c: AudioContext) {
  if (bus) return bus;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; lp.Q.value = 0.4;
  const g = c.createGain(); g.gain.value = 0.8; g.connect(lp); lp.connect(c.destination);
  return (bus = { in: g });
}
function tone(freq: number, ms: number, opt: { type?: OscillatorType; vol?: number; to?: number; at?: number } = {}) {
  const c = ctx(); if (!c) return;
  const t0 = c.currentTime + (opt.at ?? 0), len = ms / 1000, o = c.createOscillator(), g = c.createGain();
  o.type = opt.type ?? 'sine'; o.frequency.setValueAtTime(freq, t0); if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t0 + len);
  const peak = opt.vol ?? 0.03, atk = Math.min(0.03, len * 0.3);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + atk); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len + 0.12);
  o.connect(g); g.connect(soft(c).in); o.start(t0); o.stop(t0 + len + 0.15);
}
const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
export const sfx = {
  /** a soft tap */ send() { if (!sfxOn()) return; tone(440, 110, { to: 392, vol: 0.025 }); buzz(8); },
  /** a reply has finished */ done() { if (!sfxOn()) return; tone(523, 160, { vol: 0.022 }); tone(659, 240, { at: 0.11, vol: 0.02 }); },
  /** switched on */ on() { if (!sfxOn()) return; tone(440, 120, { vol: 0.02 }); tone(587, 170, { at: 0.07, vol: 0.018 }); },
  /** switched off */ off() { if (!sfxOn()) return; tone(587, 120, { vol: 0.02 }); tone(440, 170, { at: 0.07, vol: 0.018 }); },
  /** something went wrong */ error() { if (!sfxOn()) return; tone(311, 220, { to: 262, vol: 0.022 }); buzz(20); },
  /** a right answer */ right() { if (!sfxOn()) return; tone(587, 130, { vol: 0.02 }); tone(784, 220, { at: 0.09, vol: 0.018 }); },
  /** a wrong answer */ wrong() { if (!sfxOn()) return; tone(262, 240, { to: 220, vol: 0.02 }); },
};

// ---------------------------------------------------------------- how the page is drawn: text size, motion, spacing
/** Puts the display settings on the page. Called whenever they change. */
export function applyDisplay(d: { scale: number; motion: 'full' | 'calm' | 'off'; compact: boolean; easy: boolean; contrast?: boolean }) {
  const h = document.documentElement;
  h.style.fontSize = `${Math.round(15 * Math.min(150, Math.max(80, d.scale || 100))) / 100}px`;
  if (d.motion === 'full') delete h.dataset.motion; else h.dataset.motion = d.motion;
  if (d.compact && !d.easy) h.dataset.density = 'compact'; else if (d.easy) h.dataset.density = 'easy'; else delete h.dataset.density;
  if (d.contrast) h.dataset.contrast = 'high'; else delete h.dataset.contrast;
}
