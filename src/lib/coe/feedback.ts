/** "How am I doing?": when to ask, and sending the answer. */
import { connection, modeOf, type CoeSettings } from './settings';
import { serverPost } from './billing';
import { refreshStatus } from './account';

export type Rating = 'bad' | 'fine' | 'good';
interface State { replies: number; lastAsk: number; asked: number; skipUntil: number; answered: number; last?: Rating }
const KEY = 'pmc:coe:fb';
const fresh = (): State => ({ replies: 0, lastAsk: 0, asked: 0, skipUntil: 0, answered: 0 });
function read(): State { try { return { ...fresh(), ...(JSON.parse(localStorage.getItem(KEY) || 'null') ?? {}) }; } catch { return fresh(); } }
function write(s: State) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } }

/** A reply finished. */
export const noteReply = () => { const s = read(); s.replies++; write(s); };
/** The first time after a handful of replies, then now and again: at most once a day, and never right after "Not now". */
export function feedbackDue(now = Date.now()): boolean {
  const s = read();
  return s.replies >= (s.asked === 0 ? 4 : 10) && now - s.lastAsk > 20 * 3600_000 && now >= s.skipUntil;
}
export const feedbackShown = () => { const s = read(); s.lastAsk = Date.now(); s.asked++; s.replies = 0; write(s); };
export const feedbackLater = () => { const s = read(); s.skipUntil = Date.now() + 3 * 86400_000; s.replies = 0; write(s); };
export type FeedbackKind = 'idea' | 'problem' | 'other' | 'rating';
const MAIL = 'contact@pmcstudios.uk';
/** Opens the person's own email app, addressed to us. The fallback when the server cannot send mail. */
export function mailtoFeedback(message: string, kind: FeedbackKind = 'other') {
  location.href = `mailto:${MAIL}?subject=${encodeURIComponent('Coe feedback: ' + kind)}&body=${encodeURIComponent(message)}`;
}
/** A rating, and/or a written message. Resolves to whether the server emailed it. */
export async function sendFeedback(settings: CoeSettings, rating?: Rating, message = '', kind: FeedbackKind = rating ? 'rating' : 'other'): Promise<{ emailed: boolean }> {
  if (rating) { const s = read(); s.answered++; s.last = rating; write(s); }
  if (modeOf(settings) !== 'server' || !connection(settings).ok) return { emailed: false };
  try { const r = await serverPost<{ emailed?: boolean }>(settings, '/feedback', { rating, message: message.trim() || undefined, kind, page: location.pathname }); void refreshStatus(settings); return { emailed: !!r?.emailed }; }
  catch { return { emailed: false }; }
}
