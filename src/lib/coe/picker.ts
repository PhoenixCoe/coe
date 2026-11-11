/**
 * The PMC colour picker: a wheel, sliders and a square, in PMC style. It does not use the browser's own picker.
 * Plain DOM, so Coe and Coe Mini share the same code (the extension gets a compiled copy of this file).
 */
export interface PickerOpts { value: string; onChange: (hex: string) => void }
export interface Picker { set: (hex: string) => void; destroy: () => void }
type Mode = 'wheel' | 'sliders' | 'square';
type HSV = { h: number; s: number; v: number };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;   // with or without the #, and the short form (abc means aabbcc)
function fromHex(hex: string): HSV {
  const m = RE.exec(String(hex).trim()), full = m ? (m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]) : '337957', n = parseInt(full, 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
}
function rgbOf({ h, s, v }: HSV): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const toHex = (c: HSV) => '#' + rgbOf(c).map((v) => v.toString(16).padStart(2, '0')).join('');
const css = (c: HSV) => 'rgb(' + rgbOf(c).join(',') + ')';
const RAINBOW = 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';
const KEY = 'pmc:coe:picker';

export function mountPicker(host: HTMLElement, o: PickerOpts): Picker {
  let hsv = fromHex(o.value), mode: Mode = 'wheel', raf = 0, dead = false;
  try { const m = localStorage.getItem(KEY); if (m === 'sliders' || m === 'square' || m === 'wheel') mode = m; } catch { /* storage blocked */ }
  host.textContent = '';
  const root = document.createElement('div'); root.className = 'pk'; root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'Colour picker');
  root.innerHTML = '<div class="pk-tabs" role="tablist" aria-label="Picker style"></div><div class="pk-body"></div>'
    + '<div class="pk-foot"><span class="pk-sw" aria-hidden="true"><i></i></span><label class="pk-hex"><span>#</span><input type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Colour code"></label></div>';
  host.appendChild(root);
  const tabs = root.querySelector('.pk-tabs') as HTMLElement, body = root.querySelector('.pk-body') as HTMLElement;
  const sw = root.querySelector('.pk-sw i') as HTMLElement, hexIn = root.querySelector('.pk-hex input') as HTMLInputElement;
  const live: (() => void)[] = [];   // paints the parts of the open style
  const MODES: [Mode, string][] = [['wheel', 'Wheel'], ['sliders', 'Sliders'], ['square', 'Square']];

  const emit = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (!dead) o.onChange(toHex(hsv)); }); };
  const paint = () => {
    const hx = toHex(hsv); sw.style.background = hx; if (document.activeElement !== hexIn) hexIn.value = hx.slice(1).toUpperCase();
    live.forEach((f) => f());
  };
  const change = (p: Partial<HSV>) => { hsv = { ...hsv, ...p, h: clamp(p.h ?? hsv.h, 0, 360), s: clamp(p.s ?? hsv.s, 0, 1), v: clamp(p.v ?? hsv.v, 0, 1) }; paint(); emit(); };

  /** A pointer drag inside a box. fx and fy are 0 to 1 inside it. */
  const drag = (box: HTMLElement, f: (fx: number, fy: number, dx: number, dy: number) => void) => {
    const at = (e: PointerEvent) => { const r = box.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; f(clamp(x / r.width, 0, 1), clamp(y / r.height, 0, 1), x - r.width / 2, y - r.height / 2); };
    let on = false;
    box.addEventListener('pointerdown', (e) => { on = true; try { box.setPointerCapture(e.pointerId); } catch { /* not capturable */ } at(e); e.preventDefault(); box.focus(); });
    box.addEventListener('pointermove', (e) => { if (on) at(e); });
    const up = () => { on = false; };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  };
  const marker = (box: HTMLElement) => { const m = document.createElement('i'); m.className = 'pk-mk'; m.setAttribute('aria-hidden', 'true'); box.appendChild(m); return m; };
  const range = (label: string, max: number, get: () => number, set: (n: number) => void, track: () => string, show: (n: number) => string) => {
    const row = document.createElement('label'); row.className = 'pk-row';
    row.innerHTML = '<span class="pk-l"></span><input class="pk-rng" type="range" min="0" max="' + max + '" step="1"><output class="pk-o"></output>';
    (row.querySelector('.pk-l') as HTMLElement).textContent = label;
    const inp = row.querySelector('input') as HTMLInputElement, out = row.querySelector('output') as HTMLOutputElement;
    inp.setAttribute('aria-label', label);
    inp.addEventListener('input', () => set(Number(inp.value)));
    live.push(() => { inp.value = String(Math.round(get())); out.textContent = show(get()); inp.style.setProperty('--track', track()); });
    return row;
  };

  function drawWheel(cv: HTMLCanvasElement) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), S = cv.clientWidth || 176;
    if (cv.width !== Math.round(S * dpr)) { cv.width = cv.height = Math.round(S * dpr); }
    const c = cv.getContext('2d'); if (!c) return;
    const n = cv.width, img = c.createImageData(n, n), R = n / 2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - R, dy = y + 0.5 - R, d = Math.hypot(dx, dy), i = (y * n + x) * 4;
      if (d > R) { img.data[i + 3] = 0; continue; }
      const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, [r, g, b] = rgbOf({ h, s: d / R, v: hsv.v });
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }
  function drawSquare(cv: HTMLCanvasElement) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 200, H = cv.clientHeight || 150;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d'); if (!c) return;
    c.fillStyle = css({ h: hsv.h, s: 1, v: 1 }); c.fillRect(0, 0, cv.width, cv.height);
    const gw = c.createLinearGradient(0, 0, cv.width, 0); gw.addColorStop(0, '#fff'); gw.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gw; c.fillRect(0, 0, cv.width, cv.height);
    const gb = c.createLinearGradient(0, 0, 0, cv.height); gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, '#000'); c.fillStyle = gb; c.fillRect(0, 0, cv.width, cv.height);
  }

  function open(m: Mode) {
    mode = m; try { localStorage.setItem(KEY, m); } catch { /* storage blocked */ }
    live.length = 0; body.textContent = '';
    tabs.querySelectorAll('button').forEach((b) => { const on = b.dataset.m === m; b.setAttribute('aria-selected', String(on)); b.classList.toggle('on', on); b.tabIndex = on ? 0 : -1; });
    if (m === 'wheel') {
      const box = document.createElement('div'); box.className = 'pk-wheel'; box.tabIndex = 0; box.setAttribute('role', 'application');
      box.setAttribute('aria-label', 'Colour wheel. Left and right change the colour, up and down change how strong it is.');
      const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); box.appendChild(cv); const mk = marker(box);
      drag(box, (_x, _y, dx, dy) => { const R = box.clientWidth / 2; change({ h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, s: clamp(Math.hypot(dx, dy) / R, 0, 1) }); });
      box.addEventListener('keydown', (e) => { const k = e.key, st = e.shiftKey ? 10 : 2; if (k === 'ArrowLeft') change({ h: (hsv.h - st + 360) % 360 }); else if (k === 'ArrowRight') change({ h: (hsv.h + st) % 360 }); else if (k === 'ArrowUp') change({ s: hsv.s + st / 100 }); else if (k === 'ArrowDown') change({ s: hsv.s - st / 100 }); else return; e.preventDefault(); });
      body.appendChild(box);
      body.appendChild(range('Brightness', 100, () => hsv.v * 100, (n) => change({ v: n / 100 }), () => 'linear-gradient(90deg,#000,' + css({ ...hsv, v: 1 }) + ')', (n) => Math.round(n) + '%'));
      let last = -1;
      live.push(() => { const R = box.clientWidth / 2, a = (hsv.h * Math.PI) / 180; mk.style.left = R + Math.cos(a) * hsv.s * R + 'px'; mk.style.top = R + Math.sin(a) * hsv.s * R + 'px'; mk.style.background = css(hsv); if (hsv.v !== last) { last = hsv.v; drawWheel(cv); } });
    } else if (m === 'square') {
      const box = document.createElement('div'); box.className = 'pk-square'; box.tabIndex = 0; box.setAttribute('role', 'application');
      box.setAttribute('aria-label', 'Colour square. Left and right change how strong it is, up and down change how bright.');
      const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); box.appendChild(cv); const mk = marker(box);
      drag(box, (fx, fy) => change({ s: fx, v: 1 - fy }));
      box.addEventListener('keydown', (e) => { const k = e.key, st = e.shiftKey ? 0.1 : 0.02; if (k === 'ArrowLeft') change({ s: hsv.s - st }); else if (k === 'ArrowRight') change({ s: hsv.s + st }); else if (k === 'ArrowUp') change({ v: hsv.v + st }); else if (k === 'ArrowDown') change({ v: hsv.v - st }); else return; e.preventDefault(); });
      body.appendChild(box);
      body.appendChild(range('Colour', 360, () => hsv.h, (n) => change({ h: n }), () => RAINBOW, (n) => Math.round(n) + '°'));
      let lastH = -1;
      live.push(() => { mk.style.left = hsv.s * 100 + '%'; mk.style.top = (1 - hsv.v) * 100 + '%'; mk.style.background = css(hsv); if (hsv.h !== lastH) { lastH = hsv.h; drawSquare(cv); } });
    } else {
      body.appendChild(range('Colour', 360, () => hsv.h, (n) => change({ h: n }), () => RAINBOW, (n) => Math.round(n) + '°'));
      body.appendChild(range('Strength', 100, () => hsv.s * 100, (n) => change({ s: n / 100 }), () => 'linear-gradient(90deg,' + css({ ...hsv, s: 0 }) + ',' + css({ ...hsv, s: 1 }) + ')', (n) => Math.round(n) + '%'));
      body.appendChild(range('Brightness', 100, () => hsv.v * 100, (n) => change({ v: n / 100 }), () => 'linear-gradient(90deg,#000,' + css({ ...hsv, v: 1 }) + ')', (n) => Math.round(n) + '%'));
    }
    paint();
  }

  for (const [id, name] of MODES) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.m = id; b.textContent = name; b.setAttribute('role', 'tab');
    b.addEventListener('click', () => open(id)); tabs.appendChild(b);
  }
  tabs.addEventListener('keydown', (e) => {
    const i = MODES.findIndex(([id]) => id === mode), j = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : -1;
    if (j < 0) return; e.preventDefault(); open(MODES[j][0]); (tabs.querySelector('[aria-selected=true]') as HTMLElement | null)?.focus();
  });
  hexIn.addEventListener('input', () => { const v = hexIn.value.trim(); if (RE.test(v)) { hsv = fromHex(v); paint(); emit(); } });
  hexIn.addEventListener('blur', () => { hexIn.value = toHex(hsv).slice(1).toUpperCase(); });
  open(mode);
  // the box has its real size only once it is on the page
  requestAnimationFrame(() => { if (!dead) { live.forEach((f) => f()); } });

  return {
    set(hex: string) { if (!RE.test(String(hex).trim()) || toHex(hsv).toLowerCase() === ('#' + String(hex).trim().replace('#', '')).toLowerCase()) return; hsv = fromHex(hex); paint(); },
    destroy() { dead = true; if (raf) cancelAnimationFrame(raf); host.textContent = ''; },
  };
}
