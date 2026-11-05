import type { PlanKey } from './models';
import { token } from './cloud';
import type { CoeSettings } from './settings';

/** What the server says about the signed-in person: their plan and how many credits are left today. */
export interface Me { billing: boolean; canBuy?: boolean; given?: boolean; signedIn: boolean; plan: PlanKey; used: number; limit: number; email?: string; renews?: string }

const base = (s: CoeSettings) => s.serverUrl.trim().replace(/\/+$/, '');
async function call<T>(s: CoeSettings, path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (s.code.trim()) headers['x-coe-code'] = s.code.trim();
  const t = await token(); if (t) headers.authorization = `Bearer ${t}`;
  const r = await fetch(base(s) + path, { ...init, headers });
  let j: any = null; try { j = await r.json(); } catch { /* none */ }
  if (!r.ok) throw new Error(j?.error?.message || 'The server could not do that.');
  return j as T;
}
export const getMe = (s: CoeSettings) => (s.mode === 'server' && s.serverUrl.trim() ? call<Me>(s, '/me').catch(() => null) : Promise.resolve(null));
export const startCheckout = (s: CoeSettings, period: 'month' | 'year') => call<{ url: string }>(s, '/checkout', { method: 'POST', body: JSON.stringify({ period, back: location.origin }) }).then((r) => r.url);
export const openPortal = (s: CoeSettings) => call<{ url: string }>(s, '/portal', { method: 'POST', body: JSON.stringify({ back: location.origin }) }).then((r) => r.url);
