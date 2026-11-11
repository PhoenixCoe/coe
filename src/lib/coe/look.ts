/** How Coe looks and sounds on this device: which colour leads, and the click sounds. */
export type Lead = 'cream' | 'ink' | 'gold' | 'green';
export const LEADS: { id: Lead; name: string; blurb: string; page: string; edge: string }[] = [
  { id: 'cream', name: 'Cream', blurb: 'The classic', page: '#FBF6EC', edge: '#171717' },
  { id: 'ink', name: 'Ink', blurb: 'Dark', page: '#171717', edge: '#F2E4CE' },
  { id: 'gold', name: 'Gold', blurb: 'Warm', page: '#B49A57', edge: '#171717' },
  { id: 'green', name: 'Theme', blurb: '', page: '#1A4934', edge: '#F2E4CE' },   // the page takes the accent colour, so it is not always green
];
const LEAD = 'pmc:coe:lead', SFX = 'pmc:coe:sfx', PING = 'pmc:coe:ping', LOOKAT = 'pmc:coe:look-at';
/** When the page colour or accent was last changed on this device. Coe Mini compares it, so the newest choice wins in both. */
const stampLook = (at?: number) => { try { localStorage.setItem(LOOKAT, String(at ?? Date.now())); } catch { /* storage blocked */ } };
export function loadLead(): Lead { try { const v = localStorage.getItem(LEAD); return LEADS.some((l) => l.id === v) ? (v as Lead) : 'cream'; } catch { return 'cream'; } }
export function setLead(l: Lead, at?: number) {
  try { localStorage.setItem(LEAD, l); } catch { /* storage blocked */ }
  stampLook(at);
  document.documentElement.dataset.lead = l;
  try { window.dispatchEvent(new CustomEvent('pmc:coe-look')); } catch { /* no window */ }
}

// ---------------------------------------------------------------- the accent colour: replaces the green everywhere
export interface Accent { id: string; name: string; hex: string }
export const ACCENTS: Accent[] = [
  { id: 'green', name: 'Green', hex: '#337957' }, { id: 'teal', name: 'Teal', hex: '#1F7A7A' }, { id: 'blue', name: 'Blue', hex: '#2B6CB0' },
  { id: 'indigo', name: 'Indigo', hex: '#4C51BF' }, { id: 'purple', name: 'Purple', hex: '#7B4FA3' }, { id: 'rose', name: 'Rose', hex: '#B83B6E' },
  { id: 'red', name: 'Red', hex: '#B03A2E' }, { id: 'orange', name: 'Orange', hex: '#B85C1E' }, { id: 'brown', name: 'Brown', hex: '#7A5A2E' }, { id: 'graphite', name: 'Graphite', hex: '#3F4750' },
];
export const DEFAULT_ACCENT = '#337957';
/** Ready-made looks: a page colour and an accent together. */
export const THEMES: { id: string; name: string; lead: Lead; accent: string }[] = [
  { id: 'pmc', name: 'PMC', lead: 'cream', accent: '#337957' },
  { id: 'ocean', name: 'Ocean', lead: 'cream', accent: '#2B6CB0' },
  { id: 'berry', name: 'Berry', lead: 'cream', accent: '#B83B6E' },
  { id: 'sunset', name: 'Sunset', lead: 'cream', accent: '#B85C1E' },
  { id: 'night', name: 'Night', lead: 'ink', accent: '#4C51BF' },
  { id: 'forest', name: 'Forest', lead: 'green', accent: '#337957' },
  { id: 'lilac', name: 'Lilac', lead: 'cream', accent: '#7B4FA3' },
  { id: 'mono', name: 'Mono', lead: 'cream', accent: '#3F4750' },
];
const ACC = 'pmc:coe:accent';
const rgb = (h: string): [number, number, number] => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); const n = parseInt(m ? m[1] : '337957', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** White text must stay readable on the accent, so a colour that is too light is darkened until it is. */
export function fitAccent(h: string): string { let c = /^#?[0-9a-f]{6}$/i.test(h.trim()) ? '#' + h.trim().replace('#', '').toLowerCase() : DEFAULT_ACCENT; for (let i = 0; i < 12 && 1.05 / (lum(c) + 0.05) < 4.5; i++) c = mix(c, '#000000', 0.1); return c; }
export function loadAccent(): string { try { const v = localStorage.getItem(ACC); return v ? fitAccent(v) : DEFAULT_ACCENT; } catch { return DEFAULT_ACCENT; } }
/** The colours made from one accent, for light pages and for dark ones. */
export function accentCss(h: string): string {
  const a = fitAccent(h), dk = mix(a, '#000000', 0.42), lt = mix(a, '#ffffff', 0.42), tint = mix(a, '#ffffff', 0.84), up = mix(a, '#ffffff', 0.3);
  const night = mix(a, '#000000', 0.62), nightTint = mix(a, '#141414', 0.7);
  return `html:root{--g1:${a};--g2:${dk};--g3:${lt};--tint:${tint};--acc:${a};--acc-d:${dk}}`
    + `html[data-lead='ink'] :is(.cx-scroll,.cx-compose){--g1:${up};--g2:${a};--g3:${mix(a, '#ffffff', 0.55)};--tint:${nightTint}}`
    + `html[data-lead='gold'] :is(.cx-scroll,.cx-compose){--g1:${dk};--g3:${mix(dk, '#000000', 0.4)}}`
    + `html[data-lead='green']{--lead-paper:${dk}}`
    + `html[data-lead='green'] :is(.cx-scroll,.cx-compose){--paper:${dk};--cream:${night};--tint:${mix(dk, '#ffffff', 0.12)};--g1:${mix(a, '#ffffff', 0.5)};--g2:${mix(a, '#000000', 0.78)};--g3:${mix(a, '#ffffff', 0.62)}}`;
}
export function applyAccent(h: string) {
  try {
    let el = document.getElementById('coe-accent') as HTMLStyleElement | null;
    if (!h || fitAccent(h) === DEFAULT_ACCENT) { el?.remove(); document.documentElement.removeAttribute('data-accent'); }
    else { if (!el) { el = document.createElement('style'); el.id = 'coe-accent'; document.head.appendChild(el); } el.textContent = accentCss(h); document.documentElement.dataset.accent = fitAccent(h); }
    const m = document.querySelector('meta[name="theme-color"]'); if (m && !m.getAttribute('data-keep')) m.setAttribute('content', fitAccent(h));
  } catch { /* no document */ }
}
export function setAccent(h: string, at?: number) {
  const c = fitAccent(h); stampLook(at);
  try { if (c === DEFAULT_ACCENT) localStorage.removeItem(ACC); else localStorage.setItem(ACC, c); } catch { /* storage blocked */ }
  applyAccent(c);
  try { window.dispatchEvent(new CustomEvent('pmc:coe-look')); } catch { /* no window */ }
}
export function setTheme(t: (typeof THEMES)[number]) { setLead(t.lead); setAccent(t.accent); }

// ---------------------------------------------------------------- sound: short, hard, machine-like. Off until the person turns it on.
export const sfxOn = () => { try { return localStorage.getItem(SFX) === '1'; } catch { return false; } };
/** Tell me when a reply is ready (a soft chime and a mark in the tab title, only while this tab is not on screen). On unless switched off. */
export const pingOn = () => { try { return localStorage.getItem(PING) !== '0'; } catch { return true; } };
export function setPing(v: boolean) { try { localStorage.setItem(PING, v ? '1' : '0'); } catch { /* storage blocked */ } try { window.dispatchEvent(new CustomEvent('pmc:coe-look')); } catch { /* no window */ } }
let baseTitle = '';
/** A reply finished while the person was on another tab: chime, and put a dot in the tab title until they come back. */
export function replyReady() {
  if (typeof document === 'undefined' || !document.hidden || !pingOn()) return;
  try { tone(660, 150, { vol: 0.05 }); tone(880, 260, { at: 0.13, vol: 0.045 }); } catch { /* no sound */ }
  if (baseTitle) return;
  baseTitle = document.title; document.title = '\u25CF Reply ready \u00B7 ' + baseTitle;
  const back = () => { if (document.hidden) return; document.title = baseTitle; baseTitle = ''; document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  document.addEventListener('visibilitychange', back); window.addEventListener('focus', back);
}
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
  h.style.fontSize = `${Math.round(13.5 * Math.min(150, Math.max(75, d.scale || 100))) / 100}px`;
  if (d.motion === 'full') delete h.dataset.motion; else h.dataset.motion = d.motion;
  if (d.compact && !d.easy) h.dataset.density = 'compact'; else if (d.easy) h.dataset.density = 'easy'; else delete h.dataset.density;
  if (d.contrast) h.dataset.contrast = 'high'; else delete h.dataset.contrast;
}

/** The look Coe Mini should match: both choices, and when they were made. */
export function lookNow() { let at = 0; try { at = Number(localStorage.getItem(LOOKAT)) || 0; } catch { /* storage blocked */ } return { lead: loadLead(), accent: loadAccent(), at }; }
/** Coe Mini has a newer look: take it. */
export function takeLookFrom(look: { lead?: unknown; accent?: unknown; at?: unknown }) {
  const at = Number(look.at) || 0, now = lookNow();
  if (at <= now.at) return;
  const lead = LEADS.find((l) => l.id === look.lead)?.id, acc = typeof look.accent === 'string' && /^#[0-9a-f]{6}$/i.test(look.accent) ? look.accent : '';
  if (lead && lead !== now.lead) setLead(lead, at);
  if (acc && fitAccent(acc) !== now.accent) setAccent(acc, at);
  stampLook(at);
}
