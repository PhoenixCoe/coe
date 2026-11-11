/** Owner only: ask the server to pretend a problem on the very next message, to see how it looks. Anyone else's request for this is ignored by the server. */
export const PRETEND: { value: string; label: string }[] = [
  { value: '', label: 'No problem' }, { value: 'offline', label: 'No connection' }, { value: 'busy', label: 'Too many requests' }, { value: 'limit', label: 'Tokens used up' },
  { value: 'plan', label: 'Pro only' }, { value: 'check', label: 'Free checks used up' }, { value: 'big', label: 'Too big for Free' }, { value: 'down', label: 'Model not reachable' },
  { value: 'key', label: 'AI key refused' }, { value: 'signin', label: 'Sign in again' }, { value: 'banned', label: 'Banned' }, { value: 'slow', label: 'A slow answer (8 seconds)' },
];
let next = '';
const tell = () => { try { window.dispatchEvent(new Event('pmc:coe-pretend')); } catch { /* no window */ } };
export const pretending = () => next;
export const setPretend = (v: string) => { next = v; tell(); };
/** Used once, by the next request. */
export const takePretend = () => { const v = next; if (v) { next = ''; tell(); } return v; };
export const onPretend = (fn: () => void) => { window.addEventListener('pmc:coe-pretend', fn); return () => window.removeEventListener('pmc:coe-pretend', fn); };
