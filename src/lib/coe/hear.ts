/**
 * Listening to sound. Two honest parts:
 *  1. Measuring, in the browser: loudness, tempo, key, which notes, how much bass or treble, steady noise or sharp hits, and a rough split by pitch range.
 *     Nothing leaves the device for this.
 *  2. Naming, by an AI that can hear (the Worker's /hear): which instruments, voices and noises are in it. That is a guess from a model, not a measurement,
 *     and it only hears the first 30 seconds you choose.
 * Splitting a song into real instrument tracks needs a very large model and is not done here; the pitch-range split is only a rough filter.
 */
import { token } from './cloud';
import type { CoeSettings } from './settings';

export interface SoundReport {
  seconds: number; analysed: number; loudnessDb: number; peakDb: number; silencePct: number;
  bpm: number | null; beat: 'steady' | 'loose' | 'none'; key: string | null; notes: string[];
  bands: { low: number; mid: number; high: number }; tonalPct: number; hitsPerSec: number; centroid: number;
  timeline: number[]; character: string; balance: string;
}
export interface Heard { summary?: string; instruments?: { name: string; confidence?: string; role?: string }[]; voices?: string[]; noises?: string[]; setting?: string; notes?: string }

const SR = 22050, FRAME = 2048, HOP = 512, MAX_SECONDS = 120;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

async function decode(file: Blob): Promise<AudioBuffer> {
  const AC = window.AudioContext || (window as any).webkitAudioContext; const ac = new AC();
  try { return await ac.decodeAudioData(await file.arrayBuffer()); } finally { void ac.close(); }
}
async function mono(buf: AudioBuffer, rate: number, from = 0, seconds = MAX_SECONDS): Promise<Float32Array> {
  const start = Math.max(0, Math.min(buf.duration, from)), len = Math.max(1, Math.ceil(Math.min(seconds, buf.duration - start) * rate));
  const off = new OfflineAudioContext(1, len, rate); const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start(0, start);
  return (await off.startRendering()).getChannelData(0).slice();
}
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -90);
const corr = (a: number[], b: number[]) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let s = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return va && vb ? s / Math.sqrt(va * vb) : 0; };

/** Measures a sound. Throws if the browser cannot open the file. */
/** A row of bar heights between 0 and 1 for drawing a wave: the loudest moment in each slice of the sound. */
export async function peaksOf(file: Blob, bars = 64): Promise<number[]> {
  const buf = await decode(file), ch = buf.getChannelData(0), size = Math.max(1, Math.floor(ch.length / bars)), out: number[] = [];
  for (let i = 0; i < bars; i++) { let m = 0; for (let j = i * size, e = Math.min(ch.length, j + size), k = j; k < e; k += Math.max(1, size >> 6)) m = Math.max(m, Math.abs(ch[k])); out.push(m); }
  const top = Math.max(...out, 0.0001);
  return out.map((v) => Math.max(0.06, Math.sqrt(v / top)));
}

export async function analyseSound(file: Blob, onStep?: (t: string) => void): Promise<SoundReport> {
  onStep?.('Opening the sound…');
  const buf = await decode(file), seconds = buf.duration;
  const x = await mono(buf, SR), analysed = x.length / SR;
  onStep?.('Measuring it…');
  const win = new Float32Array(FRAME); for (let i = 0; i < FRAME; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const re = new Float32Array(FRAME), im = new Float32Array(FRAME), half = FRAME / 2, binHz = SR / FRAME;
  const nFrames = Math.max(1, Math.floor((x.length - FRAME) / HOP) + 1);
  const prev = new Float32Array(half), flux: number[] = [], rms: number[] = [], chroma = new Array(12).fill(0);
  let eLow = 0, eMid = 0, eHigh = 0, flatTonal = 0, flatCount = 0, cent = 0, centN = 0, peak = 0;
  for (let f = 0; f < nFrames; f++) {
    const o = f * HOP; let sq = 0;
    for (let i = 0; i < FRAME; i++) { const v = x[o + i] || 0; sq += v * v; const a = Math.abs(v); if (a > peak) peak = a; re[i] = v * win[i]; im[i] = 0; }
    rms.push(Math.sqrt(sq / FRAME));
    fft(re, im);
    let fl = 0, lg = 0, ar = 0, nb = 0, cs = 0, ms = 0;
    for (let k = 1; k < half; k++) {
      const m = Math.hypot(re[k], im[k]), hz = k * binHz, lm = Math.log1p(m * 20);
      const d = lm - prev[k]; if (d > 0) fl += d; prev[k] = lm;
      const p = m * m;
      if (hz < 250) eLow += p; else if (hz < 2000) eMid += p; else eHigh += p;
      if (hz >= 100 && hz <= 8000) { lg += Math.log(m + 1e-9); ar += m; nb++; cs += hz * m; ms += m; }
      if (hz >= 55 && hz <= 2000 && f % 2 === 0) { const pc = (((Math.round(12 * Math.log2(hz / 440) + 69) % 12) + 12) % 12); chroma[pc] += m; }
    }
    flux.push(fl);
    if (rms[f] > 0.004 && nb) { const flat = Math.exp(lg / nb) / (ar / nb + 1e-9); flatCount++; if (flat < 0.2) flatTonal++; if (ms) { cent += cs / ms; centN++; } }
  }
  // loudness and silence
  const loud = rms.filter((r) => r > 0.004), avg = loud.length ? Math.sqrt(loud.reduce((a, r) => a + r * r, 0) / loud.length) : 0;
  const silencePct = Math.round((100 * rms.filter((r) => r <= 0.004).length) / rms.length);
  const slices = 12, per = Math.max(1, Math.floor(rms.length / slices));
  const timeline = Array.from({ length: slices }, (_, s) => { const part = rms.slice(s * per, (s + 1) * per); const m = part.length ? Math.sqrt(part.reduce((a, r) => a + r * r, 0) / part.length) : 0; return Math.round(db(m)); });
  // tempo: how often the onset envelope repeats
  let bpm: number | null = null, beat: SoundReport['beat'] = 'none';
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length, env = flux.map((v) => Math.max(0, v - mean)), fps = SR / HOP;
  const ac = (lag: number) => { let s = 0; for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag]; return s / Math.max(1, env.length - lag); };
  const ac0 = ac(0);
  if (ac0 > 0 && env.length > fps * 4) {
    let best = 0, bl = 0;
    for (let lag = Math.floor((fps * 60) / 190); lag <= Math.ceil((fps * 60) / 60); lag++) {
      const b = (60 * fps) / lag, prior = Math.exp(-0.5 * (Math.log2(b / 112) / 0.9) ** 2), v = ac(lag) * prior;
      if (v > best) { best = v; bl = lag; }
    }
    if (bl) {
      const y0 = ac(bl - 1), y1 = ac(bl), y2 = ac(bl + 1), den = y0 - 2 * y1 + y2, lag = bl + (den ? (0.5 * (y0 - y2)) / den : 0), r = y1 / ac0;
      bpm = Math.round((60 * fps) / lag);
      beat = r > 0.3 ? 'steady' : r > 0.14 ? 'loose' : 'none'; if (beat === 'none') bpm = null;
    }
  }
  // hits per second: peaks in the onset envelope
  const sd = Math.sqrt(env.reduce((a, v) => a + (v - 0) ** 2, 0) / env.length) || 1; let hits = 0;
  for (let i = 1; i < env.length - 1; i++) if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > sd * 1.4) hits++;
  const hitsPerSec = +(hits / Math.max(1, analysed)).toFixed(1);
  // key
  const cs = chroma.reduce((a, b) => a + b, 0), norm = chroma.map((c) => (cs ? c / cs : 0));
  let key: string | null = null, kr = 0;
  for (let t = 0; t < 12; t++) {
    const rot = (p: number[]) => p.map((_, i) => p[(i - t + 12) % 12]);
    const a = corr(norm, rot(MAJOR)), b = corr(norm, rot(MINOR));
    if (a > kr) { kr = a; key = `${NAMES[t]} major`; } if (b > kr) { kr = b; key = `${NAMES[t]} minor`; }
  }
  if (kr < 0.62 || cs <= 0) key = null;
  const notes = norm.map((v, i) => ({ v, n: NAMES[i] })).sort((a, b) => b.v - a.v).slice(0, 3).filter((o) => o.v > 0.1).map((o) => o.n);
  const tot = eLow + eMid + eHigh || 1, bands = { low: Math.round((100 * eLow) / tot), mid: Math.round((100 * eMid) / tot), high: Math.round((100 * eHigh) / tot) };
  bands.high = Math.max(0, 100 - bands.low - bands.mid);
  const tonalPct = flatCount ? Math.round((100 * flatTonal) / flatCount) : 0, centroid = centN ? Math.round(cent / centN) : 0;
  const balance = bands.low > 55 ? 'bass-heavy' : bands.high > 35 || centroid > 3000 ? 'bright, with a lot of treble' : bands.mid > 60 ? 'mostly mid-range, where voices and most instruments sit' : 'fairly even from bass to treble';
  const character = tonalPct >= 55 && hitsPerSec < 3 ? 'mostly held, pitched sounds (like voices, strings, keys, pads or synths)'
    : tonalPct >= 40 && hitsPerSec >= 3 ? 'pitched sounds with a clear rhythm (like a band or a song)'
    : hitsPerSec >= 3 ? 'sharp, repeated hits with little pitch (like drums, clapping, typing or footsteps)'
    : tonalPct < 25 ? 'steady, unpitched noise (like wind, rain, a fan, traffic or a crowd)' : 'a mixture of pitched sound and noise';
  return { seconds, analysed, loudnessDb: Math.round(db(avg)), peakDb: Math.round(db(peak)), silencePct, bpm, beat, key, notes, bands, tonalPct, hitsPerSec, centroid, timeline, character, balance };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** The measurements as plain lines, for people and for Coe to read. */
export function describeSound(r: SoundReport): string {
  return [
    `Sound measurements (worked out in the browser, not guessed):`,
    `- Length ${clock(r.seconds)}${r.analysed < r.seconds - 1 ? `, measured from the first ${clock(r.analysed)}` : ''}`,
    `- Loudness: average ${r.loudnessDb} dB, loudest ${r.peakDb} dB, ${r.silencePct}% silence`,
    r.bpm ? `- Tempo: about ${r.bpm} beats a minute (${r.beat === 'steady' ? 'a steady beat' : 'a loose beat'})` : '- Tempo: no steady beat found',
    r.key ? `- Key: probably ${r.key}; strongest notes ${r.notes.join(', ')}` : r.notes.length ? `- Strongest notes: ${r.notes.join(', ')} (no clear key)` : '- Notes: no clear pitch',
    `- Balance: ${r.bands.low}% bass, ${r.bands.mid}% mid, ${r.bands.high}% treble, so ${r.balance}`,
    `- Character: ${r.character} (${r.tonalPct}% pitched, ${r.hitsPerSec} hits a second)`,
    `- Loudness over time, in dB: ${r.timeline.join(' ')}`,
  ].join('\n');
}
export function describeHeard(h: Heard): string {
  const l: string[] = ['What an AI that can hear says is in it (a model\'s guess, not a measurement):'];
  if (h.summary) l.push(`- ${h.summary}`);
  if (h.instruments?.length) l.push(`- Instruments: ${h.instruments.map((i) => `${i.name}${i.confidence ? ` (${i.confidence} confidence)` : ''}${i.role ? `, ${i.role}` : ''}`).join('; ')}`);
  if (h.voices?.length) l.push(`- Voices: ${h.voices.join('; ')}`);
  if (h.noises?.length) l.push(`- Noises: ${h.noises.join('; ')}`);
  if (h.setting) l.push(`- Setting: ${h.setting}`);
  if (h.notes) l.push(`- Note: ${h.notes}`);
  return l.join('\n');
}

// ---------------------------------------------------------------- WAV
function wavOf(chans: Float32Array[], rate: number): Blob {
  const n = chans[0].length, c = chans.length, b = new ArrayBuffer(44 + n * c * 2), v = new DataView(b);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * c * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, c, true); v.setUint32(24, rate, true); v.setUint32(28, rate * c * 2, true); v.setUint16(32, c * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * c * 2, true);
  let o = 44; for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) { const s = Math.max(-1, Math.min(1, chans[k][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([b], { type: 'audio/wav' });
}
/** Up to 30 seconds of the sound from a chosen point, as a small mono WAV for the AI to listen to. */
export async function sliceForHearing(file: Blob, from = 0): Promise<{ wav: Blob; from: number; seconds: number }> {
  const buf = await decode(file), start = Math.max(0, Math.min(from, Math.max(0, buf.duration - 1))), pcm = await mono(buf, 16000, start, 30);
  return { wav: wavOf([pcm], 16000), from: start, seconds: pcm.length / 16000 };
}
/** A rough split by pitch range: low (bass and kick), middle (voices and most instruments), high (cymbals, air, hiss). It is a filter, not real instrument separation. */
export async function splitByPitch(file: Blob, onStep?: (t: string) => void): Promise<{ name: string; label: string; blob: Blob }[]> {
  const buf = await decode(file), rate = Math.min(buf.sampleRate, 44100), len = Math.ceil(Math.min(buf.duration, 300) * rate), out: { name: string; label: string; blob: Blob }[] = [];
  const parts: { name: string; label: string; chain: (c: OfflineAudioContext) => BiquadFilterNode[] }[] = [
    { name: 'low', label: 'Low: bass and kick', chain: (c) => { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200; f.Q.value = 0.7; const g = c.createBiquadFilter(); g.type = 'lowpass'; g.frequency.value = 200; g.Q.value = 0.7; return [f, g]; } },
    { name: 'middle', label: 'Middle: voices and most instruments', chain: (c) => { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 200; f.Q.value = 0.7; const g = c.createBiquadFilter(); g.type = 'lowpass'; g.frequency.value = 2500; g.Q.value = 0.7; return [f, g]; } },
    { name: 'high', label: 'High: cymbals, air and hiss', chain: (c) => { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500; f.Q.value = 0.7; const g = c.createBiquadFilter(); g.type = 'highpass'; g.frequency.value = 2500; g.Q.value = 0.7; return [f, g]; } },
  ];
  for (const p of parts) {
    onStep?.(`Splitting: ${p.label}…`);
    const off = new OfflineAudioContext(Math.min(2, buf.numberOfChannels), len, rate), src = off.createBufferSource(); src.buffer = buf;
    const fs = p.chain(off); src.connect(fs[0]); fs[0].connect(fs[1]); fs[1].connect(off.destination); src.start();
    const r = await off.startRendering(); out.push({ name: p.name, label: p.label, blob: wavOf(Array.from({ length: r.numberOfChannels }, (_, i) => r.getChannelData(i)), rate) });
  }
  return out;
}

/** Asks the Worker's AI to listen to a short WAV and say what is in it. */
export async function hearSound(s: CoeSettings, wav: Blob): Promise<Heard> {
  const h: Record<string, string> = { 'content-type': 'audio/wav' };
  if (s.code.trim()) h['x-coe-code'] = s.code.trim();
  const t = await token(); if (t) h.authorization = `Bearer ${t}`;
  const r = await fetch(s.serverUrl.trim().replace(/\/+$/, '') + '/hear', { method: 'POST', headers: h, body: wav });
  if (!r.ok) { let j: any = null; try { j = await r.json(); } catch { /* none */ } const e: Error & { code?: string } = new Error(j?.error?.message || 'Coe could not listen to that just now.'); e.code = j?.error?.code; throw e; }
  return ((await r.json()).heard ?? {}) as Heard;
}
