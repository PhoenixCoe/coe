/**
 * Optional accounts, through Supabase. Without the two public settings below the site works exactly as before and
 * keeps chats on the device. With them, signing in saves chats to the person's own account and syncs them.
 * The URL and the anon key are meant to be public. What protects the data is the row rule in the database (see DEPLOY.md).
 */
import type { Conv } from '@/coe/store';
import { deleteConv, loadConv, loadIndex, saveConv } from '@/coe/store';

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const cloudOn = !!(URL_ && KEY);

export interface Session { access: string; refresh: string; exp: number; email: string; uid: string }
const SKEY = 'pmc:coe:session', SYNCED = 'pmc:coe:synced';

const payload = (jwt: string): { sub?: string; email?: string; exp?: number } => {
  try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
};
export function session(): Session | null { try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); return s && s.access ? s : null; } catch { return null; } }
function keep(access: string, refresh: string): Session | null {
  const p = payload(access); if (!p.sub) return null;
  const s: Session = { access, refresh, exp: (p.exp ?? 0) * 1000, email: p.email ?? '', uid: p.sub };
  try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  return s;
}

/** Coming back from the email link, the tokens are in the address. Takes them, and cleans the address. */
export function takeLink(): boolean {
  if (!cloudOn) return false;
  try {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    const a = h.get('access_token'), r = h.get('refresh_token');
    if (!a || !r) return false;
    history.replaceState(null, '', location.pathname + location.search);
    return !!keep(a, r);
  } catch { return false; }
}

const head = (extra: Record<string, string> = {}, bearer = KEY) => ({ apikey: KEY, authorization: `Bearer ${bearer}`, 'content-type': 'application/json', ...extra });
const fail = async (r: Response) => { let m = ''; try { const j = await r.json(); m = j.msg || j.message || j.error_description || j.error || ''; } catch { /* no body */ } return new Error(m || `Request failed (${r.status})`); };

export async function sendCode(email: string) {
  const r = await fetch(`${URL_}/auth/v1/otp?redirect_to=${encodeURIComponent(location.origin + '/')}`, { method: 'POST', headers: head(), body: JSON.stringify({ email, create_user: true }) });
  if (!r.ok) throw await fail(r);
}
export async function verifyCode(email: string, code: string) {
  const r = await fetch(`${URL_}/auth/v1/verify`, { method: 'POST', headers: head(), body: JSON.stringify({ type: 'email', email, token: code.trim() }) });
  if (!r.ok) throw await fail(r);
  const j = await r.json();
  if (!keep(j.access_token, j.refresh_token)) throw new Error('That sign-in did not work. Try again.');
}

/** A token that is still good, refreshed when it is nearly out of date. */
export async function token(): Promise<string | null> {
  const s = session(); if (!s) return null;
  if (s.exp - Date.now() > 60_000) return s.access;
  try {
    const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: head(), body: JSON.stringify({ refresh_token: s.refresh }) });
    if (!r.ok) { if (r.status === 400 || r.status === 401) { try { localStorage.removeItem(SKEY); } catch { /* ignore */ } } return null; }
    const j = await r.json(); return keep(j.access_token, j.refresh_token)?.access ?? null;
  } catch { return s.exp > Date.now() ? s.access : null; }
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const t = await token(); if (!t) throw new Error('Not signed in.');
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...head({}, t), ...(init.headers as Record<string, string> | undefined) } });
  if (!r.ok) throw await fail(r);
  return r;
}

interface Row { id: string; title: string; updated: number; pinned: boolean | null }
const ids = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(SYNCED) || '[]')); } catch { return new Set(); } };
const setIds = (s: Set<string>) => { try { localStorage.setItem(SYNCED, JSON.stringify([...s])); } catch { /* ignore */ } };

/** Pictures stay on the device: a database row is for text. */
const textOnly = (c: Conv): Conv => ({ ...c, messages: c.messages.map((m) => (m.images?.length ? { ...m, images: undefined } : m)) });

export async function put(c: Conv) {
  const s = session(); if (!s) return;
  await rest('chats?on_conflict=user_id,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: s.uid, id: c.id, title: c.title, updated: c.updated, pinned: !!c.pinned, data: textOnly(c) }) });
  const k = ids(); k.add(c.id); setIds(k);
}
export async function remove(id: string) {
  if (!session()) return;
  await rest(`chats?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  const k = ids(); k.delete(id); setIds(k);
}
export async function removeAll() {
  const s = session(); if (!s) return;
  await rest(`chats?user_id=eq.${s.uid}`, { method: 'DELETE' }); setIds(new Set());
}

/** Brings this device and the account to the same list. Returns how many chats changed on this device. */
export async function sync(): Promise<number> {
  if (!cloudOn || !session()) return 0;
  const remote: Row[] = await (await rest('chats?select=id,title,updated,pinned&order=updated.desc&limit=1000')).json();
  const local = await loadIndex(), known = ids(), now = new Set<string>();
  let changed = 0;
  for (const r of remote) {
    now.add(r.id);
    const l = local.find((m) => m.id === r.id);
    if (!l || r.updated > l.updated) {
      const rows: { data: Conv }[] = await (await rest(`chats?id=eq.${encodeURIComponent(r.id)}&select=data`)).json();
      const d = rows[0]?.data;
      if (d && Array.isArray(d.messages)) {
        // Keep pictures this device already has for messages that are unchanged.
        const mine = l ? await loadConv(r.id) : undefined;
        const merged = mine ? { ...d, messages: d.messages.map((m) => { const o = mine.messages.find((x) => x.id === m.id); return o?.images?.length ? { ...m, images: o.images } : m; }) } : d;
        await saveConv(merged); changed++;
      }
    }
  }
  for (const l of local) {
    const r = remote.find((x) => x.id === l.id);
    if (!r) {
      if (known.has(l.id)) { await deleteConv(l.id); changed++; }   // it was on the account, and was deleted from another device
      else { const c = await loadConv(l.id); if (c?.messages.length) { await put(c); now.add(l.id); } }
    } else if (l.updated > r.updated) { const c = await loadConv(l.id); if (c) { await put(c); } }
  }
  setIds(now);
  return changed;
}

/** Signing out takes the account's chats off this device, so the next person does not see them. */
export async function signOut() {
  try { await sync(); } catch { /* offline: leave the chats where they are */ return false; }
  for (const m of await loadIndex()) await deleteConv(m.id);
  try { localStorage.removeItem(SKEY); localStorage.removeItem(SYNCED); } catch { /* ignore */ }
  return true;
}
