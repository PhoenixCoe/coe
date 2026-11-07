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
}

export const DEFAULTS: CoeSettings = {
  mode: 'server', serverUrl: (process.env.NEXT_PUBLIC_COE_SERVER ?? '').trim().replace(/\/+$/, ''), code: '', provider: 'openai', keys: {}, bases: {}, models: {},
  system: '', creativity: 'default', name: '', size: 'normal', enter: 'send',
  check: 'smart', length: 'balanced', tone: 'friendly', level: 'auto', replyLang: '', effects: true, asks: 'sometimes', motion: 'full', scale: 100, compact: false, easy: false, goal: 10, whileBusy: 'queue', maxWords: 0, contrast: false,
};
export const CREATIVITY: Record<CoeSettings['creativity'], number | undefined> = { default: undefined, precise: 0.2, balanced: 0.7, creative: 1 };

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
      if (raw.size === 'large' && raw.scale === undefined) { s.scale = 115; s.size = 'normal'; }
      s.scale = Math.min(150, Math.max(80, Number(s.scale) || 100));
      delete (s as any).tips;
      return s;
    }
  } catch { /* storage blocked or damaged */ }
  return { ...DEFAULTS, keys: {}, bases: {}, models: {} };
}
export function saveSettings(s: CoeSettings) { try { localStorage.setItem(KEY, JSON.stringify(s)); window.dispatchEvent(new Event('pmc:coe-settings')); } catch { /* storage blocked */ } }

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
