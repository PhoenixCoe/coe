/**
 * The accounts Coe can reach for you (Google, GitHub), and what Coe remembers about you.
 * The keys are kept in this browser only. They are never sent to Coe's server or put in a chat.
 */
const KEY = 'pmc:coe:links';
export interface Google { token: string; exp: number; level: 'make' | 'read'; email?: string }
export interface GitHub { token: string; login: string; kind: 'token' | 'signin' }
export interface Links { google?: Google; github?: GitHub }

export function links(): Links { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
function save(l: Links) { try { localStorage.setItem(KEY, JSON.stringify(l)); window.dispatchEvent(new Event('pmc:coe-links')); } catch { /* storage blocked */ } }
export const setGoogle = (g: Google | undefined) => { const l = links(); if (g) l.google = g; else delete l.google; save(l); };
export const setGithub = (g: GitHub | undefined) => { const l = links(); if (g) l.github = g; else delete l.github; save(l); };
export const googleNow = (): Google | null => { const g = links().google; return g && g.exp > Date.now() ? g : null; };
export const onLinks = (fn: () => void) => { window.addEventListener('pmc:coe-links', fn); return () => window.removeEventListener('pmc:coe-links', fn); };

// ---------------------------------------------------------------- memory
const MEM = 'pmc:coe:memory';
export const MAX_FACTS = 60;
export const memory = (): string[] => { try { const m = JSON.parse(localStorage.getItem(MEM) || '[]'); return Array.isArray(m) ? m.filter((x) => typeof x === 'string').slice(0, MAX_FACTS) : []; } catch { return []; } };
export function setMemory(list: string[]) {
  const clean = [...new Set(list.map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 240)).filter(Boolean))].slice(0, MAX_FACTS);
  try { localStorage.setItem(MEM, JSON.stringify(clean)); window.dispatchEvent(new Event('pmc:coe-memory')); } catch { /* storage blocked */ }
  return clean;
}
export const remember = (fact: string) => setMemory([...memory(), fact]);
export const onMemory = (fn: () => void) => { window.addEventListener('pmc:coe-memory', fn); return () => window.removeEventListener('pmc:coe-memory', fn); };
