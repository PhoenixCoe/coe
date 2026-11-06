import { getMe } from './billing';
import { PLANS, QUOTAS, planByKey, type Plan, type PlanKey, type QuotaKey } from './models';
import { allowOwnKey, modeOf, type CoeSettings } from './settings';

/** What the server last said about this person. Without an account it stays on Free. */
export interface Status { billing: boolean; signedIn: boolean; canBuy: boolean; plan: PlanKey; given?: boolean; used: number; limit: number; email?: string; renews?: string; quotas?: Record<string, { used: number; limit: number }>; week?: { day: string; used: number }[] }
const FREE: Status = { billing: false, signedIn: false, canBuy: false, plan: 'free', used: 0, limit: PLANS[0].perDay };
let cur: Status = FREE;
const tell = () => { allowOwnKey(cur.billing && cur.signedIn && cur.plan === 'pro'); try { window.dispatchEvent(new Event('pmc:coe-status')); } catch { /* no window */ } };

export const status = () => cur;
/** Is this person allowed to use a key of their own? */
export const canOwnKey = () => cur.billing && cur.signedIn && cur.plan === 'pro';
/** Credits are counted by the server for signed-in people on a server with accounts. Everyone else is counted on this device. */
export const counted = (s: CoeSettings) => modeOf(s) === 'server' && cur.billing && cur.signedIn;
/** The plan that applies right now. Your own key (Pro only) has no daily credits of its own. */
export const planNow = (s: CoeSettings): PlanKey => (modeOf(s) === 'key' ? 'pro' : counted(s) ? cur.plan : 'free');
export const planInfo = (s: CoeSettings): Plan => planByKey(planNow(s));
export const creditsNow = (s: CoeSettings) => (counted(s) ? { used: cur.used, limit: cur.limit } : null);

export async function refreshStatus(s: CoeSettings): Promise<Status> {
  const me = await getMe(s);
  cur = me ? { billing: me.billing, signedIn: me.signedIn, canBuy: !!me.canBuy, plan: me.plan, given: me.given, used: me.used, limit: me.limit, email: me.email, renews: me.renews, quotas: me.quotas, week: me.week } : FREE;
  tell(); return cur;
}
export function applyCredits(c: { used: number; limit: number; plan: string }) { cur = { ...cur, used: c.used, limit: c.limit, plan: c.plan === 'pro' ? 'pro' : 'free' }; tell(); }
export function forgetStatus() { cur = FREE; tell(); }
export const onStatus = (fn: () => void) => { window.addEventListener('pmc:coe-status', fn); return () => window.removeEventListener('pmc:coe-status', fn); };

// ---------------------------------------------------------------- the small daily allowances (Deep Work, searches, pictures, PMC App runs)
const QKEY = 'pmc:coe:quota';
interface Local { day: string; work: number; search: number; image: number; app: number; voice: number }
const today = () => new Date().toISOString().slice(0, 10);
function local(): Local {
  const z: Local = { day: today(), work: 0, search: 0, image: 0, app: 0, voice: 0 };
  try { const r = JSON.parse(localStorage.getItem(QKEY) || 'null'); if (r && r.day === z.day) return { ...z, ...r }; } catch { /* none */ }
  return z;
}
/** How many of something are left today. The server's count when it has given one, otherwise the count kept on this device. */
export function quotaLeft(k: QuotaKey, s: CoeSettings): { used: number; limit: number; left: number } {
  const pn = planNow(s);
  const srv = cur.billing ? cur.quotas?.[k] : undefined;
  const used = srv ? srv.used : local()[k];
  const limit = srv ? srv.limit : QUOTAS[k][pn];
  return { used, limit, left: Math.max(0, limit - used) };
}
/** Counts one use on this device, and in the server's picture so the screen is right straight away. */
export function bumpQuota(k: QuotaKey) {
  const l = local(); l[k]++;
  try { localStorage.setItem(QKEY, JSON.stringify(l)); } catch { /* storage blocked */ }
  if (cur.quotas?.[k]) { cur = { ...cur, quotas: { ...cur.quotas, [k]: { ...cur.quotas[k], used: cur.quotas[k].used + 1 } } }; }
  tell();
}
