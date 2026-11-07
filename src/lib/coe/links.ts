/**
 * What Coe remembers about you. It is kept in this browser only.
 */
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
