/** The profile picture: one small square picture that follows the account, so Coe and Coe Mini show the same one. Saved on this device too, so it works signed out. */
const KEY = 'pmc:coe:avatar';
/** img is a small picture as text (a data URL). An empty img means the picture was taken away (so removing it follows the account too). */
export interface Avatar { at: number; img: string }

const okImg = (v: unknown): v is string => typeof v === 'string' && (v === '' || (/^data:image\/(png|jpe?g|webp);base64,/.test(v) && v.length < 120000));
export const validAvatar = (a: unknown): a is Avatar => !!a && typeof (a as Avatar).at === 'number' && okImg((a as Avatar).img);

export function loadAvatar(): Avatar | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return validAvatar(v) ? v : null; } catch { return null; }
}
export const avatarImg = (): string => loadAvatar()?.img || '';
export function saveAvatar(img: string, at: number = Date.now()) {
  try { localStorage.setItem(KEY, JSON.stringify({ at, img })); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new Event('pmc:coe-avatar')); } catch { /* no window */ }
}
/** Signing out takes the picture off this device only. The account keeps it, and it comes back when you sign in again. (Saving an empty picture would count as removing it from the account.) */
export function forgetAvatar() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new Event('pmc:coe-avatar')); } catch { /* no window */ }
}
export const onAvatar = (fn: () => void) => { window.addEventListener('pmc:coe-avatar', fn); return () => window.removeEventListener('pmc:coe-avatar', fn); };

/** Any picture becomes a 192 by 192 square (cropped from the middle), small enough to keep in the account. */
export async function fileToAvatar(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.type)) throw new Error('Pick a picture (PNG, JPG or WebP).');
  if (file.size > 12e6) throw new Error('That picture is too big. Pick one under 12 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That picture could not be opened.')); i.src = url; });
    const N = 192, c = document.createElement('canvas'); c.width = c.height = N;
    const side = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
    const g = c.getContext('2d'); if (!g) throw new Error('This browser cannot resize pictures.');
    g.fillStyle = '#fff'; g.fillRect(0, 0, N, N); g.drawImage(img, sx, sy, side, side, 0, 0, N, N);
    let out = c.toDataURL('image/webp', 0.85); if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.85);
    if (!okImg(out)) throw new Error('That picture could not be used. Try another.');
    return out;
  } finally { URL.revokeObjectURL(url); }
}
