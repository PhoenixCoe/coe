/**
 * Study decks with spaced repetition. A card you know comes back later and later; one you miss comes back soon.
 * Kept on this device, and in the account when signed in.
 */
export interface Card { id: string; deck: string; front: string; back: string; ease: number; interval: number; due: number; reps: number; lapses: number; upd: number }
export interface Deck { id: string; name: string; created: number }
export interface StudyData { decks: Deck[]; cards: Card[]; log: Record<string, number>; xp: number }
export type Grade = 0 | 1 | 2 | 3;   // again, hard, good, easy

const KEY = 'pmc:coe:study';
const empty = (): StudyData => ({ decks: [], cards: [], log: {}, xp: 0 });
let cache: StudyData | null = null;
const subs = new Set<() => void>();

export const today = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };
const dayKey = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

export function loadStudy(): StudyData {
  if (cache) return cache;
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && Array.isArray(raw.cards) && Array.isArray(raw.decks)) { cache = { decks: raw.decks, cards: raw.cards, log: raw.log ?? {}, xp: raw.xp ?? 0 }; return cache; } } catch { /* start fresh */ }
  cache = empty(); return cache;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage blocked: kept for this visit only */ }
  subs.forEach((f) => f());
  try { window.dispatchEvent(new CustomEvent('pmc:coe-study-changed')); } catch { /* no window */ }
}
export function subscribeStudy(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Puts cards in a deck (made if it is new). Cards already there, with the same question, are skipped. Returns how many were added. */
export function addCards(deckName: string, cards: { front: string; back: string }[]): { deck: Deck; added: number } {
  const s = loadStudy(), name = deckName.trim().slice(0, 60) || 'My cards';
  let deck = s.decks.find((d) => norm(d.name) === norm(name));
  if (!deck) { deck = { id: uid(), name, created: Date.now() }; s.decks.push(deck); }
  const have = new Set(s.cards.filter((c) => c.deck === deck!.id).map((c) => norm(c.front)));
  let added = 0; const t = today();
  for (const c of cards) {
    const front = String(c.front ?? '').trim(), back = String(c.back ?? '').trim();
    if (!front || !back || have.has(norm(front))) continue;
    s.cards.push({ id: uid(), deck: deck.id, front: front.slice(0, 1200), back: back.slice(0, 2400), ease: 2.5, interval: 0, due: t, reps: 0, lapses: 0, upd: Date.now() }); have.add(norm(front)); added++;
  }
  save(); return { deck, added };
}
export function removeDeck(id: string) { const s = loadStudy(); s.decks = s.decks.filter((d) => d.id !== id); s.cards = s.cards.filter((c) => c.deck !== id); save(); }
export function renameDeck(id: string, name: string) { const d = loadStudy().decks.find((x) => x.id === id); if (d && name.trim()) { d.name = name.trim().slice(0, 60); save(); } }
export function removeCard(id: string) { const s = loadStudy(); s.cards = s.cards.filter((c) => c.id !== id); save(); }

export const dueCards = (deckId?: string) => { const t = today(); return loadStudy().cards.filter((c) => c.due <= t && (!deckId || c.deck === deckId)); };
export const dueCount = () => dueCards().length;
export function deckStats(deckId: string) {
  const cs = loadStudy().cards.filter((c) => c.deck === deckId), t = today();
  return { total: cs.length, due: cs.filter((c) => c.due <= t).length, fresh: cs.filter((c) => c.reps === 0).length, known: cs.filter((c) => c.interval >= 21).length };
}

/** A simplified SM-2: how long until the card is shown again depends on how well it was known. */
export function grade(id: string, g: Grade) {
  const s = loadStudy(), c = s.cards.find((x) => x.id === id); if (!c) return;
  const t = today();
  if (g === 0) { c.lapses++; c.reps = 0; c.interval = 0; c.ease = Math.max(1.3, c.ease - 0.2); c.due = t; }
  else {
    c.ease = Math.min(3, Math.max(1.3, c.ease + (g === 1 ? -0.15 : g === 3 ? 0.15 : 0)));
    c.interval = g === 1 ? Math.max(1, Math.round(c.interval * 1.2)) : c.reps === 0 ? (g === 3 ? 3 : 1) : c.reps === 1 ? (g === 3 ? 6 : 3) : Math.round(c.interval * c.ease * (g === 3 ? 1.3 : 1));
    c.reps++; c.due = t + Math.max(1, c.interval);
  }
  c.upd = Date.now();
  s.log[dayKey(t)] = (s.log[dayKey(t)] ?? 0) + 1; s.xp += g === 0 ? 2 : g === 1 ? 5 : g === 2 ? 10 : 12;
  save();
}
export const nextLabel = (c: Card, g: Grade) => {
  if (g === 0) return 'soon';
  const days = g === 1 ? Math.max(1, Math.round(c.interval * 1.2)) : c.reps === 0 ? (g === 3 ? 3 : 1) : c.reps === 1 ? (g === 3 ? 6 : 3) : Math.round(c.interval * Math.min(3, c.ease) * (g === 3 ? 1.3 : 1));
  return days <= 1 ? 'tomorrow' : days < 30 ? `${days} days` : `${Math.round(days / 30)} months`;
};

export function streak(): { days: number; today: boolean } {
  const s = loadStudy(), t = today(); let n = 0, d = t; const did = (s.log[dayKey(t)] ?? 0) > 0;
  if (!did) d = t - 1;
  while ((s.log[dayKey(d)] ?? 0) > 0) { n++; d--; }
  return { days: n, today: did };
}
export const level = (xp: number) => { const lv = Math.floor(Math.sqrt(xp / 40)) + 1, base = 40 * (lv - 1) ** 2, next = 40 * lv ** 2; return { lv, into: xp - base, span: next - base }; };
export const reviewedToday = () => loadStudy().log[dayKey(today())] ?? 0;
/** The last n days, oldest first, for the little bar chart. */
export function lastDays(n = 14): { key: string; count: number }[] { const s = loadStudy(), t = today(); return Array.from({ length: n }, (_, i) => { const k = dayKey(t - (n - 1 - i)); return { key: k, count: s.log[k] ?? 0 }; }); }

// ---------------------------------------------------------------- moving it between devices
export function exportStudy(): string { return JSON.stringify(loadStudy(), null, 1); }
export function importStudy(text: string): number {
  const raw = JSON.parse(text) as Partial<StudyData>; if (!raw || !Array.isArray(raw.cards) || !Array.isArray(raw.decks)) throw new Error('That is not a Coe study file.');
  return mergeStudy(raw as StudyData);
}
/** Brings in another copy (a file, or the account): decks and cards are joined, and the more recently studied copy of a card wins. Returns how many cards are new here. */
export function mergeStudy(other: StudyData): number {
  const s = loadStudy(); let fresh = 0;
  for (const d of other.decks ?? []) if (!s.decks.some((x) => x.id === d.id)) s.decks.push(d);
  for (const c of other.cards ?? []) {
    const mine = s.cards.find((x) => x.id === c.id);
    if (!mine) { if (s.decks.some((d) => d.id === c.deck)) { s.cards.push(c); fresh++; } }
    else if ((c.upd ?? 0) > mine.upd) Object.assign(mine, c);
  }
  for (const [k, v] of Object.entries(other.log ?? {})) s.log[k] = Math.max(s.log[k] ?? 0, v);
  s.xp = Math.max(s.xp, other.xp ?? 0);
  save(); return fresh;
}
export const snapshotStudy = (): StudyData => loadStudy();
