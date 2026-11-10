'use client';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { CoeLoader, useLoadSequence, type LoadStep } from '@/ui/Loader';
import { connection, loadSettings } from '@/lib/coe/settings';
import { loadMarkdown } from './markdown';
import { cloudOn, session, sync, takeLink } from '@/lib/coe/cloud';
import { loadConv, loadIndex, type Conv, type ConvMeta } from './store';
import type { ChatProps } from './Chat';
import { ownerFromUrl } from '@/lib/coe/owner';
import { startPwa } from '@/lib/coe/pwa';

const LAST = 'pmc:coe:last';
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/**
 * Coe. The workspace is its own chunk, so the loader covers the whole window while it is fetched, the fonts and the
 * text formatter are ready, and your saved conversations are opened.
 */
export default function App() {
  useEffect(() => { ownerFromUrl(); startPwa(); }, []);
  return <Boot />;
}

const STEPS = ['Loading the workspace', 'Loading the fonts', 'Preparing the text formatter', 'Opening your chats', 'Checking the connection'];
/** A file that fails to arrive on a weak mobile connection gets a few more tries before giving up. */
async function again<T>(f: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) { try { return await f(); } catch (e) { if (i >= tries - 1) throw e; await new Promise((r) => setTimeout(r, 700 * (i + 1))); } }
}

function Boot() {
  // The loader is only there for a slow start: it stays hidden for the first moments (see .ld in the styles), and nothing is held back to show it.
  const [tries, setTries] = useState(0);
  const made = useRef<{ Chat?: ComponentType<ChatProps>; list?: ConvMeta[]; conv?: Conv | null }>({});
  const plan = useRef<LoadStep[] | null>(null);
  if (!plan.current) {
    plan.current = [
      { label: STEPS[0], run: async () => { made.current.Chat = (await again(() => import('./Chat'))).Chat; } },
      { label: STEPS[1], run: async () => { try { await document.fonts.ready; await document.fonts.load('14px "JetBrains Mono"'); } catch { /* falls back to other fonts */ } } },
      { label: STEPS[2], run: () => loadMarkdown() },
      { label: STEPS[3], run: async () => {
          if (cloudOn) { takeLink(); if (session()) { try { await Promise.race([sync(), new Promise((r) => setTimeout(r, 2500))]); } catch { /* offline: this device keeps its own copy */ } } }   // a slow network never holds the page up
          made.current.list = await loadIndex();
          let id: string | null = null;
          try { id = sessionStorage.getItem(LAST); } catch { /* storage blocked */ }
          made.current.conv = id ? (await loadConv(id)) ?? null : null;
        } },
      { label: STEPS[4], run: async () => { connection(loadSettings()); await frame(); } },
    ];
  }
  const load = useLoadSequence(plan.current, 0, tries);
  const { Chat, list, conv } = made.current;
  // Tell the page that Coe is open, so the recovery help in the page's head stands down.
  useEffect(() => { if (load.ready && Chat) { try { document.documentElement.classList.add('coe-ready'); (window as unknown as { __coeHideStuck?: () => void }).__coeHideStuck?.(); } catch { /* ignore */ } } }, [load.ready, Chat]);
  if (!load.ready) return <CoeLoader title="Coe" steps={STEPS} index={load.index} error={load.error} onRetry={() => { made.current = {}; setTries((n) => n + 1); }} />;
  return Chat ? <><Chat initialList={list ?? []} initialConv={conv ?? null} /></> : null;
}
