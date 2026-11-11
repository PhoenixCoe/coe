/**
 * The tab icon shows what Coe is doing: three dots that bounce while it works, then the Coe star with a tick in the corner when the answer is
 * ready. The tick goes away on its own once you have seen it (you are on the tab), or a few seconds after you come back to the tab.
 */
import { STAR } from '@/ui/Mark';

export type FavState = 'idle' | 'busy' | 'done';
import { loadAccent, loadLead } from './look';
const rgbOf = (h: string): [number, number, number] => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixHex = (a: string, b: string, t: number) => { const x = rgbOf(a), y = rgbOf(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const CREAM = '#F2E4CE', INK = '#171717', GOLD = '#B49A57';
let state: FavState = 'idle', timer: number | undefined, frame = 0, link: HTMLLinkElement | null = null, stash: HTMLLinkElement[] = [], clear: number | undefined, wired = false;
let canvas: HTMLCanvasElement | null = null;
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off'; } catch { return false; } };

/** The icon is drawn like a PMC button (a black edge and a hard shadow) in the colours of the look that is on: the page colour and the accent. */
function look() {
  const a = loadAccent(), lead = loadLead(), dk = mixHex(a, '#000000', 0.42);
  if (lead === 'ink') return { fill: INK, edge: CREAM, shadow: a, star: mixHex(a, '#ffffff', 0.55), on: CREAM };
  if (lead === 'gold') return { fill: GOLD, edge: INK, shadow: dk, star: INK, on: INK };
  if (lead === 'green') return { fill: dk, edge: CREAM, shadow: mixHex(a, '#000000', 0.78), star: CREAM, on: CREAM };
  return { fill: CREAM, edge: INK, shadow: dk, star: a, on: a };
}
function frame0(c: CanvasRenderingContext2D, k: ReturnType<typeof look>) {
  c.fillStyle = k.shadow; c.fillRect(6, 6, 54, 54);
  c.fillStyle = k.edge; c.fillRect(1, 1, 54, 54);
  c.fillStyle = k.fill; c.fillRect(5, 5, 46, 46);
}
function mark(c: CanvasRenderingContext2D) {
  const k = look(); frame0(c, k);
  const s = (46 * 0.74) / 780; c.save(); c.translate(28 - 796 * s, 28 - 398 * s); c.scale(s, s); c.fillStyle = k.star; c.fill(new Path2D(STAR), 'evenodd'); c.restore();
}
function dots(c: CanvasRenderingContext2D, f: number) {
  const k = look(); frame0(c, k);
  for (let i = 0; i < 3; i++) {
    const on = calm() ? 1 : Math.max(0, Math.sin(((f / 6) - i / 3) * Math.PI * 2));     // each dot rises in turn
    const s = 8 + on * 3, x = 9 + i * 13 + (8 - s) / 2, y = 28 - s / 2 - on * 4;
    c.fillStyle = k.star; c.globalAlpha = on > 0.45 ? 1 : 0.55; c.fillRect(x, y, s, s); c.globalAlpha = 1;
  }
}
function tick(c: CanvasRenderingContext2D) {
  c.fillStyle = INK; c.fillRect(30, 30, 34, 34);                // a border, so it shows against the button
  c.fillStyle = '#FFFFFF'; c.fillRect(33, 33, 28, 28);
  c.strokeStyle = mixHex(loadAccent(), '#000000', 0.42); c.lineWidth = 6; c.lineCap = 'butt'; c.lineJoin = 'miter'; c.beginPath(); c.moveTo(38, 47); c.lineTo(45, 54); c.lineTo(57, 38); c.stroke();
}
function paint() {
  if (!canvas) { canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; }
  const c = canvas.getContext('2d'); if (!c) return;
  c.clearRect(0, 0, 64, 64);
  if (state === 'busy') dots(c, frame++); else { mark(c); if (state === 'done') tick(c); }
  if (!link) { link = document.createElement('link'); link.id = 'coe-fav'; link.rel = 'icon'; link.type = 'image/png'; link.setAttribute('sizes', '64x64'); }
  link.href = canvas.toDataURL('image/png'); link.dataset.state = state;
  if (!link.isConnected) {
    stash = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"]')).filter((l) => l !== link);
    stash.forEach((l) => l.remove()); document.head.appendChild(link);
  }
}
const seen = () => document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus());
function scheduleClear(ms: number) { if (clear) clearTimeout(clear); clear = window.setTimeout(() => { if (state === 'done') setFavicon('idle'); }, ms); }
function wire() {
  if (wired) return; wired = true;
  const back = () => { if (state === 'done' && seen()) scheduleClear(3000); };
  document.addEventListener('visibilitychange', back); window.addEventListener('focus', back);
}

export function setFavicon(next: FavState) {
  if (typeof document === 'undefined') return;
  wire();
  if (clear) { clearTimeout(clear); clear = undefined; }
  state = next; frame = 0;
  if (timer) { clearInterval(timer); timer = undefined; }
  if (next === 'idle') { paint(); return; }
  paint();
  if (next === 'busy' && !calm()) timer = window.setInterval(paint, 170);
  if (next === 'done' && seen()) scheduleClear(6000);       // already looking at it: the tick only needs a moment
}

/** Paints the icon again, for when the look (page colour or accent) changes. */
export function refreshFavicon() { if (typeof document === 'undefined') return; wire(); paint(); }
