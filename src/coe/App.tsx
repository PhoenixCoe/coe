'use client';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { CoeLoader, useLoadSequence, type LoadStep } from '@/ui/Loader';
import { connection, loadSettings } from '@/lib/coe/settings';
import { loadMarkdown } from './markdown';
import { cloudOn, session, sync, takeAccount, takeLink } from '@/lib/coe/cloud';
import { loadConv, loadIndex, type Conv, type ConvMeta } from './store';
import type { ChatProps } from './Chat';
import { ownerFromUrl } from '@/lib/coe/owner';
import { startPwa } from '@/lib/coe/pwa';

const LAST = 'pmc:coe:last';
/** Wait for something, but never for ever: after ms the page carries on without it (or with the fallback). A phone can hold back a font, a screen frame or the saved-chats store for a long time. */
const within = <T,>(p: Promise<T>, ms: number, fallback: T) => new Promise<T>((ok) => { const t = setTimeout(() => ok(fallback), ms); p.then((v) => { clearTimeout(t); ok(v); }, () => { clearTimeout(t); ok(fallback); }); });
const frame = () => within(new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))), 350, undefined);

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
  for (let i = 0; ; i++) {
    try { return await Promise.race([f(), new Promise<never>((_, no) => setTimeout(() => no(new Error('This part is slow to arrive.')), 20000))]); }
    catch (e) { if (i >= tries - 1) throw e; await new Promise((r) => setTimeout(r, 700 * (i + 1))); }
  }
}

function Boot() {
  // The loader is only there for a slow start: it stays hidden for the first moments (see .ld in the styles), and nothing is held back to show it.
  const [tries, setTries] = useState(0);
  const made = useRef<{ Chat?: ComponentType<ChatProps>; list?: ConvMeta[]; conv?: Conv | null }>({});
  const plan = useRef<LoadStep[] | null>(null);
  if (!plan.current) {
    plan.current = [
      { label: STEPS[0], run: async () => { made.current.Chat = (await again(() => import('./Chat'))).Chat; } },
      { label: STEPS[1], run: () => within((async () => { await document.fonts.ready; await document.fonts.load('14px "JetBrains Mono"'); })(), 3000, undefined) },   // a font that is slow to come is not worth waiting for: other fonts stand in
      { label: STEPS[2], run: () => again(() => loadMarkdown()) },
      { label: STEPS[3], run: async () => {
          if (cloudOn) { await takeAccount(); takeLink(); if (session()) { try { await Promise.race([sync(), new Promise((r) => setTimeout(r, 2500))]); } catch { /* offline: this device keeps its own copy */ } } }   // a slow network never holds the page up
          // The saved-chats store can be slow to open on a phone. After a few seconds Coe opens without the list rather than not at all; a reload brings it back.
          made.current.list = await within(loadIndex(), 6000, [] as ConvMeta[]);
          let id: string | null = null;
          try { id = sessionStorage.getItem(LAST); } catch { /* storage blocked */ }
          made.current.conv = id ? (await within(loadConv(id), 4000, null)) ?? null : null;
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
