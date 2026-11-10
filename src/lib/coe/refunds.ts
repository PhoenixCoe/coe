/**
 * When a reply goes wrong (the code was cut off, a picture could not be made, the answer never arrived), the tokens it used are given back.
 * The server pays back only what it charged, once per reply, and only for the person who was charged. This keeps the list shown in Settings > Usage > Refunds.
 */
import { serverPost } from './billing';
import { applyCredits, counted, refreshStatus } from './account';
import { modeOf, type CoeSettings } from './settings';
import { uncountMessage } from '@/coe/store';

export interface Refund { id: string; t: number; tokens: number; why: string; chat: string }
const KEY = 'pmc:coe:refunds';

export function loadRefunds(): Refund[] {
  try { const r = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(r) ? (r as Refund[]).filter((x) => x && typeof x.tokens === 'number') : []; } catch { return []; }
}
function save(list: Refund[]) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100))); window.dispatchEvent(new Event('pmc:coe-refunds')); } catch { /* storage blocked */ } }
export const clearRefunds = () => save([]);
export const onRefunds = (fn: () => void) => { window.addEventListener('pmc:coe-refunds', fn); return () => window.removeEventListener('pmc:coe-refunds', fn); };

/** What one model call cost: the server's receipt for it, and what this device added to its own count. */
export interface Spent { tokens: number; receipt?: string; call?: string; local: number }

/**
 * Gives back the tokens of every call in one reply. Returns how many were given back (0 when none could be).
 * Signed in: the server pays it back and its new total replaces ours. Otherwise this device's own count goes down.
 */
export async function giveBack(s: CoeSettings, spent: Spent[], why: string, chat: string): Promise<number> {
  if (!spent.length || modeOf(s) === 'key') return 0;
  let tokens = 0;
  const receipts = spent.map((x) => x.receipt).filter((x): x is string => !!x);
  const calls = spent.map((x) => x.call).filter((x): x is string => !!x);
  if (receipts.length || calls.length) {
    try {
      const r = await serverPost<{ refunded: number; used: number; limit: number; plan: string }>(s, '/refund', { receipts, calls });
      tokens += Math.max(0, r.refunded || 0);
      if (counted(s)) applyCredits({ used: r.used, limit: r.limit, plan: r.plan });
    } catch { /* the server could not be reached: nothing is promised */ }
  }
  const local = spent.reduce((n, x) => n + (x.local || 0), 0);
  if (!counted(s) && local > 0) { uncountMessage(local); if (tokens === 0) tokens = local; }
  if (tokens <= 0) return 0;
  save([{ id: Math.random().toString(36).slice(2, 10), t: Date.now(), tokens, why: why.slice(0, 160), chat: chat.slice(0, 60) }, ...loadRefunds()]);
  void refreshStatus(s);
  return tokens;
}

/** Refunds the Chrome sidebar made, added to the same list (each one once). */
export function addSidebarRefunds(items: { id: string; t: number; tokens: number; why: string; chat: string }[]) {
  const have = new Set(loadRefunds().map((x) => x.id));
  const fresh = items.filter((x) => x && typeof x.id === 'string' && x.id && !have.has('x' + x.id) && Number(x.tokens) > 0)
    .map((x) => ({ id: 'x' + x.id, t: Number(x.t) || Date.now(), tokens: Math.round(Number(x.tokens)), why: String(x.why ?? '').slice(0, 160), chat: String(x.chat ?? 'Chrome sidebar').slice(0, 60) }));
  if (fresh.length) save([...fresh, ...loadRefunds()].sort((a, b) => b.t - a.t));
}
