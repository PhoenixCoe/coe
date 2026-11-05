import type { Img } from './store';

const MAX_SIDE = 1568, KEEP_BELOW = 700 * 1024, OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const readB64 = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = () => rej(new Error('read')); r.readAsDataURL(blob); });

/** A picture ready to send: small pictures are kept as they are, big ones are shrunk to a sensible size first. */
export async function toImg(file: File): Promise<Img> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not a picture.`);
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} is bigger than 20 MB.`);
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { throw new Error(`${file.name} could not be opened. Try a PNG or JPEG.`); }
  const long = Math.max(bmp.width, bmp.height);
  if (OK.includes(file.type) && file.size <= KEEP_BELOW && long <= MAX_SIDE) { bmp.close(); return { name: file.name, type: file.type, data: await readB64(file) }; }
  const k = Math.min(1, MAX_SIDE / long), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h); bmp.close();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.86));
  if (!blob) throw new Error(`${file.name} could not be shrunk.`);
  return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', data: await readB64(blob) };
}
