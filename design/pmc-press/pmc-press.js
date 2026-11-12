/* PMC Press: the accent colour. One hex in, the whole colour set out.
   Copied from Coe (src/lib/coe/look.ts) with the Coe-only selectors removed. Plain JavaScript, no dependencies.

   Usage:
     import { fitAccent, accentCss, applyAccent, ACCENTS } from './pmc-press.js';
     applyAccent('#2B6CB0');          // writes a <style id="pmc-accent"> and sets html[data-accent]
     document.documentElement.dataset.lead = 'ink';   // 'cream' | 'ink' | 'gold' | 'green'
   Store the person's choice yourself (Coe uses localStorage 'pmc:coe:accent' and 'pmc:coe:lead'). */

export const DEFAULT_ACCENT = '#337957';
export const ACCENTS = [
  { id: 'green', name: 'Green', hex: '#337957' }, { id: 'teal', name: 'Teal', hex: '#1F7A7A' }, { id: 'blue', name: 'Blue', hex: '#2B6CB0' },
  { id: 'indigo', name: 'Indigo', hex: '#4C51BF' }, { id: 'purple', name: 'Purple', hex: '#7B4FA3' }, { id: 'rose', name: 'Rose', hex: '#B83B6E' },
  { id: 'red', name: 'Red', hex: '#B03A2E' }, { id: 'orange', name: 'Orange', hex: '#B85C1E' }, { id: 'brown', name: 'Brown', hex: '#7A5A2E' }, { id: 'graphite', name: 'Graphite', hex: '#3F4750' },
];
/** Ready-made looks: a lead (page colour) and an accent together. */
export const LOOKS = [
  { id: 'pmc', name: 'PMC', lead: 'cream', accent: '#337957' }, { id: 'ocean', name: 'Ocean', lead: 'cream', accent: '#2B6CB0' },
  { id: 'berry', name: 'Berry', lead: 'cream', accent: '#B83B6E' }, { id: 'sunset', name: 'Sunset', lead: 'cream', accent: '#B85C1E' },
  { id: 'night', name: 'Night', lead: 'ink', accent: '#4C51BF' }, { id: 'forest', name: 'Forest', lead: 'green', accent: '#337957' },
  { id: 'lilac', name: 'Lilac', lead: 'cream', accent: '#7B4FA3' }, { id: 'mono', name: 'Mono', lead: 'cream', accent: '#3F4750' },
];

const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); const n = parseInt(m ? m[1] : '337957', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** White text must stay readable on the accent (4.5:1), so a colour that is too light is darkened 10% at a time until it is. */
export function fitAccent(h) {
  let c = /^#?[0-9a-f]{6}$/i.test(String(h).trim()) ? '#' + String(h).trim().replace('#', '').toLowerCase() : DEFAULT_ACCENT;
  for (let i = 0; i < 12 && 1.05 / (lum(c) + 0.05) < 4.5; i++) c = mix(c, '#000000', 0.1);
  return c;
}

/** The CSS that turns one accent into g1, g2, g3 and tint on all four leads. */
export function accentCss(h) {
  const a = fitAccent(h), dk = mix(a, '#000000', 0.42), lt = mix(a, '#ffffff', 0.42), tint = mix(a, '#ffffff', 0.84), up = mix(a, '#ffffff', 0.3);
  const night = mix(a, '#000000', 0.62), nightTint = mix(a, '#141414', 0.7);
  return `html:root{--g1:${a};--g2:${dk};--g3:${lt};--tint:${tint};--acc:${a};--acc-d:${dk}}`
    + `html[data-lead='ink']{--g1:${up};--g2:${a};--g3:${mix(a, '#ffffff', 0.55)};--tint:${nightTint}}`
    + `html[data-lead='gold']{--g1:${dk};--g3:${mix(dk, '#000000', 0.4)}}`
    + `html[data-lead='green']{--paper:${dk};--cream:${night};--tint:${mix(dk, '#ffffff', 0.12)};--g1:${mix(a, '#ffffff', 0.5)};--g2:${mix(a, '#000000', 0.78)};--g3:${mix(a, '#ffffff', 0.62)}}`;
}

/** Apply an accent to the page. The default green removes the override. */
export function applyAccent(h) {
  let el = document.getElementById('pmc-accent');
  if (!h || fitAccent(h) === DEFAULT_ACCENT) { el && el.remove(); document.documentElement.removeAttribute('data-accent'); }
  else {
    if (!el) { el = document.createElement('style'); el.id = 'pmc-accent'; document.head.appendChild(el); }
    el.textContent = accentCss(h); document.documentElement.dataset.accent = fitAccent(h);
  }
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', fitAccent(h));
}
