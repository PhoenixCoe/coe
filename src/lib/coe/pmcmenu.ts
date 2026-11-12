/** The By PMC grid and the account menu are two small shared scripts (public/pmc-by.js and public/pmc-account.js), the same on every PMC site.
 *  This loads them once, only when they are first needed. If they cannot load, nothing breaks: the buttons simply do their old job. */
import { COE_VERSION } from './changelog';

export interface PmcOther { id: string; name: string; email: string; img?: string }
export interface PmcMenu {
  user: { name: string; email: string; img?: string } | null;
  others?: PmcOther[]; manage?: string; privacy?: string;
  onSettings?: () => void; onPicture?: () => void; onSignIn?: () => void; onAddAccount?: () => void; onSwitch?: (a: PmcOther) => void; onSignOut?: () => void;
}
interface PmcByApi { attach(button: HTMLElement, fill?: boolean): void }
interface PmcAccountApi {
  toggle(anchor: HTMLElement, get: () => PmcMenu, byKey?: boolean): void;
  remember(user: { email: string; name?: string; img?: string }, done?: () => void): void;
  others(email: string): PmcOther[];
  forget(email: string): void;
  close(): void;
}
declare global { interface Window { PmcBy?: PmcByApi; PmcAccount?: PmcAccountApi } }

let ready: Promise<void> | null = null;
const load = (src: string) => new Promise<void>((ok, no) => {
  const s = document.createElement('script'); s.src = src; s.async = true;
  s.onload = () => ok(); s.onerror = () => no(new Error('Could not load ' + src));
  document.head.appendChild(s);
});

/** Loads both scripts (once). Rejects if either cannot load. */
export function loadPmc(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.PmcBy && window.PmcAccount) return Promise.resolve();
  if (!ready) {
    const v = encodeURIComponent(COE_VERSION);
    ready = Promise.all([load(`/pmc-by.js?v=${v}`), load(`/pmc-account.js?v=${v}`)]).then(() => undefined);
    ready.catch(() => { ready = null; });
  }
  return ready;
}

/** Gives a button the By PMC grid. Safe to call again for the same button. */
export function attachBy(el: HTMLElement | null) {
  if (!el) return;
  void loadPmc().then(() => window.PmcBy?.attach(el, true)).catch(() => undefined);
}
