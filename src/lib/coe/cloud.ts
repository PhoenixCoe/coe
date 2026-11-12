/**
 * Optional accounts, through Supabase. Without the two public settings below the site works exactly as before and
 * keeps chats on the device. With them, signing in saves chats to the person's own account and syncs them.
 * The URL and the anon key are meant to be public. What protects the data is the row rule in the database (see DEPLOY.md).
 */
import { COE_VERSION } from './changelog';
import type { Conv } from '@/coe/store';
import { deleteConv, loadConv, loadIndex, saveConv } from '@/coe/store';
import { memory, setMemory } from './links';
import { mergeStudy, snapshotStudy, type StudyData } from './study';
import { mergeStyles, stylesOut } from './personas';
import { forgetAvatar, loadAvatar, saveAvatar, validAvatar } from './avatar';
import { THEMES, setTheme } from './look';
import { aboutRecord, loadSettings, markMet, metBy, saveSettings, withAbout, type AboutRecord } from './settings';

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const cloudOn = !!(URL_ && KEY);
// The Coe Chrome extension reads this on the site, so it knows where to sign in and which server to ask.
if (typeof window !== 'undefined') {
  try { localStorage.setItem('pmc:coe:ext', JSON.stringify({ sb: URL_, key: KEY, server: (process.env.NEXT_PUBLIC_COE_SERVER ?? '').trim().replace(/\/+$/, '') })); } catch { /* storage blocked */ }
}

export interface Session { access: string; refresh: string; exp: number; email: string; uid: string }
const SKEY = 'pmc:coe:session', SYNCED = 'pmc:coe:synced', ERRKEY = 'pmc:coe:autherr';
/** If coming back from a provider failed, the reason (once). */
export function takeAuthError(): string { try { const e = sessionStorage.getItem(ERRKEY) || ''; sessionStorage.removeItem(ERRKEY); return e; } catch { return ''; } }

const payload = (jwt: string): { sub?: string; email?: string; exp?: number } => {
  try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
};
export function session(): Session | null { try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); return s && s.access ? s : null; } catch { return null; } }
function keep(access: string, refresh: string): Session | null {
  const p = payload(access); if (!p.sub) return null;
  const s: Session = { access, refresh, exp: (p.exp ?? 0) * 1000, email: p.email ?? '', uid: p.sub };
  try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  touchApp(s);
  return s;
}
const SEEN = 'pmc:coe:seen';
/** Lets the PMC Account page list Coe among the sites this account has used: a site name and a time, nothing else. At most every six hours, and a failure is quietly ignored (tried again in about an hour). */
function touchApp(s: Session) {
  try {
    if (typeof window === 'undefined' || !URL_) return;
    const last = JSON.parse(localStorage.getItem(SEEN) || 'null'), H = 3600_000;
    if (last && last.u === s.uid && Date.now() - last.t < 6 * H) return;
    const mark = (t: number) => { try { localStorage.setItem(SEEN, JSON.stringify({ u: s.uid, t })); } catch { /* storage blocked */ } };
    mark(Date.now());
    void fetch(`${URL_}/rest/v1/app_access?on_conflict=user_id,app`, { method: 'POST', headers: head({ prefer: 'resolution=merge-duplicates,return=minimal' }, s.access), body: JSON.stringify({ app: 'coe', label: 'Coe', pmc: true, last_at: new Date().toISOString() }) })
      .then((r) => { if (!r.ok) mark(Date.now() - 5 * H); }).catch(() => mark(Date.now() - 5 * H));
  } catch { /* nothing */ }
}

/** Clears a failed sign-in's message from the address. A sign-in is never taken from a link: anyone could build a link that signs you in to THEIR account, and then what you write would be saved there.
 *  The only ways in are a code you type, or the PMC Account page's hand-back, which is checked against a one-time value (takeAccount). */
export function takeLink(): boolean {
  if (!cloudOn) return false;
  try {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    const bad = h.get('error_description') || new URLSearchParams(location.search).get('error_description');
    if (bad) { try { sessionStorage.setItem(ERRKEY, bad.replace(/\+/g, ' ').slice(0, 200)); } catch { /* ignore */ } history.replaceState(null, '', location.pathname); }
    else if (h.get('access_token') || h.get('refresh_token')) history.replaceState(null, '', location.pathname + location.search);   // tokens in a link are thrown away, never used
    return false;
  } catch { return false; }
}

// ---------------------------------------------------------------- PMC Account (accounts.pmcstudios.uk)
/** The PMC Account page. Coe sends you there to sign in with your email and password, and it sends you straight back. */
export const ACCOUNTS = (process.env.NEXT_PUBLIC_ACCOUNTS_URL ?? 'https://accounts.pmcstudios.uk').trim().replace(/\/+$/, '');
const ASTATE = 'pmc:coe:acc-state', ANOTE = 'pmc:coe:acc-note';
const b64u = (a: Uint8Array) => btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const LIVE = 'pmc:coe:acc-live';
/** Whether the PMC Account page can be reached right now, so Coe never sends you to a page that is not there (for instance before it is switched on). It loads one small picture from the page, which sends nothing about you. The answer is kept for ten minutes, and a slow answer counts as "yes". */
export function accountsLive(): Promise<boolean> {
  return new Promise((res) => {
    try { const c = JSON.parse(sessionStorage.getItem(LIVE) || 'null'); if (c && Date.now() - c.t < 600_000) { res(!!c.ok); return; } } catch { /* no saved answer */ }
    let done = false;
    const fin = (ok: boolean, keepIt = true) => { if (done) return; done = true; if (keepIt) { try { sessionStorage.setItem(LIVE, JSON.stringify({ ok, t: Date.now() })); } catch { /* storage blocked */ } } res(ok); };
    try { const i = new Image(); i.onload = () => fin(true); i.onerror = () => fin(false); setTimeout(() => fin(true, false), 6000); i.src = `${ACCOUNTS}/img/favicon.svg?c=${Date.now()}`; } catch { fin(true, false); }
  });
}
/** Goes to the PMC Account page. A one-time value is made here and kept in this tab; the way back is only accepted if it brings the same value. */
export function startAccountSignIn(where: '' | 'create' | 'reset' | 'signin' = '', hint = ''): void {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  const st = b64u(a);
  try { sessionStorage.setItem(ASTATE, JSON.stringify({ st, at: Date.now() })); } catch { throw new Error('This browser is blocking the storage Coe needs to sign you in safely. Turn off private mode or allow site data, then try again.'); }
  // hint: the email to fill in for you, when you pick one of the accounts already used on this device. It is only a convenience: the password is still typed on the PMC Account page.
  const h = hint.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(hint) ? `&hint=${encodeURIComponent(hint)}` : '';
  location.assign(`${ACCOUNTS}/?app=coe&state=${st}${h}${where ? '#' + where : ''}`);
}
const same = (x: string, y: string) => { if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i); return d === 0; };
/** Coming back from the PMC Account page, the sign-in is in the address. It is taken only if the one-time value matches, the address is cleaned at once, and the refresh token that travelled is swapped for a new one straight away. */
export async function takeAccount(): Promise<boolean> {
  if (!cloudOn || typeof location === 'undefined') return false;
  let h: URLSearchParams; try { h = new URLSearchParams(location.hash.replace(/^#/, '')); } catch { return false; }
  const st = h.get('pmc_state'); if (!st) return false;
  const a = h.get('access_token') || '', r = h.get('refresh_token') || '';
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }   // out of the address bar and the history before anything else
  let want: { st?: string; at?: number } | null = null;
  try { want = JSON.parse(sessionStorage.getItem(ASTATE) || 'null'); sessionStorage.removeItem(ASTATE); } catch { /* ignore */ }
  const note = (v: string, err = '') => { try { sessionStorage.setItem(ANOTE, v); if (err) sessionStorage.setItem(ERRKEY, err); } catch { /* ignore */ } };
  if (!want || !want.st || !same(want.st, st) || Date.now() - (want.at ?? 0) > 15 * 60_000 || !a || !r) { note('bad', 'That sign-in did not come from this window, so Coe ignored it. Press Sign in with PMC to try again.'); return false; }
  let na = a, nr = r;
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 4000);
    const x = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: head(), body: JSON.stringify({ refresh_token: r }), signal: ctl.signal }).finally(() => clearTimeout(to));
    if (!x.ok) { note('bad', 'That sign-in had already been used or had run out. Press Sign in with PMC to try again.'); return false; }
    const j = await x.json(); na = j.access_token; nr = j.refresh_token;
  } catch { /* offline or slow: keep what arrived; it is swapped the first time Coe refreshes */ }
  if (!keep(na, nr)) { note('bad', 'That sign-in did not work. Press Sign in with PMC to try again.'); return false; }
  note('in'); return true;
}
/** What happened on the way back, once: 'in' (signed in), 'bad' (it was refused), or ''. */
export function takeAccountNote(): 'in' | 'bad' | '' { try { const v = sessionStorage.getItem(ANOTE) || ''; sessionStorage.removeItem(ANOTE); return v === 'in' || v === 'bad' ? v : ''; } catch { return ''; } }

// A newer "sb_publishable_" key is not a token, so on its own it goes in apikey only. A signed-in person's token goes in authorization.
const head = (extra: Record<string, string> = {}, bearer = KEY) => ({ apikey: KEY, ...(bearer.startsWith('sb_') ? {} : { authorization: `Bearer ${bearer}` }), 'content-type': 'application/json', ...extra });
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
const textOnly = (c: Conv): Conv => ({
  ...c,
  messages: c.messages.map((m) => {
    const lean = { ...m };
    if (m.images?.length) lean.images = undefined;
    if (m.attach?.length) lean.attach = m.attach.map((a) => ({ ...a, text: a.text.slice(0, 2000) }));
    if (m.runs?.length) lean.runs = m.runs.map((r) => ({ ...r, out: r.out && (r.out.kind === 'image' || r.out.kind === 'files') ? undefined : r.out }));
    return lean;
  }),
});

export async function put(c: Conv) {
  const s = session(); if (!s || c.temp) return;
  await rest('chats?on_conflict=user_id,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: s.uid, id: c.id, title: c.title, updated: c.updated, pinned: !!c.pinned, data: textOnly(c) }) });
  const k = ids(); k.add(c.id); setIds(k);
}
/** While a reply is being written: the chat so far, marked live, so another device that has it open can follow along. */
export async function putLive(c: Conv) { await put({ ...c, live: Date.now() }); }
/** What the account holds for one chat right now, for following a reply that is being written on another device. */
export async function peek(id: string): Promise<{ updated: number; data: Conv } | null> {
  if (!session()) return null;
  const rows: { updated: number; data: Conv }[] = await (await rest(`chats?id=eq.${encodeURIComponent(id)}&select=updated,data`)).json();
  const r = rows[0]; return r && r.data && Array.isArray(r.data.messages) ? r : null;
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

// ---------------------------------------------------------------- the person's own notes follow the account
/** The study decks go with the account too, but only once there is something in them. */
const studyOut = (): StudyData | undefined => { const d = snapshotStudy(); return d.cards.length || d.xp ? d : undefined; };
/** The About you answers, with the time they were last changed, so every device ends up with the newest. */
type About = AboutRecord;
const aboutOut = (): About | undefined => { const s = loadSettings(); return s.profileAt ? aboutRecord(s) : undefined; };
export async function pushProfile() {
  const s = session(); if (!s) return;
  await rest('profiles?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: s.uid, data: { memory: memory(), study: studyOut(), styles: stylesOut(), about: aboutOut(), avatar: loadAvatar() ?? undefined, met: accountMet || metBy() === s.uid ? 1 : undefined }, updated: new Date().toISOString() }) });
}
/** Has the account's profile been read on this device yet? Until it has, nobody can tell whether setup was already done somewhere else. */
let seen = false, accountMet = false;
export const profileSeen = () => seen;
/** Has THIS account finished setup (here or on another device)? Only known once the profile has been read. */
export const accountDone = () => accountMet;
/** Setup was just finished while signed in. */
export function noteAccountMet() { accountMet = true; }
/** Signed out: the next account to sign in is a different question. */
export function resetProfileSeen() { seen = false; accountMet = false; }
async function syncProfile() {
  const rows: { data?: { memory?: unknown; study?: StudyData; styles?: unknown; about?: About; avatar?: unknown; met?: unknown } }[] = await (await rest('profiles?select=data')).json();
  const theirs = Array.isArray(rows[0]?.data?.memory) ? (rows[0].data!.memory as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const mine = memory(), merged = setMemory([...theirs, ...mine]);
  const theirStudy = rows[0]?.data?.study;
  if (theirStudy && Array.isArray(theirStudy.cards) && Array.isArray(theirStudy.decks)) mergeStudy(theirStudy);
  const now = studyOut();
  const studyChanged = !!now && JSON.stringify(now) !== JSON.stringify(theirStudy ?? null);
  mergeStyles(rows[0]?.data?.styles);
  const styNow = stylesOut();
  const stylesChanged = !!styNow && JSON.stringify(styNow) !== JSON.stringify(rows[0]?.data?.styles ?? null);
  // About you follows the account: a new device, or the Coe Mini add-on, starts already knowing you. The newer copy wins.
  const ab = rows[0]?.data?.about, cur = loadSettings();
  // Setup done on another device (or answers already saved) means this one does not ask again.
  const theirMet = !!rows[0]?.data?.met || !!(ab && Number(ab.at) > 0), uid = session()?.uid ?? '';
  accountMet = theirMet || (!!uid && metBy() === uid);
  if (accountMet && uid) markMet(uid);   // this device remembers which account finished setup
  seen = true; try { window.dispatchEvent(new Event('pmc:coe-profile')); } catch { /* no window */ }   // only now can the page tell whether setup is due
  let aboutChanged = false;
  if (ab && Number(ab.at) > (cur.profileAt || 0)) {
    saveSettings(withAbout(cur, ab as Record<string, unknown>, Number(ab.at)));
    aboutChanged = false;
  } else { const mine = aboutOut(); aboutChanged = !!mine && JSON.stringify(mine) !== JSON.stringify(ab ?? null); }
  // The profile picture follows the account too. The newer one wins; taking it away counts as a change.
  const av = rows[0]?.data?.avatar, myAv = loadAvatar();
  let avatarChanged = false;
  if (validAvatar(av) && av.at > (myAv?.at ?? 0)) saveAvatar(av.img, av.at);
  else avatarChanged = !!myAv && JSON.stringify(myAv) !== JSON.stringify(av ?? null);
  if (avatarChanged || merged.length !== theirs.length || merged.some((m, i) => m !== theirs[i]) || studyChanged || stylesChanged || aboutChanged || (accountMet && !rows[0]?.data?.met)) await pushProfile();
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
        const merged = mine ? { ...d, messages: d.messages.map((m) => { const o = mine.messages.find((x) => x.id === m.id); return o ? { ...m, ...(o.images?.length ? { images: o.images } : {}), ...(o.attach?.length ? { attach: o.attach } : {}), ...(o.runs?.length ? { runs: o.runs } : {}) } : m; }) } : d;
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
  try { await syncProfile(); } catch { /* notes are best effort; chats are what matter */ }
  return changed;
}

/** Signing out takes the account's chats off this device, so the next person does not see them. */
export async function signOut() {
  try { await sync(); } catch { /* offline: leave the chats where they are */ return false; }
  for (const m of await loadIndex()) await deleteConv(m.id);
  try { localStorage.removeItem(SKEY); localStorage.removeItem(SYNCED); } catch { /* ignore */ }
  resetProfileSeen();
  // Signed out means nobody's look is left behind: the picture goes and the colours go back to normal PMC.
  forgetAvatar(); setTheme(THEMES[0]);
  return true;
}


// ---------------------------------------------------------------- sharing a chat as a read-only link
/** What a shared page holds: words only. No pictures, files or tool results, and nothing about the person. */
export interface Shared { title: string; ts: number; from?: 'coe' | 'mini'; v?: string; messages: { role: 'user' | 'assistant'; text: string }[] }
const SHARES = 'pmc:coe:shares';
const MAX_SHARE = 400_000;
const shareMap = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SHARES) || '{}'); } catch { return {}; } };
const setShareMap = (m: Record<string, string>) => { try { localStorage.setItem(SHARES, JSON.stringify(m)); } catch { /* storage blocked */ } };
export const sharedId = (convId: string): string => shareMap()[convId] ?? '';
const newShareId = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); const c = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(a, (x) => c[x % c.length]).join(''); };
const forShare = (c: Conv): Shared => ({
  title: c.title.slice(0, 120), ts: Date.now(), from: 'coe', v: COE_VERSION,
  messages: c.messages.filter((m) => !m.hidden && m.text.trim() && !m.error).map((m) => ({ role: m.role, text: m.text.replace(/```coe-(?:tool|plan|remember)[\s\S]*?```/g, '').trim().slice(0, 60_000) })).filter((m) => m.text),
});
/** Makes (or refreshes) the link for a chat. Returns the id that goes after the # in the address. */
export async function shareChat(c: Conv): Promise<string> {
  const s = session(); if (!s) throw new Error('Sign in to share a link.');
  const data = forShare(c);
  if (!data.messages.length) throw new Error('There is nothing in this chat to share yet.');
  if (JSON.stringify(data).length > MAX_SHARE) throw new Error('This chat is too long to share as one link. Share a shorter one.');
  const m = shareMap(), id = m[c.id] || newShareId();
  await rest('shares?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, user_id: s.uid, data }) });
  m[c.id] = id; setShareMap(m); return id;
}
export async function unshareChat(convId: string) {
  const m = shareMap(), id = m[convId]; if (!id) return;
  if (session()) await rest(`shares?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  delete m[convId]; setShareMap(m);
}
/** Reads a shared chat. Anyone with the link can; no sign-in. Null when it does not exist or was withdrawn. */
export async function readShare(id: string): Promise<Shared | null> {
  if (!cloudOn || !/^[A-Za-z0-9]{12,40}$/.test(id)) return null;
  const r = await fetch(`${URL_}/rest/v1/rpc/get_share`, { method: 'POST', headers: head(), body: JSON.stringify({ share_id: id }) });
  if (!r.ok) throw await fail(r);
  const j = await r.json();
  if (!j || !Array.isArray(j.messages)) return null;
  return { title: String(j.title ?? 'A chat with Coe').slice(0, 120), ts: Number(j.ts) || 0, from: j.from === 'mini' ? 'mini' : j.from === 'coe' ? 'coe' : undefined, v: /^[0-9.]{1,12}$/.test(String(j.v ?? '')) ? String(j.v) : undefined, messages: j.messages.filter((m: { role?: string; text?: unknown }) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').slice(0, 400).map((m: { role: 'user' | 'assistant'; text: string }) => ({ role: m.role, text: m.text })) };
}
