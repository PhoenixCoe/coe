import type { ModelKey } from '@/lib/coe/models';

/** A picture in a message: kept as base64 so a conversation can be saved, sent again and exported. */
export interface Img { name: string; type: string; data: string }
/** A file read in for Coe: the words are kept, the original is not. */
export interface Attach { name: string; kind: string; chars: number; text: string; cut?: boolean; note?: string }
/** What a tool made, to show under the reply. Kept with the chat. */
export type ToolOut =
  | { kind: 'text'; text: string }
  | { kind: 'search'; text: string; sources: { title: string; url: string }[] }
  | { kind: 'image'; img: Img }
  | { kind: 'maths'; text: string }
  | { kind: 'link'; url: string; label: string }
  | { kind: 'files'; items: { name: string; type: string; size: number; data: string }[] };
export interface ToolRun { id: string; tool: string; args: Record<string, unknown>; status: 'running' | 'pending' | 'ok' | 'error'; note?: string; out?: ToolOut; result?: string; shown?: string; /** When it started and finished (milliseconds). */ t0?: number; t1?: number }
export interface Msg {
  id: string; role: 'user' | 'assistant'; text: string; images?: Img[]; model?: ModelKey; ts: number;
  error?: string; errKind?: string; stopped?: boolean; cut?: boolean; inTokens?: number; outTokens?: number;
  /** Files read in with this message. */
  attach?: Attach[];
  /** A tool the reply asked for, and what came of it. */
  runs?: ToolRun[];
  /** What a tool told Coe. It goes to the model but is not shown as a message. */
  hidden?: boolean;
  /** This reply was made in Deep Work. */
  work?: boolean;
  /** Coe looked it over before finishing: it was fine, or it found and fixed a mistake (and what it was). */
  checked?: 'ok' | 'fixed';
  fix?: string;
  /** Sent while Coe was still answering the message before it. */
  late?: boolean;
  /** A summary standing in for the older messages of a long chat. */
  compact?: boolean;
  /** The person bookmarked this answer. */
  marked?: boolean;
}
export interface Conv { id: string; title: string; created: number; updated: number; model: ModelKey; space?: 'chat' | 'aced'; pinned?: boolean; /** Coe or the person has chosen the name, so it is not changed again. */ named?: boolean; /** Set while a reply is being written, so another device can follow it live. */ live?: number; messages: Msg[]; /** The project folder: file name to text. */ files?: Record<string, string> }
export interface ConvMeta { id: string; title: string; updated: number; space?: 'chat' | 'aced'; pinned?: boolean; count: number }

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
export const dataUrl = (i: Img) => `data:${i.type};base64,${i.data}`;

// ---------------------------------------------------------------- a tiny key-value box in IndexedDB (it holds pictures, which localStorage cannot)
const DB = 'pmc-coe-ai', STORE = 'kv';
let opened: Promise<IDBDatabase | null> | null = null;
const mem = new Map<string, unknown>();               // used when the browser will not let us save (a private window)
export let saving = true;
const db = () => (opened ??= new Promise<IDBDatabase | null>((res) => {
  try {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = r.onblocked = () => { saving = false; res(null); };
  } catch { saving = false; res(null); }
}));
const run = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> => {
  const d = await db(); if (!d) return undefined;
  return new Promise((res) => { try { const r = f(d.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); } catch { res(undefined); } });
};
async function get<T>(k: string): Promise<T | undefined> { const d = await db(); return d ? ((await run('readonly', (s) => s.get(k))) as T | undefined) : (mem.get(k) as T | undefined); }
async function put(k: string, v: unknown) { const d = await db(); if (d) await run('readwrite', (s) => s.put(v, k)); else mem.set(k, v); }
async function del(k: string) { const d = await db(); if (d) await run('readwrite', (s) => s.delete(k)); else mem.delete(k); }

// ---------------------------------------------------------------- conversations
const INDEX = 'index', conv = (id: string) => `conv:${id}`;
export async function loadIndex(): Promise<ConvMeta[]> { return (await get<ConvMeta[]>(INDEX)) ?? []; }
export const loadConv = (id: string) => get<Conv>(conv(id));
export async function saveConv(c: Conv) {
  await put(conv(c.id), c);
  const idx = (await loadIndex()).filter((m) => m.id !== c.id);
  idx.push({ id: c.id, title: c.title, updated: c.updated, space: c.space, pinned: c.pinned, count: c.messages.length });
  await put(INDEX, idx.sort((a, b) => b.updated - a.updated));
}
export async function deleteConv(id: string) { await del(conv(id)); await put(INDEX, (await loadIndex()).filter((m) => m.id !== id)); }
export async function deleteAll() { for (const m of await loadIndex()) await del(conv(m.id)); await put(INDEX, []); }
export async function exportAll(): Promise<Conv[]> { const out: Conv[] = []; for (const m of await loadIndex()) { const c = await loadConv(m.id); if (c) out.push(c); } return out; }
export async function importAll(list: unknown): Promise<number> {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const c of list as Conv[]) {
    if (!c || typeof c.id !== 'string' || !Array.isArray(c.messages)) continue;
    await saveConv({ ...c, messages: c.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string') }); n++;
  }
  return n;
}

// ---------------------------------------------------------------- how much has been used (kept as plain numbers, in this browser)
const USAGE = 'pmc:coe:usage';
interface Use { day: string; today: number; month: string; thisMonth: number }
// Days start at midnight UTC, the same as the server's, so a count kept on this device resets when the server's does.
const stamp = () => { const iso = new Date().toISOString(); return { day: iso.slice(0, 10), month: iso.slice(0, 7) }; };
export function usage(): Use {
  const t = stamp();
  let u: Use = { day: t.day, today: 0, month: t.month, thisMonth: 0 };
  try { const raw = JSON.parse(localStorage.getItem(USAGE) || 'null'); if (raw && typeof raw === 'object') u = { ...u, ...raw }; } catch { /* none yet */ }
  if (u.day !== t.day) { u.day = t.day; u.today = 0; }
  if (u.month !== t.month) { u.month = t.month; u.thisMonth = 0; }
  return u;
}
/** Adds the tokens a reply really used (words in plus words out). */
export function countMessage(tokens = 0): Use { const u = usage(); const n = Math.max(1, Math.round(tokens) || 1); u.today += n; u.thisMonth += n; try { localStorage.setItem(USAGE, JSON.stringify(u)); } catch { /* storage blocked */ } return u; }
/** The server turned a message away because the day's tokens are gone (for example on a shared network), so this device's count says so too. */
export function fillToday(limit: number) { const u = usage(); if (u.today < limit) { u.today = limit; u.thisMonth += 0; try { localStorage.setItem(USAGE, JSON.stringify(u)); } catch { /* storage blocked */ } } return u; }
export function resetToday() { const u = usage(); u.today = 0; try { localStorage.setItem(USAGE, JSON.stringify(u)); } catch { /* storage blocked */ } return u; }

// ---------------------------------------------------------------- words
export const titleFrom = (text: string) => { const t = text.replace(/\s+/g, ' ').trim(); return t ? (t.length > 48 ? t.slice(0, 46).trimEnd() + '…' : t) : 'New conversation'; };

export function toMarkdown(c: Conv, names: (k: ModelKey) => string): string {
  const out = [`# ${c.title}`, '', `_${new Date(c.created).toLocaleString()}_`, ''];
  c.messages.forEach((m) => {
    out.push(m.role === 'user' ? '## You' : `## Coe${m.model ? ` (${names(m.model)})` : ''}`, '');
    if (m.images?.length) out.push(m.images.map((i) => `_[image: ${i.name}]_`).join(' '), '');
    out.push(m.text, '');
  });
  return out.join('\n');
}

export const bucket = (t: number, now = Date.now()): string => {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const day = 86400000, age = d0.getTime() - t;
  return t >= d0.getTime() ? 'Today' : age <= day ? 'Yesterday' : age <= 7 * day ? 'Previous 7 days' : age <= 30 * day ? 'Previous 30 days' : 'Older';
};
