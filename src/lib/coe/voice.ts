/**
 * Voice for Coe: listening, and speaking back.
 * With Coe's server, listening is real speech recognition and speaking uses natural voices. Without it (or when today's
 * allowance is used), the browser's own speech is used instead, so voice never just stops.
 */
import { token } from './cloud';
import { bumpQuota } from './account';
import type { CoeSettings } from './settings';

export const VOICES: { id: string; name: string; note: string }[] = [
  { id: 'marin', name: 'Marin', note: 'Warm and natural. Best quality.' },
  { id: 'cedar', name: 'Cedar', note: 'Deep and calm. Best quality.' },
  { id: 'coral', name: 'Coral', note: 'Friendly and bright' },
  { id: 'sage', name: 'Sage', note: 'Calm and clear' },
  { id: 'nova', name: 'Nova', note: 'Energetic' },
  { id: 'shimmer', name: 'Shimmer', note: 'Soft and gentle' },
  { id: 'alloy', name: 'Alloy', note: 'Neutral' },
  { id: 'ash', name: 'Ash', note: 'Warm, a little gravelly' },
  { id: 'ballad', name: 'Ballad', note: 'Smooth and expressive' },
  { id: 'echo', name: 'Echo', note: 'Clear and steady' },
  { id: 'fable', name: 'Fable', note: 'A storyteller' },
  { id: 'onyx', name: 'Onyx', note: 'Deep and strong' },
  { id: 'verse', name: 'Verse', note: 'Lively' },
];
export const STYLES: { id: string; name: string; say: string }[] = [
  { id: 'natural', name: 'Natural', say: '' },
  { id: 'tutor', name: 'Calm tutor', say: 'Speak like a patient, encouraging teacher. Clear and unhurried.' },
  { id: 'cheerful', name: 'Cheerful', say: 'Sound upbeat, warm and friendly.' },
  { id: 'brit', name: 'British', say: 'Speak with a clear British accent, relaxed and friendly.' },
  { id: 'story', name: 'Storyteller', say: 'Read like a storyteller: expressive, with natural pauses.' },
  { id: 'whisper', name: 'Whisper', say: 'Speak softly, almost whispering.' },
];
export interface VoicePrefs { voice: string; speed: number; style: string; browser: boolean; lang: string; auto: boolean; hands: boolean }
const KEY = 'pmc:coe:voice';
export const DEFAULT_PREFS: VoicePrefs = { voice: 'marin', speed: 1, style: 'natural', browser: false, lang: '', auto: false, hands: true };
export function loadPrefs(): VoicePrefs { try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_PREFS }; } }
export function savePrefs(p: VoicePrefs) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked */ } }

/** Added to the system prompt while voice mode is on. */
export const VOICE_PROMPT = 'The person is talking to you out loud, and your reply will be read aloud. Reply the way a friendly person talks: short, natural sentences, no more than a few. No Markdown, no bullet lists, no tables, no emoji, no headings. Say maths in words ("x squared plus three"). Do not read out code or links; say what the code does and that it is on screen. If the answer is long, give the short version and offer to go on.';
let voiceOn = false;
let shared: AudioContext | null = null;
/** One audio context for the wave, made while the person's tap is still fresh so the browser lets it run. */
function sharedCtx(): AudioContext | null {
  try { if (!shared || shared.state === 'closed') { const AC = window.AudioContext || (window as any).webkitAudioContext; shared = new AC(); } if (shared!.state === 'suspended') void shared!.resume(); return shared; } catch { return null; }
}
export const setVoiceActive = (v: boolean) => { voiceOn = v; if (v) sharedCtx(); };

/** Sound strength in n bands from low to high voice pitch, each 0..1. */
export function bandsOf(an: AnalyserNode, rate: number, f: Uint8Array<ArrayBuffer>, n: number): number[] {
  an.getByteFrequencyData(f);
  const hz = rate / an.fftSize, lo = 90, hi = Math.min(7000, rate / 2 - 1), out: number[] = [];
  for (let b = 0; b < n; b++) {
    const a = Math.max(1, Math.floor(lo * Math.pow(hi / lo, b / n) / hz)), z = Math.max(a + 1, Math.ceil(lo * Math.pow(hi / lo, (b + 1) / n) / hz));
    let m = 0; for (let i = a; i < z && i < f.length; i++) m = Math.max(m, f[i]);
    out.push(Math.min(1, Math.pow(m / 255, 1.5) * 1.5));
  }
  return out;
}
export const voiceActive = () => voiceOn;

const base = (s: CoeSettings) => s.serverUrl.trim().replace(/\/+$/, '');
/** Can the real (server) voice be used? */
export const serverVoice = (s: CoeSettings) => s.mode === 'server' && !!s.serverUrl.trim();
export const canListen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
type SR = { new (): { lang: string; interimResults: boolean; continuous: boolean; onresult: (e: any) => void; onerror: (e: any) => void; onend: () => void; start(): void; stop(): void; abort(): void } };
const browserSR = (): SR | null => (typeof window === 'undefined' ? null : ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null));
export const browserListens = () => !!browserSR();
export const browserSpeaks = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

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
/** A spoken version of the text, as a sound. */
export async function speechBlob(s: CoeSettings, text: string, p: VoicePrefs, signal?: AbortSignal): Promise<Blob> {
  const style = STYLES.find((x) => x.id === p.style)?.say || '';
  const r = await fetch(base(s) + '/speak', { method: 'POST', headers: await headers(s, 'application/json'), body: JSON.stringify({ text, voice: p.voice, speed: p.speed, style }), signal });
  if (!r.ok) await fail(r);
  bumpQuota('voice');
  return await r.blob();
}

/** What is worth saying aloud from a reply: no code, links, tables or tool blocks, and maths turned into words. */
export function forSpeech(md: string): string {
  let t = md.replace(/```coe-(?:tool|plan)[\s\S]*?```/g, ' ').replace(/```[\s\S]*?(```|$)/g, ' (the code is on screen) ').replace(/`([^`]+)`/g, '$1');
  t = t.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_, a, b) => ' ' + mathWords(a ?? b) + ' ').replace(/\\\(([\s\S]+?)\\\)|\$([^\s$][^$\n]*?)\$/g, (_, a, b) => ' ' + mathWords(a ?? b) + ' ');
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*\d+[.)]\s+/gm, '').replace(/^#{1,6}\s*/gm, '').replace(/[*_~>]+/g, '')
    .replace(/<[^>]+>/g, ' ');
  return t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s*\n\s*/g, '. ').replace(/([:;,])\s*\./g, '$1').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
}
function mathWords(tex: string): string {
  let s = ' ' + tex + ' ';
  const rep: [RegExp, string][] = [
    [/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' $1 over $2 '], [/\\sqrt\s*\{([^{}]*)\}/g, ' square root of $1 '], [/\\sqrt\s*(\w)/g, ' square root of $1 '],
    [/\^\s*\{?2\}?/g, ' squared '], [/\^\s*\{?3\}?/g, ' cubed '], [/\^\s*\{([^{}]*)\}/g, ' to the power $1 '], [/\^\s*(\w)/g, ' to the power $1 '], [/_\s*\{([^{}]*)\}/g, ' sub $1 '], [/_\s*(\w)/g, ' sub $1 '],
    [/\\times|\\cdot/g, ' times '], [/\\div/g, ' divided by '], [/\\pm/g, ' plus or minus '], [/\\leq?|\\le\b/g, ' is less than or equal to '], [/\\geq?|\\ge\b/g, ' is greater than or equal to '], [/\\neq/g, ' is not equal to '], [/\\approx/g, ' is approximately '],
    [/\\pi/g, ' pi '], [/\\theta/g, ' theta '], [/\\alpha/g, ' alpha '], [/\\beta/g, ' beta '], [/\\infty/g, ' infinity '], [/\\int/g, ' the integral of '], [/\\sum/g, ' the sum of '], [/\\to|\\rightarrow/g, ' goes to '], [/\\left|\\right|\\,|\;|\\!/g, ' '],
    [/=/g, ' equals '], [/\+/g, ' plus '], [/(\w)\s*-\s*(\w)/g, '$1 minus $2'], [/\\[a-zA-Z]+/g, ' '], [/[{}\\]/g, ' '],
  ];
  for (const [a, b] of rep) s = s.replace(a, b);
  return s.replace(/\s{2,}/g, ' ').trim();
}
/** Cuts text into pieces for speaking: a short first piece so it starts quickly, then bigger ones. */
export function chunks(t: string): string[] {
  const parts = t.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [t], out: string[] = []; let cur = '';
  for (const p of parts) { const lim = out.length === 0 ? 260 : 1400; if (cur && (cur + p).length > lim) { out.push(cur.trim()); cur = ''; } cur += p; }
  if (cur.trim()) out.push(cur.trim());
  return out.slice(0, 4);
}

export interface Speaking { stop: () => void; done: Promise<{ fallback: boolean; error?: string }> }
/** Says the text. Uses the natural voice, and the browser's voice if that cannot be reached. */
export function speak(s: CoeSettings, text: string, p: VoicePrefs, hooks: { onStart?: () => void; onSpectrum?: (b: number[]) => void } = {}): Speaking {
  const ctl = new AbortController(); let audio: HTMLAudioElement | null = null; let stopped = false; let synth = false;
  // Follow the real sound with the wave when the browser allows it. Never route the audio through a context that is not running, or it would be silent.
  let an: AnalyserNode | null = null, iv = 0; const fb = new Uint8Array(512);
  const tap = (a: HTMLAudioElement) => {
    if (!hooks.onSpectrum) return;
    try {
      const ac = sharedCtx(); if (!ac || ac.state !== 'running') return;
      const src = ac.createMediaElementSource(a), node = ac.createAnalyser(); node.fftSize = 1024; src.connect(node); node.connect(ac.destination); an = node;
      if (!iv) iv = window.setInterval(() => { if (an) hooks.onSpectrum!(bandsOf(an, ac.sampleRate, fb, 24)); }, 50);
    } catch { /* no wave from the real sound; the wave is made up instead */ }
  };
  const untap = () => { if (iv) { clearInterval(iv); iv = 0; } an = null; hooks.onSpectrum?.(new Array(24).fill(0)); };
  const say = forSpeech(text);
  const stop = () => { stopped = true; ctl.abort(); if (audio) { audio.pause(); audio.src = ''; } if (synth) window.speechSynthesis.cancel(); untap(); };
  const browserSay = (t: string) => new Promise<void>((res) => {
    if (!browserSpeaks() || !t) { res(); return; }
    synth = true; const u = new SpeechSynthesisUtterance(t); u.rate = p.speed; if (p.lang) u.lang = p.lang;
    u.onend = () => res(); u.onerror = () => res(); hooks.onStart?.(); window.speechSynthesis.speak(u);
  });
  const done = (async () => {
    if (!say) return { fallback: false };
    if (p.browser || !serverVoice(s)) { await browserSay(say); return { fallback: true }; }
    const parts = chunks(say); let started = false;
    try {
      let next = speechBlob(s, parts[0], p, ctl.signal);
      for (let i = 0; i < parts.length && !stopped; i++) {
        const blob = await next;
        next = i + 1 < parts.length ? speechBlob(s, parts[i + 1], p, ctl.signal) : Promise.resolve(blob);
        next.catch(() => {});
        if (stopped) break;
        const url = URL.createObjectURL(blob); audio = new Audio(url); tap(audio);
        await new Promise<void>((res, rej) => { audio!.onended = () => res(); audio!.onerror = () => rej(new Error('The sound could not play.')); audio!.play().then(() => { if (!started) { started = true; hooks.onStart?.(); } }, rej); });
        URL.revokeObjectURL(url);
      }
      return { fallback: false };
    } catch (e) {
      if (stopped) return { fallback: false };
      if (started) return { fallback: false, error: (e as Error).message };
      await browserSay(say);
      return { fallback: true, error: (e as Error).message };
    }
  })();
  void done.then(untap, untap);
  return { stop, done };
}

/**
 * Listens through the microphone until the person has finished a sentence (a pause after speech), then returns the recording.
 * Resolves null if nothing was said for a while. onLevel gets 0..1 about 20 times a second.
 */
export async function listen(opts: { onLevel?: (v: number) => void; onSpectrum?: (b: number[]) => void; signal?: AbortSignal; waitMs?: number; silenceMs?: number; maxMs?: number; manual?: boolean } = {}): Promise<{ blob: Blob | null; stop: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunksOut: Blob[] = []; rec.ondataavailable = (e) => { if (e.data.size) chunksOut.push(e.data); };
  const AC = window.AudioContext || (window as any).webkitAudioContext; const ac = new AC(); const src = ac.createMediaStreamSource(stream); const an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
  const buf = new Uint8Array(an.fftSize), fbuf = new Uint8Array(an.frequencyBinCount);
  let heard = false, lastVoice = 0, t0 = performance.now(), floor = 0.01, n = 0, ended = false, iv = 0; let finish: () => void = () => {};
  const end = new Promise<void>((r) => { finish = r; });
  const stop = () => { if (!ended) { ended = true; finish(); } };
  opts.signal?.addEventListener('abort', stop);
  rec.start(250);
  iv = window.setInterval(() => {
    an.getByteTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
    const rms = Math.sqrt(sum / buf.length); opts.onLevel?.(Math.min(1, rms * 5)); if (opts.onSpectrum) opts.onSpectrum(bandsOf(an, ac.sampleRate, fbuf, 24));
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
  const blob: Blob | null = await new Promise((res) => { rec.onstop = () => res(heard && chunksOut.length ? new Blob(chunksOut, { type: rec.mimeType || 'audio/webm' }) : null); try { rec.stop(); } catch { res(null); } });
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
    r.onerror = (e: any) => { if (e.error === 'no-speech' || e.error === 'aborted') res(text); else rej(new Error(e.error === 'not-allowed' ? 'The microphone is blocked. Allow it in the address bar.' : 'This browser could not listen (' + e.error + ').')); };
    r.onend = () => res(text);
  });
  try { r.start(); } catch { /* already running */ }
  return { stop: () => { try { r.stop(); } catch { /* ignore */ } }, result };
}
