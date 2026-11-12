import { type ModelKey } from './models';
import { providerById } from './providers';

/**
 * How Coe reaches a model. Two ways, and neither puts a key in the site's code:
 *  - "server": Coe's own server. Its key is a secret in Cloudflare. Everyone can use this.
 *  - "key": a key of your own, kept in this browser only. Pro only.
 */
export interface CoeSettings {
  mode: 'server' | 'key';
  /** The Worker's address (mode: server). */
  serverUrl: string;
  /** An optional code the Worker asks for, so only people who know it can use it. */
  code: string;
  /** Which company's AI is used with your own key (an id from providers.ts). */
  provider: string;
  /** One key per company, so switching does not lose the others. */
  keys: Record<string, string>;
  /** An API address of your own, per company. Empty means the usual one. */
  bases: Record<string, string>;
  /** Model names of your own, per company. Empty means the usual ones. */
  models: Record<string, Partial<Record<ModelKey, string>>>;
  /** Standing instructions added to every conversation. */
  system: string;
  /** What Coe should know about you: year, subjects, goals. Added to every conversation. */
  about: string;
  /** Who Coe is talking to. Set here, in the first-visit questions, or in the Coe Mini sidebar (the newest answer wins). */
  ageBand: '' | 'under13' | '13-16' | '17-18' | '19-24' | '25+';
  role: '' | 'student' | 'teacher' | 'parent' | 'working' | 'other';
  yearOrJob: string;
  subjects: string;
  /** When those answers last changed, so the newest copy wins between this site and the sidebar. */
  profileAt: number;
  /** How adventurous replies are. 'default' leaves it to the model. */
  creativity: 'default' | 'precise' | 'balanced' | 'creative';
  /** What Coe calls you in its greeting. */
  name: string;
  size: 'normal' | 'large';
  enter: 'send' | 'newline';
  /** Look at its own answer before finishing, and fix mistakes. */
  check: 'off' | 'smart' | 'always';
  /** How long answers should be, unless you ask for something else. */
  length: 'short' | 'balanced' | 'detailed';
  /** How Coe sounds. */
  tone: 'friendly' | 'neutral' | 'formal' | 'playful';
  /** How much you already know, so explanations start at the right place. */
  level: 'auto' | 'simple' | 'standard' | 'expert';
  /** The language of replies. Empty means the one you write in. */
  replyLang: string;
  /** Headings, centred text and animated words in answers. */
  effects: boolean;
  /** How often Coe asks you a question while it works. */
  asks: 'rarely' | 'sometimes' | 'often';
  /** Animation across the whole site. */
  motion: 'full' | 'calm' | 'off';
  /** Text size as a percentage. */
  scale: number;
  /** True until you move the text size yourself: phones and tablets then start smaller than a computer, and scale follows the device. */
  autoScale: boolean;
  /** Tighter spacing in the chat. */
  compact: boolean;
  /** Roomier, easier-to-read spacing. */
  easy: boolean;
  /** Study cards you want to review a day. */
  goal: number;
  /** What happens when you send a message while Coe is still replying. */
  whileBusy: 'queue' | 'interrupt';
  /** Longest reply in words. 0 means no limit. */
  maxWords: number;
  /** Stronger text and borders. */
  contrast: boolean;
  /** The timer while Coe works, and "Took 14s" after. */
  timers: boolean;
}

export const DEFAULTS: CoeSettings = {
  mode: 'server', serverUrl: (process.env.NEXT_PUBLIC_COE_SERVER ?? '').trim().replace(/\/+$/, ''), code: '', provider: 'openai', keys: {}, bases: {}, models: {},
  system: '', about: '', ageBand: '', role: '', yearOrJob: '', subjects: '', profileAt: 0, creativity: 'default', name: '', size: 'normal', enter: 'send',
  check: 'smart', length: 'balanced', tone: 'friendly', level: 'auto', replyLang: '', effects: true, asks: 'sometimes', motion: 'full', scale: 100, autoScale: true, compact: false, easy: false, goal: 10, whileBusy: 'queue', maxWords: 0, contrast: false, timers: true,
};
export const CREATIVITY: Record<CoeSettings['creativity'], number | undefined> = { default: undefined, precise: 0.2, balanced: 0.7, creative: 1 };

/** How big Coe starts on this device. Computers stay at 100%. Phones start at 90% and tablets at 85%, because the same size looks bigger in the hand.
 *  The page's own head script (boot.ts) works this out the same way, so the page does not jump when Coe opens. */
export function deviceScale(): number {
  try {
    if (typeof window === 'undefined') return 100;
    const touch = navigator.maxTouchPoints > 1 || window.matchMedia('(pointer: coarse)').matches;
    const side = Math.min(window.screen.width || 9999, window.screen.height || 9999);
    return touch && side <= 1100 ? (side < 600 ? 90 : 85) : 100;
  } catch { return 100; }
}
const KEY = 'pmc:coe:settings';
export function loadSettings(): CoeSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const s: CoeSettings = { ...DEFAULTS, ...raw, serverUrl: String(raw.serverUrl || '').trim() || DEFAULTS.serverUrl, keys: { ...(raw.keys ?? {}) }, bases: { ...(raw.bases ?? {}) }, models: {} };
      if (typeof raw.provider !== 'string' || !raw.provider) s.provider = 'openai';
      // Older versions kept one key and one set of model names.
      if (typeof raw.apiKey === 'string' && raw.apiKey && !Object.keys(s.keys).length) { s.keys[s.provider] = raw.apiKey; if (raw.baseUrl) s.bases[s.provider] = String(raw.baseUrl); }
      if (raw.models && typeof raw.models === 'object') for (const [k, v] of Object.entries(raw.models)) { if (v && typeof v === 'object') s.models[k] = v as Partial<Record<ModelKey, string>>; }
      const old = { apiKey: 1, baseUrl: 1 } as Record<string, 1>; for (const k of Object.keys(old)) delete (s as any)[k];
      if (s.mode !== 'key') s.mode = 'server';
      // The old two-step text size became a slider.
      if (raw.size === 'large' && raw.scale === undefined) { s.scale = 115; s.size = 'normal'; s.autoScale = false; }
      // Saved before the device size existed: any size other than 100 was your own choice, so it stays.
      else if (raw.autoScale === undefined) s.autoScale = raw.scale === undefined || Number(raw.scale) === 100;
      s.scale = s.autoScale ? deviceScale() : Math.min(150, Math.max(75, Number(s.scale) || 100));
      delete (s as any).tips;
      return s;
    }
  } catch { /* storage blocked or damaged */ }
  return { ...DEFAULTS, keys: {}, bases: {}, models: {} };
}
/** Age groups saved before the change: under 11 and 11 to 13 are now Under 13, and 14 to 16 is now 13 to 16. */
export const oldAge = (v: unknown) => (v === 'under11' || v === '11-13' ? 'under13' : v === '14-16' ? '13-16' : v);
export const PROFILE_KEYS = ['name', 'ageBand', 'role', 'yearOrJob', 'subjects', 'length', 'easy', 'about', 'system', 'tone', 'level', 'replyLang', 'maxWords', 'goal'] as const;
/** The About you record that travels with the account and to the Coe Mini sidebar. The same fields, with the same meaning, in both. */
export type AboutRecord = { name?: string; ageBand?: string; role?: string; yearOrJob?: string; subjects?: string; length?: string; easy?: boolean; aboutText?: string; system?: string; tone?: string; level?: string; replyLang?: string; maxWords?: number; goal?: number; at?: number };
export const aboutRecord = (s: CoeSettings): AboutRecord => ({ name: s.name, ageBand: s.ageBand, role: s.role, yearOrJob: s.yearOrJob, subjects: s.subjects, length: s.length, easy: s.easy, aboutText: s.about, system: s.system, tone: s.tone, level: s.level, replyLang: s.replyLang, maxWords: s.maxWords, goal: s.goal, at: s.profileAt });
/** Reads an About you record (from the account or the sidebar) into settings, checking every value. */
export function withAbout(cur: CoeSettings, a: Record<string, unknown>, at: number): CoeSettings {
  const one = <T extends string>(v: unknown, ok: readonly T[], fall: T): T => (ok.includes(String(v) as T) ? (String(v) as T) : fall);
  const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  const num = (v: unknown, ok: number[], fall: number) => (ok.includes(Number(v)) ? Number(v) : fall);
  return {
    ...cur, name: str(a.name, 30), ageBand: one(oldAge(a.ageBand), ['', 'under13', '13-16', '17-18', '19-24', '25+'] as const, ''), role: one(a.role, ['', 'student', 'teacher', 'parent', 'working', 'other'] as const, ''),
    yearOrJob: str(a.yearOrJob, 60), subjects: str(a.subjects, 100), length: one(a.length, ['short', 'balanced', 'detailed'] as const, cur.length), easy: !!a.easy,
    about: a.aboutText === undefined ? cur.about : str(a.aboutText, 700), system: a.system === undefined ? cur.system : str(a.system, 1500),
    tone: one(a.tone, ['friendly', 'neutral', 'formal', 'playful'] as const, cur.tone), level: one(a.level, ['auto', 'simple', 'standard', 'expert'] as const, cur.level), replyLang: a.replyLang === undefined ? cur.replyLang : str(a.replyLang, 30),
    maxWords: num(a.maxWords, [0, 100, 250, 500], cur.maxWords), goal: a.goal === undefined ? cur.goal : Math.max(5, Math.min(60, Math.round(Number(a.goal) / 5) * 5 || cur.goal)), profileAt: at,
  };
}
/** "Meet Coe" (the first-time questions) has been answered or skipped. It travels with the account, so a new device does not ask again. */
export const MET = 'pmc:coe:met';
/** Setup is done once per account (the account remembers it, so no other device asks again), and once per device when nobody is signed in.
 *  The device remembers who finished it: '1' for nobody signed in, or the account's id. */
export const isMet = () => { try { return !!localStorage.getItem(MET); } catch { return false; } };
export const metBy = () => { try { return localStorage.getItem(MET) ?? ''; } catch { return ''; } };
export function markMet(by = '1') { try { const had = localStorage.getItem(MET); if (had === by || (had && by === '1')) return; localStorage.setItem(MET, by); window.dispatchEvent(new Event('pmc:coe-met')); } catch { /* storage blocked */ } }
export function saveSettings(s: CoeSettings) {
  // When About you changes, remember when, so this site and the Coe Mini sidebar can tell which copy is newer.
  try { const prev = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<CoeSettings> | null; if (prev && s.profileAt === (prev.profileAt ?? 0) && PROFILE_KEYS.some((k) => (prev[k] ?? DEFAULTS[k]) !== s[k])) s = { ...s, profileAt: Date.now() }; } catch { /* nothing before */ }
  try { localStorage.setItem(KEY, JSON.stringify(s)); window.dispatchEvent(new Event('pmc:coe-settings')); } catch { /* storage blocked */ } }

/** May your own key be used right now? Only for Pro members. The account page sets this once the server has said who is signed in. */
let keyAllowed = false;
export const allowOwnKey = (yes: boolean) => { keyAllowed = yes; };
/** The way in use: your own key only when you chose it and Pro allows it. Otherwise Coe's own server. */
export const modeOf = (s: CoeSettings): 'server' | 'key' => (s.mode === 'key' && keyAllowed ? 'key' : 'server');

/** Everything needed to reach the company chosen for your own key. */
export function own(s: CoeSettings) {
  const p = providerById(s.provider);
  const m = s.models[p.id] ?? {};
  return {
    p, kind: p.kind, base: (s.bases[p.id] || p.base).trim().replace(/\/+$/, ''), key: (s.keys[p.id] ?? '').trim(),
    model: (k: ModelKey) => (m[k] || '').trim() || p.models[k],
  };
}

/** Is there somewhere to send a message? When not, says what is missing in plain words. */
export function connection(s: CoeSettings): { ok: true } | { ok: false; why: string } {
  if (modeOf(s) === 'server') return s.serverUrl.trim() ? { ok: true } : { ok: false, why: 'Add the address of your Coe server in Settings.' };
  const o = own(s);
  if (!o.key && o.p.id !== 'ollama') return { ok: false, why: `Add your ${o.p.name} key in Settings.` };
  if (!o.base) return { ok: false, why: 'Add the API address in Settings.' };
  if (!o.model('core')) return { ok: false, why: 'Add the model names in Settings.' };
  return { ok: true };
}
