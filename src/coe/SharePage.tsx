'use client';
/** The page a shared link opens: the chat, read-only. */
import { useEffect, useMemo, useState } from 'react';
import { CoeStar } from '@/ui/Mark';
import { Rich, RichContext, type RichCtx } from './Blocks';
import { loadMarkdown } from './markdown';
import { readShare, cloudOn, type Shared } from '@/lib/coe/cloud';
import type { Msg } from './store';

type State = { s: 'loading' } | { s: 'none' } | { s: 'error'; why: string } | { s: 'ok'; chat: Shared };

export default function SharePage() {
  const [st, setSt] = useState<State>({ s: 'loading' });
  useEffect(() => {
    let dead = false;
    const run = async () => {
      const id = window.location.hash.replace(/^#/, '');
      if (!id || !cloudOn) { setSt({ s: 'none' }); return; }
      try { await loadMarkdown(); const chat = await readShare(id); if (!dead) setSt(chat ? { s: 'ok', chat } : { s: 'none' }); }
      catch (e) { if (!dead) setSt({ s: 'error', why: (e as Error).message || 'It could not be loaded.' }); }
    };
    void run();
    const h = () => { setSt({ s: 'loading' }); void run(); };
    window.addEventListener('hashchange', h);
    return () => { dead = true; window.removeEventListener('hashchange', h); };
  }, []);
  const ctx = useMemo<RichCtx>(() => ({ shared: true, plan: 'free', files: {}, convId: 'share', approve: () => {}, skip: () => {} }), []);

  // Copy buttons on code blocks.
  const onClick = (e: React.MouseEvent) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-copy]'); if (!b) return;
    const code = b.closest('.cx-code')?.querySelector('code')?.textContent ?? '';
    navigator.clipboard?.writeText(code).then(() => { b.textContent = 'Copied'; window.setTimeout(() => { b.textContent = 'Copy'; }, 1300); }, () => {});
  };

  return (
    <main className="sp" onClick={onClick}>
      <header className="sp-top">
        <a className="sp-brand d" href="/"><CoeStar size={28} />Coe</a>
        <span className="sp-tag d">Shared chat</span>
        <span className="cx-grow" />
        <a className="btn gold" href="/">Open Coe</a>
      </header>
      <div className="sp-body">
        {st.s === 'loading' && <p className="tx sp-note" role="status">Opening the chat…</p>}
        {st.s === 'none' && <div className="sp-note"><h1 className="d">This link does not work</h1><p className="tx">The chat may have been taken down by the person who shared it, or the link was copied incompletely.</p><a className="btn" href="/">Go to Coe</a></div>}
        {st.s === 'error' && <div className="sp-note"><h1 className="d">That could not be opened</h1><p className="tx">{st.why}</p><button type="button" className="btn" onClick={() => window.location.reload()}>Try again</button></div>}
        {st.s === 'ok' && (
          <>
            <h1 className="sp-title d">{st.chat.title}</h1>
            <p className="tx sp-sub">A read-only copy.{st.chat.ts ? ` Shared on ${new Date(st.chat.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''}</p>
            <p className="tx sp-warn">Everything here was written by the person who shared it and by Coe. Pages and code in it only run if you choose to show them.</p>
            <RichContext.Provider value={ctx}>
              <ol className="cx-msgs sp-msgs">
                {st.chat.messages.map((m, i) => {
                  const msg: Msg = { id: 's' + i, role: m.role, text: m.text, ts: 0 };
                  return (
                    <li key={i} className={`cx-msg ${m.role}`}>
                      <div className="cx-who d">{m.role === 'user' ? 'They asked' : <><CoeStar size={20} live={false} />Coe</>}</div>
                      {m.role === 'user' ? <p className="cx-says tx">{m.text}</p> : <Rich text={m.text} msg={msg} />}
                    </li>
                  );
                })}
              </ol>
            </RichContext.Provider>
            <p className="tx sp-end">Want to try it? <a href="/">Open Coe</a> is free to start.</p>
          </>
        )}
      </div>
    </main>
  );
}
