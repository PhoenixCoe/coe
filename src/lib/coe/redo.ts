/** "Wrong? Redo" is free a few times a day, then it counts like any message. This keeps the count on this device (Coe's server keeps its own). */
export const REDO_FREE = { free: 3, pro: 10 } as const;
const KEY = 'pmc:coe:redo';
const day = () => new Date().toISOString().slice(0, 10);
const read = (): { day: string; n: number } => { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.day === day() && Number.isFinite(j.n)) return j; } catch { /* storage blocked */ } return { day: day(), n: 0 }; };
export const redoLeft = (plan: 'free' | 'pro') => Math.max(0, REDO_FREE[plan] - read().n);
export const redoUsed = () => { try { const r = read(); localStorage.setItem(KEY, JSON.stringify({ day: r.day, n: r.n + 1 })); } catch { /* storage blocked */ } };
