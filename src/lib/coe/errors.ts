import type { CoeError, ErrorKind } from './client';

export type ErrAct = 'retry' | 'settings' | 'plans' | 'signin';
/** red: something broke. orange: Coe could not get through, so wait or check the connection. yellow: a notice (tokens, plan, sign in). */
export type ErrLevel = 'red' | 'orange' | 'yellow';
export interface Shown { title: string; text: string; acts: ErrAct[]; level: ErrLevel }

/** What a person sees when something goes wrong: a short title, one plain sentence, and a button that fixes it. */
export function explain(kind: ErrorKind | undefined, message: string, owner = false, own = false): Shown {
  const m = message.trim();
  if (!owner && (kind === 'setup' || kind === 'refused' || kind === 'network')) {
    return kind === 'network'
      ? { title: 'Cannot reach Coe', text: 'Check your internet, then try again.', acts: ['retry'], level: 'orange' }
      : { title: 'Coe is not available', text: 'Coe is not switched on yet. Try again later.', acts: ['retry'], level: 'orange' };
  }
  switch (kind) {
    case 'network': return own ? { title: 'Cannot reach your AI', text: 'Check your internet and the API address. Some companies do not allow keys to be used from a web page.', acts: ['retry', 'settings'], level: 'orange' } : { title: 'Cannot reach Coe', text: 'Check your internet. If it keeps happening, the server address in Settings may be wrong.', acts: ['retry', 'settings'], level: 'orange' };
    case 'server': return { title: 'Coe had a problem', text: m || 'Something went wrong on the server. Try again in a moment.', acts: ['retry'], level: 'red' };
    case 'limit': return { title: 'Too many at once', text: 'Wait a few seconds, then try again.', acts: ['retry'], level: 'orange' };
    case 'credits': return { title: 'Out of tokens', text: m || 'Your tokens for today are used up. They come back at midnight (UTC).', acts: ['plans'], level: 'yellow' };
    case 'plan': return { title: 'This needs Pro', text: m || 'Coe Deep is part of Pro.', acts: ['plans'], level: 'yellow' };
    case 'signin': return { title: 'Sign in to continue', text: m || 'Sign in, then try again.', acts: ['signin'], level: 'yellow' };
    case 'refused': return { title: 'The server said no', text: m || 'The access code in Settings may be wrong.', acts: ['settings', 'retry'], level: 'red' };
    case 'setup': return { title: 'Not set up yet', text: m || 'Open Settings to set up Coe.', acts: ['settings'], level: 'orange' };
    case 'bad': return { title: 'That could not be used', text: m || 'The server could not use that message.', acts: ['retry'], level: 'red' };
    default: return { title: 'Something went wrong', text: m || 'Try again in a moment.', acts: ['retry'], level: 'red' };
  }
}
export const kindOfError = (e: unknown): ErrorKind | undefined => (e as CoeError | undefined)?.kind;
