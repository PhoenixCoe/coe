/**
 * The tab icon shows what Coe is doing: three dots that bounce while it works, then the Coe star with a tick in the corner when the answer is
 * ready. The tick goes away on its own once you have seen it (you are on the tab), or a few seconds after you come back to the tab.
 */
import { STAR } from '@/ui/Mark';

export type FavState = 'idle' | 'busy' | 'done';
import { loadAccent } from './look';
const G = () => loadAccent();
const mixDark = (h: string) => { const n = parseInt(h.slice(1), 16); const f = (v: number) => Math.round(v * 0.58).toString(16).padStart(2, '0'); return '#' + f((n >> 16) & 255) + f((n >> 8) & 255) + f(n & 255); };
const CREAM = '#F2E4CE', INK = '#171717', GOLD = '#B49A57';
let state: FavState = 'idle', timer: number | undefined, frame = 0, link: HTMLLinkElement | null = null, stash: HTMLLinkElement[] = [], clear: number | undefined, wired = false;
let canvas: HTMLCanvasElement | null = null;
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off'; } catch { return false; } };

function mark(c: CanvasRenderingContext2D) {
  c.fillStyle = G(); c.fillRect(0, 0, 64, 64);
  const k = (64 * 0.68) / 780; c.save(); c.translate(64 * 0.16 - 406 * k, 64 * 0.16 - 8 * k); c.scale(k, k); c.fillStyle = CREAM; c.fill(new Path2D(STAR), 'evenodd'); c.restore();
}
function dots(c: CanvasRenderingContext2D, f: number) {
  c.fillStyle = G(); c.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 3; i++) {
    const on = calm() ? 1 : Math.max(0, Math.sin(((f / 6) - i / 3) * Math.PI * 2));     // each dot rises in turn
    const s = 13 + on * 3, x = 8 + i * 19, y = 32 - s / 2 - on * 7;
    c.fillStyle = on > 0.45 ? '#FFFFFF' : CREAM; c.fillRect(x + (13 - s) / 2, y + 7 * 0, s, s);
  }
}
function tick(c: CanvasRenderingContext2D) {
  c.fillStyle = INK; c.fillRect(30, 30, 34, 34);                // a border, so it shows against the star
  c.fillStyle = '#FFFFFF'; c.fillRect(33, 33, 28, 28);
  c.strokeStyle = mixDark(G()); c.lineWidth = 6; c.lineCap = 'butt'; c.lineJoin = 'miter'; c.beginPath(); c.moveTo(38, 47); c.lineTo(45, 54); c.lineTo(57, 38); c.stroke();
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
function restore() {
  if (timer) { clearInterval(timer); timer = undefined; }
  if (link?.isConnected) link.remove();
  stash.forEach((l) => { if (!l.isConnected) document.head.appendChild(l); }); stash = [];
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
  if (next === 'idle') { restore(); return; }
  paint();
  if (next === 'busy' && !calm()) timer = window.setInterval(paint, 170);
  if (next === 'done' && seen()) scheduleClear(6000);       // already looking at it: the tick only needs a moment
}
