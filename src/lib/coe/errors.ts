import type { CoeError, ErrorKind } from './client';

export type ErrAct = 'retry' | 'settings' | 'plans' | 'signin' | 'appeal';
/** Where someone who has been banned can ask for the decision to be looked at again. */
export const APPEAL_EMAIL = 'appeal@pmcstudios.uk';
/** red: something broke. orange: Coe could not get through, so wait or check the connection. grey: a notice (tokens, plan, sign in). */
export type ErrLevel = 'red' | 'orange' | 'grey';
export interface Shown { title: string; text: string; acts: ErrAct[]; level: ErrLevel }

/** What a person sees when something goes wrong: a short title, one plain sentence, and a button that fixes it. */
export function explain(kind: ErrorKind | undefined, message: string, owner = false, own = false): Shown {
  const m = message.trim();
  if (!owner && (kind === 'setup' || kind === 'refused' || kind === 'network')) {
    return kind === 'network'
      ? (typeof navigator !== 'undefined' && navigator.onLine === false
        ? { title: 'You are offline', text: 'This device is not on the internet. Connect, then try again.', acts: ['retry'], level: 'orange' }
        : { title: 'Coe may be blocked here', text: 'Your internet works, but Coe can’t be reached. Some school, work and phone networks block sites. Try mobile data or another network.', acts: ['retry'], level: 'grey' })
      : { title: 'Coe is not available', text: 'Coe is not switched on yet. Try again later.', acts: ['retry'], level: 'orange' };
  }
  switch (kind) {
    case 'banned': return { title: 'You have been banned', text: `You cannot ask or generate any more responses. To appeal, contact ${APPEAL_EMAIL} for an answer.`, acts: ['appeal'], level: 'red' };
    case 'network': return own ? { title: 'Cannot reach your AI', text: 'Check your internet and the API address. Some companies block keys on web pages.', acts: ['retry', 'settings'], level: 'orange' } : { title: 'Cannot reach Coe', text: 'Check your internet. If it keeps happening, check the server address in Settings.', acts: ['retry', 'settings'], level: 'orange' };
    case 'server': return { title: 'Coe had a problem', text: m || 'Something went wrong on the server. Try again in a moment.', acts: ['retry'], level: 'red' };
    case 'limit': return { title: 'Too many at once', text: 'Wait a few seconds, then try again.', acts: ['retry'], level: 'orange' };
    case 'credits': return { title: 'Out of tokens', text: m || 'Today’s tokens are used up. They come back at midnight (UTC).', acts: ['plans'], level: 'grey' };
    case 'plan': return { title: 'This needs Pro', text: m || 'Coe Deep is part of Pro.', acts: ['plans'], level: 'grey' };
    case 'signin': return { title: 'Sign in to continue', text: m || 'Sign in, then try again.', acts: ['signin'], level: 'grey' };
    case 'refused': return { title: 'The server said no', text: m || 'The access code in Settings may be wrong.', acts: ['settings', 'retry'], level: 'red' };
    case 'setup': return { title: 'Not set up yet', text: m || 'Open Settings to set up Coe.', acts: ['settings'], level: 'orange' };
    case 'bad': return { title: 'That could not be used', text: m || 'The server could not use that message.', acts: ['retry'], level: 'red' };
    default: return { title: 'Something went wrong', text: m || 'Try again in a moment.', acts: ['retry'], level: 'red' };
  }
}
export const kindOfError = (e: unknown): ErrorKind | undefined => (e as CoeError | undefined)?.kind;
