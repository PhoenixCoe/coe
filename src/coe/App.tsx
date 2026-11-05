'use client';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { CoeLoader, useLoadSequence, type LoadStep } from '@/ui/Loader';
import { connection, loadSettings } from '@/lib/coe/settings';
import { loadMarkdown } from './markdown';
import { cloudOn, session, sync, takeLink } from '@/lib/coe/cloud';
import { loadConv, loadIndex, type Conv, type ConvMeta } from './store';
import type { ChatProps } from './Chat';
import { ownerFromUrl } from '@/lib/coe/owner';

const SEEN = 'pmc:coe:intro';
const introSeen = () => { try { return localStorage.getItem(SEEN) === '1'; } catch { return false; } };

const LAST = 'pmc:coe:last';
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/**
 * Coe. The workspace is its own chunk, so the loader covers the whole window while it is fetched, the fonts and the
 * text formatter are ready, and your saved conversations are opened.
 */
export default function App() {
  const [first, setFirst] = useState<boolean | null>(null);
  useEffect(() => { ownerFromUrl(); setFirst(!introSeen()); }, []);
  return first === null ? <div className="ld-quiet" aria-busy="true" /> : <Boot first={first} />;
}

function Boot({ first }: { first: boolean }) {
  const made = useRef<{ Chat?: ComponentType<ChatProps>; list?: ConvMeta[]; conv?: Conv | null }>({});
  const plan = useRef<LoadStep[] | null>(null);
  if (!plan.current) {
    plan.current = [
      { label: 'Loading the workspace', run: async () => { made.current.Chat = (await import('./Chat')).Chat; } },
      { label: 'Loading the fonts', run: async () => { try { await document.fonts.ready; await document.fonts.load('14px "JetBrains Mono"'); } catch { /* falls back to other fonts */ } } },
      { label: 'Preparing the text formatter', run: () => loadMarkdown() },
      { label: 'Opening your chats', run: async () => {
          if (cloudOn) { takeLink(); if (session()) { try { await sync(); } catch { /* offline: this device keeps its own copy */ } } }
          made.current.list = await loadIndex();
          let id: string | null = null;
          try { id = sessionStorage.getItem(LAST); } catch { /* storage blocked */ }
          made.current.conv = id ? (await loadConv(id)) ?? null : null;
        } },
      { label: 'Checking the connection', run: async () => { connection(loadSettings()); await frame(); } },
    ];
  }
  const load = useLoadSequence(plan.current, first ? 1500 : 0);
  useEffect(() => { if (load.ready) { try { localStorage.setItem(SEEN, '1'); } catch { /* storage blocked */ } } }, [load.ready]);
  if (!load.ready && !first && !load.error) return <div className="ld-quiet" aria-busy="true" />;
  if (!load.ready) return <CoeLoader title="Coe" steps={plan.current.map((s) => s.label)} index={load.index} error={load.error} />;
  const { Chat, list, conv } = made.current;
  return Chat ? <Chat initialList={list ?? []} initialConv={conv ?? null} /> : null;
}
