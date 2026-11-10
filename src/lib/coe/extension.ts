'use client';
/**
 * Talks to the Coe Chrome extension. The extension's small script on this site answers messages from the page,
 * so Coe can tell whether it is installed, read its settings and change them. Nothing leaves the browser.
 */
import { useCallback, useEffect, useState } from 'react';

export interface ExtPrefs { scope: 'page' | 'screen'; speed: 'swift' | 'core' | 'deep'; askTabs: 'ask' | 'allow'; askChg: 'ask' | 'allow' }
export const EXT_FILE = 'coe-extension.zip';
export const EXT_FILE_FIREFOX = 'coe-extension-firefox.zip';

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
export function onExtHandoff(cb: (text: string) => void): () => void {
  const on = (e: MessageEvent) => { const d = e.data; if (e.source === window && d && d.coe === 'from-ext' && d.type === 'handoff' && typeof d.text === 'string') cb(d.text); };
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

/** "Connect Coe Mini": the person checked the code matches and pressed Connect. The extension's script on this page takes it from here. */
export const PAIR_KEY = 'pmc:coe:pair';
export function connectMini(code: string, email: string) {
  try { localStorage.setItem(PAIR_KEY, JSON.stringify({ code, email, at: Date.now() })); window.dispatchEvent(new Event('pmc:coe-pair')); } catch { /* blocked */ }
}
export function forgetPair() { try { localStorage.removeItem(PAIR_KEY); } catch { /* blocked */ } }
export const disconnectMini = () => tell({ type: 'unlink' });
/** The extension answers once: yes (connected), or no with a reason ('code' = it was not showing this code, 'account' = Coe Mini is signed in as someone else, 'signin' = Coe Mini is not signed in). */
export function onExtConnected(cb: (yes: boolean, why: string) => void): () => void {
  const on = (e: MessageEvent) => { const d = e.data; if (e.source === window && d && d.coe === 'from-ext' && d.type === 'connected') cb(!!d.yes, String(d.why || '')); };
  window.addEventListener('message', on); tell({ type: 'hello' });
  return () => window.removeEventListener('message', on);
}
