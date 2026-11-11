/**
 * Voice typing for Coe: speak, and it types.
 * With Coe's server, listening is real speech recognition. Without it (or when today's allowance is used), the browser's own
 * listening is used instead, so voice typing never just stops. Coe does not speak back.
 */
import { token } from './cloud';
import { bumpQuota } from './account';
import type { CoeSettings } from './settings';

export interface VoicePrefs { browser: boolean; lang: string }
const KEY = 'pmc:coe:voice';
export const DEFAULT_PREFS: VoicePrefs = { browser: false, lang: '' };
export function loadPrefs(): VoicePrefs { try { const j = JSON.parse(localStorage.getItem(KEY) || '{}'); return { browser: !!j.browser, lang: typeof j.lang === 'string' ? j.lang : '' }; } catch { return { ...DEFAULT_PREFS }; } }
export function savePrefs(p: VoicePrefs) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked */ } }
const isSafari = () => typeof navigator !== 'undefined' && /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

const base = (s: CoeSettings) => s.serverUrl.trim().replace(/\/+$/, '');
/** Can the real (server) voice be used? */
export const serverVoice = (s: CoeSettings) => s.mode === 'server' && !!s.serverUrl.trim();
export const canListen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
type SR = { new (): { lang: string; interimResults: boolean; continuous: boolean; onresult: (e: any) => void; onerror: (e: any) => void; onend: () => void; start(): void; stop(): void; abort(): void } };
const browserSR = (): SR | null => (typeof window === 'undefined' ? null : ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null));
export const browserListens = () => !!browserSR();
async function headers(s: CoeSettings, ct: string, lang?: string): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'content-type': ct };
  if (s.code.trim()) h['x-coe-code'] = s.code.trim();
  if (lang) h['x-coe-lang'] = lang;
  const t = await token(); if (t) h.authorization = `Bearer ${t}`;
  return h;
}
async function fail(r: Response): Promise<never> {
  let j: any = null; try { j = await r.json(); } catch { /* none */ }
  const e: Error & { code?: string } = new Error(j?.error?.message || 'The voice could not do that.'); e.code = j?.error?.code; throw e;
}

/** Speech in a recording, as text. */
export async function transcribe(s: CoeSettings, blob: Blob, lang = ''): Promise<string> {
  const r = await fetch(base(s) + '/transcribe', { method: 'POST', headers: await headers(s, blob.type.split(';')[0] || 'audio/webm', lang), body: blob });
  if (!r.ok) await fail(r);
  bumpQuota('voice');
  return String((await r.json()).text || '').trim();
}
/**
 * Listens through the microphone until the person has finished a sentence (a pause after speech), then returns the recording.
 * Resolves null if nothing was said for a while. onLevel gets 0..1 about 20 times a second.
 */
export async function listen(opts: { onLevel?: (v: number) => void; signal?: AbortSignal; waitMs?: number; silenceMs?: number; maxMs?: number; manual?: boolean } = {}): Promise<{ blob: Blob | null; stop: () => void }> {
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) {
    const n = (e as Error).name;
    throw Object.assign(new Error(n === 'NotAllowedError' || n === 'SecurityError' ? 'The microphone is blocked. Allow it with the icon in the address bar. On a Mac also check System Settings > Privacy & Security > Microphone and tick your browser.' : n === 'NotFoundError' ? 'No microphone was found. Plug one in and try again.' : 'The microphone could not start (' + ((e as Error).message || n) + ').'), { mic: n === 'NotAllowedError' || n === 'SecurityError' ? 'blocked' : n === 'NotFoundError' ? 'none' : undefined });
  }
  const order = isSafari() ? ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  const mime = order.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunksOut: Blob[] = []; rec.ondataavailable = (e) => { if (e.data.size) chunksOut.push(e.data); };
  const AC = window.AudioContext || (window as any).webkitAudioContext; const ac = new AC(); if (ac.state === 'suspended') await ac.resume().catch(() => {});   // a suspended context reads silence, so nothing would ever be heard
  const src = ac.createMediaStreamSource(stream); const an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  let heard = false, lastVoice = 0, t0 = performance.now(), floor = 0.01, n = 0, ended = false, iv = 0; let finish: () => void = () => {};
  const end = new Promise<void>((r) => { finish = r; });
  const stop = () => { if (!ended) { ended = true; finish(); } };
  opts.signal?.addEventListener('abort', stop);
  rec.start(250);
  iv = window.setInterval(() => {
    an.getByteTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
    const rms = Math.sqrt(sum / buf.length); opts.onLevel?.(Math.min(1, rms * 5));
    const now = performance.now(); n++;
    // The room's noise level is the quietest recent moment: it falls at once and rises only slowly,
    // so talking straight away (before the level is learnt) can't deafen the listener.
    if (n === 1) floor = Math.min(rms, 0.04); else floor = rms < floor ? rms : Math.min(0.04, floor + (rms - floor) * 0.003);
    const thr = Math.max(0.025, floor * 2.6, floor + 0.015);
    if (rms > thr) { if (!heard) heard = true; lastVoice = now; }
    if (opts.manual) return;
    if (heard && now - lastVoice > (opts.silenceMs ?? 1300)) stop();
    else if (!heard && now - t0 > (opts.waitMs ?? 15000)) stop();
    else if (now - t0 > (opts.maxMs ?? 60000)) stop();
  }, 50);
  await end;
  clearInterval(iv);
  const blob: Blob | null = await new Promise((res) => { rec.onstop = () => res((heard || opts.manual) && chunksOut.length ? new Blob(chunksOut, { type: rec.mimeType || mime || 'audio/webm' }) : null); try { rec.stop(); } catch { res(null); } });
  stream.getTracks().forEach((t) => t.stop()); void ac.close();
  return { blob, stop };
}
/** For a stop button: starts listening and hands back a way to stop it early. */
export function listening(opts: Parameters<typeof listen>[0] = {}) {
  const ctl = new AbortController();
  const p = listen({ ...opts, signal: ctl.signal });
  return { stop: () => ctl.abort(), result: p.then((r) => r.blob) };
}

/** The browser's own speech recognition, one sentence. Resolves '' when nothing was heard. */
export function browserListen(lang = '', onInterim?: (t: string) => void): { stop: () => void; result: Promise<string> } {
  const R = browserSR(); if (!R) return { stop: () => {}, result: Promise.reject(new Error('This browser cannot listen.')) };
  const r = new R(); r.interimResults = true; r.continuous = false; if (lang) r.lang = lang;
  let text = '';
  const result = new Promise<string>((res, rej) => {
    r.onresult = (e: any) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; text = t; onInterim?.(t); };
    r.onerror = (e: any) => { if (e.error === 'no-speech' || e.error === 'aborted') res(text); else rej(Object.assign(new Error(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'The microphone is blocked. Allow it in the address bar.' : 'This browser could not listen (' + e.error + ').'), { mic: e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'blocked' : e.error === 'audio-capture' ? 'none' : undefined })); };
    r.onend = () => res(text);
  });
  try { r.start(); } catch { /* already running */ }
  return { stop: () => { try { r.stop(); } catch { /* ignore */ } }, result };
}

