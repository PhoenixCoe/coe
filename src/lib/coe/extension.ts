'use client';
/**
 * Talks to the Coe Chrome extension. The extension's small script on this site answers messages from the page,
 * so Coe can tell whether it is installed, read its settings and change them. Nothing leaves the browser.
 */
import { useCallback, useEffect, useState } from 'react';

export interface ExtPrefs { auto: boolean; start: 'bar' | 'small'; speed: 'swift' | 'core' | 'deep' }
export const EXT_FILE = 'coe-extension.zip';

const tell = (m: Record<string, unknown>) => { try { window.postMessage({ coe: 'to-ext', ...m }, location.origin); } catch { /* ignore */ } };

/** Installed or not, the version, and the settings. Checks again every few seconds while it is open. */
export function useExtension(active = true) {
  const [state, setState] = useState<'checking' | 'on' | 'off'>('checking');
  const [version, setVersion] = useState('');
  const [prefs, setPrefs] = useState<ExtPrefs | null>(null);
  useEffect(() => {
    if (!active) return;
    let gone = 0;
    const on = (e: MessageEvent) => {
      const d = e.data;
      if (e.source !== window || !d || d.coe !== 'from-ext') return;
      if (d.type === 'hello') { setState('on'); setVersion(String(d.version || '')); }
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
  return { state, version, prefs, change };
}

/** The extension can send a question and its answer into a new chat ("Continue in Coe"). Asking for it also tells the extension this page is ready. */
export function onExtHandoff(cb: (text: string) => void): () => void {
  const on = (e: MessageEvent) => { const d = e.data; if (e.source === window && d && d.coe === 'from-ext' && d.type === 'handoff' && typeof d.text === 'string') cb(d.text); };
  window.addEventListener('message', on); tell({ type: 'hello' });
  return () => window.removeEventListener('message', on);
}
