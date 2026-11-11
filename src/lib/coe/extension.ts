'use client';
/**
 * Talks to the Coe Chrome extension. The extension's small script on this site answers messages from the page,
 * so Coe can tell whether it is installed, read its settings and change them. Nothing leaves the browser.
 */
import { useCallback, useEffect, useState } from 'react';

export interface ExtPrefs { scope: 'page' | 'screen'; speed: 'swift' | 'core' | 'deep'; askTabs: 'ask' | 'allow'; askChg: 'ask' | 'allow' }
/** Where Coe Mini is listed. Coe Mini is not part of this website: it comes only from the browser stores. Leave a link empty until that store has approved it,
 *  then paste its address here (Chrome Web Store for Chrome, Brave, Opera and Vivaldi; Edge Add-ons for Edge; Firefox Add-ons for Firefox). */
export const MINI_STORE = { chrome: '', edge: '', firefox: '' };

const tell = (m: Record<string, unknown>) => { try { window.postMessage({ coe: 'to-ext', ...m }, location.origin); } catch { /* ignore */ } };

/** Installed or not, the version, and the settings. Checks again every few seconds while it is open. */
export function useExtension(active = true) {
  const [state, setState] = useState<'checking' | 'on' | 'off'>('checking');
  const [version, setVersion] = useState('');
  const [browser, setBrowser] = useState<'chrome' | 'firefox'>('chrome');
  const [prefs, setPrefs] = useState<ExtPrefs | null>(null);
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    if (!active) return;
    let gone = 0;
    const on = (e: MessageEvent) => {
      const d = e.data;
      if (e.source !== window || !d || d.coe !== 'from-ext') return;
      if (d.type === 'hello') { setState('on'); setVersion(String(d.version || '')); setBrowser(d.browser === 'firefox' ? 'firefox' : 'chrome'); setLinked(!!d.linked); if (!d.linked) setPrefs(null); }
      if (d.type === 'link') { setLinked(!!d.linked); if (!d.linked) setPrefs(null); else tell({ type: 'hello' }); }
      if ((d.type === 'hello' || d.type === 'prefs') && d.prefs) setPrefs(d.prefs as ExtPrefs);
      gone = 0;
    };
    window.addEventListener('message', on);
    tell({ type: 'hello' });
    const t = window.setInterval(() => { gone++; if (gone >= 2) setState((s) => (s === 'on' ? 'on' : 'off')); tell({ type: 'hello' }); }, 2000);
    const first = window.setTimeout(() => setState((s) => (s === 'checking' ? 'off' : s)), 1500);
    return () => { window.removeEventListener('message', on); window.clearInterval(t); window.clearTimeout(first); };
  }, [active]);
  const change = useCallback((patch: Partial<ExtPrefs>) => { setPrefs((p) => (p ? { ...p, ...patch } : p)); tell({ type: 'set', prefs: patch }); }, []);
  return { state, version, browser, prefs, change, linked };
}

/** The extension can send a question and its answer into a new chat ("Continue in Coe"). Asking for it also tells the extension this page is ready. */
/** Puts a request in Coe Mini's inbox (Coe Mini asks before using it). Only works when Coe Mini is installed in this browser. */
export const sendToMini = (text: string) => tell({ type: 'to-mini', text: String(text).slice(0, 4000) });

export function onExtHandoff(cb: (text: string, chat: string) => void): () => void {
  const on = (e: MessageEvent) => { const d = e.data; if (e.source === window && d && d.coe === 'from-ext' && d.type === 'handoff' && typeof d.text === 'string') cb(d.text, typeof d.chat === 'string' ? d.chat.slice(0, 60) : ''); };
  window.addEventListener('message', on); tell({ type: 'hello' });
  return () => window.removeEventListener('message', on);
}

/** Tokens the Chrome sidebar gave back (a change that could not be made on a page, cut-off code). They are listed in Settings > Usage > Refunds. */
export function onExtRefunds(cb: (items: { id: string; t: number; tokens: number; why: string; chat: string }[]) => void): () => void {
  const on = (e: MessageEvent) => {
    const d = e.data;
    if (e.source !== window || !d || d.coe !== 'from-ext' || d.type !== 'refunds' || !Array.isArray(d.items)) return;
    cb(d.items); tell({ type: 'refunds-ack', ids: d.items.map((x: { id?: unknown }) => String(x?.id ?? '')) });
  };
  window.addEventListener('message', on); tell({ type: 'hello' });
  return () => window.removeEventListener('message', on);
}

/** Coe Mini works on the open page (change these words, mark these words, open a tab, search). The website has no page to do that on, so in a chat that came from Coe Mini those blocks read as one plain line instead of code. */
export function miniActionsAsWords(text: string): string {
  const cut = (v: unknown, n = 80) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  return text.replace(/```(coe-edit|coe-highlight|coe-open|coe-search|coe-remember)[ \t]*\n([\s\S]*?)(?:```|$)/g, (_m, kind: string, body: string) => {
    let j: Record<string, unknown> | null = null; try { const x = JSON.parse(body); if (x && typeof x === 'object') j = x as Record<string, unknown>; } catch { /* cut short */ }
    if (!j) return '';
    if (kind === 'coe-edit') return j.find ? `Coe Mini suggested a change on the page: “${cut(j.find)}” to “${cut(j.text)}”.` : `Coe Mini suggested new words for what was selected: “${cut(j.text)}”.`;
    if (kind === 'coe-highlight') { const n = Array.isArray(j.phrases) ? j.phrases.length : 0; return `Coe Mini marked ${n} ${n === 1 ? 'place' : 'places'} on the page.`; }
    if (kind === 'coe-open') return j.search ? `Coe Mini offered to search for “${cut(j.search)}”.` : `Coe Mini offered to open ${cut(j.url, 120)}.`;
    if (kind === 'coe-search') return `Coe Mini searched the web for “${cut(j.q)}”.`;
    return j.fact ? `Coe Mini saved a note: “${cut(j.fact, 160)}”.` : '';
  }).replace(/\n{3,}/g, '\n\n').trim();
}

/** Chats made in the Coe Mini sidebar. They are added to the chat list here, each one once and updated if it grows. */
export interface ExtChat { id: string; title: string; host: string; url: string; t: number; msgs: { r: 'u' | 'a'; t: string; at?: number }[] }
export function onExtChats(cb: (items: ExtChat[]) => void): () => void {
  const on = (e: MessageEvent) => {
    const d = e.data;
    if (e.source !== window || !d || d.coe !== 'from-ext' || d.type !== 'chats' || !Array.isArray(d.items)) return;
    cb((d.items as ExtChat[]).filter((c) => c && typeof c.id === 'string' && Array.isArray(c.msgs)));
  };
  window.addEventListener('message', on); tell({ type: 'hello' });
  return () => window.removeEventListener('message', on);
}

/** About you answers changed in the sidebar. The newer copy wins. */
export function onExtProfile(cb: (me: Record<string, unknown>) => void): () => void {
  const on = (e: MessageEvent) => { const d = e.data; if (e.source === window && d && d.coe === 'from-ext' && d.type === 'profile' && d.me && typeof d.me === 'object') cb(d.me as Record<string, unknown>); };
  window.addEventListener('message', on); tell({ type: 'hello' });
  return () => window.removeEventListener('message', on);
}

/** Coe Mini says setup was already done there, so this site does not ask again. */
export function onExtMet(cb: () => void): () => void {
  const on = (e: MessageEvent) => { const d = e.data; if (e.source === window && d && d.coe === 'from-ext' && (d.type === 'met' || (d.type === 'profile' && d.me && d.me.met))) cb(); };
  window.addEventListener('message', on); tell({ type: 'hello' });
  return () => window.removeEventListener('message', on);
}

/** The page colour or accent was changed in the sidebar. The newer choice wins. */
export function onExtLook(cb: (look: Record<string, unknown>) => void): () => void {
  const on = (e: MessageEvent) => { const d = e.data; if (e.source === window && d && d.coe === 'from-ext' && d.type === 'look' && d.look && typeof d.look === 'object') cb(d.look as Record<string, unknown>); };
  window.addEventListener('message', on);
  return () => window.removeEventListener('message', on);
}

/** "Connect Coe Mini": the person checked the code matches and pressed Connect. The extension's script on this page takes it from here. */
export const PAIR_KEY = 'pmc:coe:pair';
export function connectMini(code: string, email: string) {
  try { localStorage.setItem(PAIR_KEY, JSON.stringify({ code, email, at: Date.now() })); window.dispatchEvent(new Event('pmc:coe-pair')); } catch { /* blocked */ }
}
export function forgetPair() { try { localStorage.removeItem(PAIR_KEY); } catch { /* blocked */ } }
/** "Decline": the person refused the link on Coe. Coe Mini is told, drops its code and says so. */
export function declineMini() { forgetPair(); tell({ type: 'pair-decline' }); }
export const disconnectMini = () => tell({ type: 'unlink' });
/** The extension answers once: yes (connected), or no with a reason ('code' = it was not showing this code, 'account' = Coe Mini is signed in as someone else, 'signin' = Coe Mini is not signed in). */
export function onExtConnected(cb: (yes: boolean, why: string) => void): () => void {
  const on = (e: MessageEvent) => { const d = e.data; if (e.source === window && d && d.coe === 'from-ext' && d.type === 'connected') cb(!!d.yes, String(d.why || '')); };
  window.addEventListener('message', on); tell({ type: 'hello' });
  return () => window.removeEventListener('message', on);
}
