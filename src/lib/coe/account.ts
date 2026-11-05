import { getMe } from './billing';
import { PLANS, planByKey, type Plan, type PlanKey } from './models';
import { allowOwnKey, modeOf, type CoeSettings } from './settings';

/** What the server last said about this person. Without an account it stays on Free. */
export interface Status { billing: boolean; signedIn: boolean; canBuy: boolean; plan: PlanKey; given?: boolean; used: number; limit: number; email?: string; renews?: string }
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
  cur = me ? { billing: me.billing, signedIn: me.signedIn, canBuy: !!me.canBuy, plan: me.plan, given: me.given, used: me.used, limit: me.limit, email: me.email, renews: me.renews } : FREE;
  tell(); return cur;
}
export function applyCredits(c: { used: number; limit: number; plan: string }) { cur = { ...cur, used: c.used, limit: c.limit, plan: c.plan === 'pro' ? 'pro' : 'free' }; tell(); }
export function forgetStatus() { cur = FREE; tell(); }
export const onStatus = (fn: () => void) => { window.addEventListener('pmc:coe-status', fn); return () => window.removeEventListener('pmc:coe-status', fn); };
