/**
 * The tab icon shows what Coe is doing: a loading ring that turns while it works, then just a tick when the answer is ready (no star, no badge in
 * the corner). The tick goes away on its own once you have seen it (you are on the tab), or a few seconds after you come back to the tab.
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
/** Working: a ring turns inside the button, one quarter of it bright. */
function spinner(c: CanvasRenderingContext2D, f: number) {
  const k = look(); frame0(c, k);
  c.lineWidth = 7; c.lineCap = 'butt'; c.strokeStyle = k.star;
  c.globalAlpha = 0.3; c.beginPath(); c.arc(28, 28, 14, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
  const at = calm() ? -Math.PI / 2 : f * 0.8; c.beginPath(); c.arc(28, 28, 14, at, at + Math.PI * 0.75); c.stroke();
}
/** Done: the whole icon is one big tick. */
function tickMark(c: CanvasRenderingContext2D) {
  const k = look(); frame0(c, k);
  c.strokeStyle = k.star; c.lineWidth = 8; c.lineCap = 'butt'; c.lineJoin = 'miter';
  c.beginPath(); c.moveTo(14, 29); c.lineTo(24, 39); c.lineTo(43, 17); c.stroke();
}
function paint() {
  if (!canvas) { canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; }
  const c = canvas.getContext('2d'); if (!c) return;
  c.clearRect(0, 0, 64, 64);
  if (state === 'busy') spinner(c, frame++); else if (state === 'done') tickMark(c); else mark(c);
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
  if (next === 'busy' && !calm()) timer = window.setInterval(paint, 110);
  if (next === 'done' && seen()) scheduleClear(6000);       // already looking at it: the tick only needs a moment
}

/** Paints the icon again, for when the look (page colour or accent) changes. */
export function refreshFavicon() { if (typeof document === 'undefined') return; wire(); paint(); }
