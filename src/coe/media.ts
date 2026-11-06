/**
 * Sound and video in. Audio is turned into words by the Worker's speech-to-text; a video gives a few frames (read as pictures) and its soundtrack as words.
 * Everything is cut up in the browser, so only the sound that is transcribed leaves the device.
 */
import { transcribe } from '@/lib/coe/voice';
import { analyseSound, describeSound } from '@/lib/coe/hear';
import type { CoeSettings } from '@/lib/coe/settings';
import type { PlanKey } from '@/lib/coe/models';
import type { Attach } from './store';

export const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|oga|opus|flac|aac|weba|webm|mpga)$/i;
export const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/i;
export const isAudio = (f: File) => f.type.startsWith('audio/') || (!f.type.startsWith('video/') && AUDIO_EXT.test(f.name) && !/\.webm$/i.test(f.name));
export const isVideo = (f: File) => f.type.startsWith('video/') || VIDEO_EXT.test(f.name);
export const MEDIA_KINDS = 'audio/*,video/*,.mp3,.m4a,.wav,.ogg,.flac,.aac,.mp4,.mov,.webm,.mkv';

const SEND_AS_IS: Record<string, string> = { 'audio/mpeg': 'audio/mpeg', 'audio/mp3': 'audio/mpeg', 'audio/wav': 'audio/wav', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/mp4': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'audio/x-m4a': 'audio/mp4', 'audio/webm': 'audio/webm' };
const LIMIT: Record<PlanKey, { direct: number; bigFile: number; minutes: number }> = { free: { direct: 5.5e6, bigFile: 40e6, minutes: 6 }, pro: { direct: 23e6, bigFile: 150e6, minutes: 40 } };
const SLICE = 170;           // seconds per piece when a recording has to be cut up (16 kHz mono 16-bit is about 5.4 MB)
const RATE = 16000;

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function wav(samples: Float32Array): Blob {
  const n = samples.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([b], { type: 'audio/wav' });
}

/** The sound of a file as 16 kHz mono samples. Throws if the browser cannot open it. */
async function samplesOf(file: Blob): Promise<Float32Array> {
  const AC = window.AudioContext || (window as any).webkitAudioContext; const ac = new AC();
  try {
    const decoded = await ac.decodeAudioData(await file.arrayBuffer());
    const len = Math.max(1, Math.ceil(decoded.duration * RATE));
    const off = new OfflineAudioContext(1, len, RATE); const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    return (await off.startRendering()).getChannelData(0).slice();
  } finally { void ac.close(); }
}

/** The words in an audio (or video) file, with a time stamp for each piece. */
export async function transcribeFile(s: CoeSettings, file: File, plan: PlanKey, onStep?: (t: string) => void): Promise<{ text: string; seconds: number }> {
  const lim = LIMIT[plan], type = (file.type || '').split(';')[0].toLowerCase(), asIs = SEND_AS_IS[type];
  if (asIs && file.size <= lim.direct) {
    onStep?.(`Listening to ${file.name}…`);
    return { text: await transcribe(s, new Blob([file], { type: asIs })), seconds: 0 };
  }
  if (file.size > lim.bigFile) throw new Error(`${file.name} is bigger than ${Math.round(lim.bigFile / 1e6)} MB.${plan === 'free' ? ' Pro takes much longer recordings.' : ''}`);
  onStep?.(`Opening ${file.name}…`);
  let pcm: Float32Array;
  try { pcm = await samplesOf(file); } catch { throw new Error(`${file.name} could not be opened for listening. Try mp3, m4a, wav or webm.`); }
  const seconds = pcm.length / RATE;
  if (seconds > lim.minutes * 60) throw new Error(`${file.name} is ${Math.round(seconds / 60)} minutes long. ${plan === 'free' ? 'Free listens to about 6 minutes. Pro listens to 40.' : 'Coe listens to 40 minutes at a time. Try a shorter piece.'}`);
  const parts: string[] = [], per = SLICE * RATE;
  for (let i = 0, k = 0; i < pcm.length; i += per, k++) {
    onStep?.(`Listening to ${file.name} (${clock(i / RATE)} of ${clock(seconds)})…`);
    const t = await transcribe(s, wav(pcm.subarray(i, Math.min(pcm.length, i + per))));
    if (t) parts.push(seconds > SLICE ? `[${clock(i / RATE)}] ${t}` : t);
  }
  return { text: parts.join('\n\n'), seconds };
}

/** A recording attached as words. */
export async function readAudio(s: CoeSettings, file: File, plan: PlanKey, limit: number, onStep?: (t: string) => void): Promise<Attach> {
  let words = '', seconds = 0, why = '';
  try { const r = await transcribeFile(s, file, plan, onStep); words = r.text; seconds = r.seconds; } catch (e) { why = (e as Error).message; }
  // Music and noise have no words, but they can still be measured: tempo, key, loudness, and what kind of sound it is.
  let measured = '';
  if (file.size <= 25e6) try { onStep?.(`Measuring ${file.name}…`); const rep = await analyseSound(file); measured = describeSound(rep); seconds = seconds || rep.seconds; } catch { /* could not be opened to measure */ }
  if (!words.trim() && !measured) throw new Error(why || `No speech could be heard in ${file.name}.`);
  const head = words.trim() ? `Speech:\n${words}` : 'No speech was heard, so this is music or noise.';
  const full = measured ? `${head}\n\n${measured}` : head;
  const cut = full.length > limit;
  return { name: file.name, kind: words.trim() ? 'Audio' : 'Sound', chars: full.length, text: cut ? full.slice(0, limit) : full, cut: cut || undefined, note: seconds ? `${clock(seconds)} long` : undefined };
}

/** Evenly spaced frames from a video, as JPEG files. */
export async function videoFrames(file: File, count: number): Promise<{ frames: File[]; seconds: number; width: number; height: number }> {
  const url = URL.createObjectURL(file); const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
  try {
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error(`${file.name} could not be opened as a video. Try mp4 or webm.`)); setTimeout(() => rej(new Error(`${file.name} took too long to open.`)), 20000); });
    const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    const k = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight, 1)), w = Math.max(2, Math.round(v.videoWidth * k)), h = Math.max(2, Math.round(v.videoHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!;
    const n = d ? Math.max(1, count) : 1, frames: File[] = [];
    for (let i = 0; i < n; i++) {
      const at = d ? Math.min(d - 0.05, (d * (i + 0.5)) / n) : 0;
      if (d) { await new Promise<void>((res, rej) => { v.onseeked = () => res(); v.onerror = () => rej(new Error('seek')); v.currentTime = at; setTimeout(res, 4000); }); }
      x.drawImage(v, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82));
      if (blob) frames.push(new File([blob], `${file.name.replace(/\.[^.]+$/, '')} at ${clock(at)}.jpg`, { type: 'image/jpeg' }));
    }
    return { frames, seconds: d, width: v.videoWidth, height: v.videoHeight };
  } finally { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); }
}
