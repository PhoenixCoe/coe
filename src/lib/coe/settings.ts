import { DEFAULT_MODEL_IDS, type ModelKey } from './models';

/**
 * How Coe reaches a model. Two ways, and neither puts a key in the site's code:
 *  - "server": a small Cloudflare Worker you own holds the key as a secret. This page only knows the Worker's address.
 *  - "key": your own key, kept in this browser only. For you alone, on a device you trust.
 */
export interface CoeSettings {
  mode: 'server' | 'key';
  /** The Worker's address (mode: server). */
  serverUrl: string;
  /** An optional code the Worker asks for, so only people who know it can use it. */
  code: string;
  /** Which way the model's API is spoken. */
  provider: 'anthropic' | 'openai';
  /** The API address (mode: key). */
  baseUrl: string;
  apiKey: string;
  models: Record<ModelKey, string>;
  /** Standing instructions added to every conversation. */
  system: string;
  /** How adventurous replies are. 'default' leaves it to the model. */
  creativity: 'default' | 'precise' | 'balanced' | 'creative';
  /** What Coe calls you in its greeting. */
  name: string;
  size: 'normal' | 'large';
  enter: 'send' | 'newline';
}

export const DEFAULTS: CoeSettings = {
  mode: 'server', serverUrl: (process.env.NEXT_PUBLIC_COE_SERVER ?? '').trim().replace(/\/+$/, ''), code: '', provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: { ...DEFAULT_MODEL_IDS },
  system: '', creativity: 'default', name: '', size: 'normal', enter: 'send',
};
export const CREATIVITY: Record<CoeSettings['creativity'], number | undefined> = { default: undefined, precise: 0.2, balanced: 0.7, creative: 1 };

const KEY = 'pmc:coe:settings';
export function loadSettings(): CoeSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') return { ...DEFAULTS, ...raw, serverUrl: String(raw.serverUrl || '').trim() || DEFAULTS.serverUrl, models: { ...DEFAULTS.models, ...(raw.models ?? {}) } };
  } catch { /* storage blocked or damaged */ }
  return { ...DEFAULTS, models: { ...DEFAULTS.models } };
}
export function saveSettings(s: CoeSettings) { try { localStorage.setItem(KEY, JSON.stringify(s)); window.dispatchEvent(new Event('pmc:coe-settings')); } catch { /* storage blocked */ } }

/** Is there somewhere to send a message? When not, says what is missing in plain words. */
export function connection(s: CoeSettings): { ok: true } | { ok: false; why: string } {
  if (s.mode === 'server') return s.serverUrl.trim() ? { ok: true } : { ok: false, why: 'Add the address of your Coe server in Settings.' };
  if (!s.apiKey.trim()) return { ok: false, why: 'Add your key in Settings.' };
  if (s.provider === 'openai' && !s.baseUrl.trim()) return { ok: false, why: 'Add the API address in Settings.' };
  return { ok: true };
}
