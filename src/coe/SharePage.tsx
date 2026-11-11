'use client';
/** The page a shared link opens: the chat, read-only, in Coe's look. Shows where it was made (Coe or Coe Mini), the version, and has a Report button. */
import { useEffect, useMemo, useState } from 'react';
import { CoeStar } from '@/ui/Mark';
import { UiIcon } from '@/ui/icons';
import { SiteFooter } from '@/ui/SiteFooter';
import { Rich, RichContext, type RichCtx } from './Blocks';
import { loadMarkdown } from './markdown';
import { readShare, cloudOn, type Shared } from '@/lib/coe/cloud';
import { loadSettings } from '@/lib/coe/settings';
import { reportShare, type ReportWhy } from '@/lib/coe/feedback';
import type { Msg } from './store';
import { useMiniHere } from '@/lib/coe/device';

type State = { s: 'loading' } | { s: 'none' } | { s: 'error'; why: string } | { s: 'ok'; chat: Shared };
const WHY: [ReportWhy, string][] = [['unsafe', 'Unsafe or harmful'], ['private', 'Shows private details'], ['wrong', 'Wrong or misleading'], ['other', 'Something else']];

/** The Report button and its small form. */
function Report() {
  const [open, setOpen] = useState(false), [why, setWhy] = useState<ReportWhy>('unsafe'), [note, setNote] = useState('');
  const [st, setSt] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'limit'>('idle');
  const send = async () => {
    setSt('sending');
    const link = window.location.href;
    const r = await reportShare(loadSettings(), link, why, note);
    if (r.emailed) setSt('sent');
    else if (r.limited) setSt('limit');
    else setSt('failed');
  };
  if (st === 'sent') return <p className="pn-info tx sp-done" role="status"><span className="pn-i" aria-hidden><UiIcon name="check" size={15} strokeWidth={3.2} /></span><span>Thank you. The report was sent and we will take a look.</span></p>;
  if (st === 'limit') return <p className="pn-info tx sp-done" role="status"><span className="pn-i" aria-hidden><UiIcon name="info" size={15} strokeWidth={3.2} /></span><span>You have sent enough reports for today. Thank you.</span></p>;
  if (!open) return <button type="button" className="btn small sp-rep" aria-expanded={false} onClick={() => setOpen(true)}><UiIcon name="alert" size={16} />Report this chat</button>;
  return (
    <form className="sp-form" aria-label="Report this chat" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <b className="d sp-fh">Report this chat</b>
      <div className="sp-why" role="radiogroup" aria-label="Why">
        {WHY.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={why === v} className={`sp-w${why === v ? ' on' : ''}`} onClick={() => setWhy(v)}><span className="sp-wk" aria-hidden>{why === v && <UiIcon name="check" size={13} strokeWidth={3.4} />}</span><span className="d">{l}</span></button>)}
      </div>
      <label className="sp-nl"><span className="d">Anything we should know? (optional)</span><textarea className="cx-in" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A few words are plenty" /></label>
      <div className="sp-fa"><button type="submit" className="btn gold" disabled={st === 'sending'}>{st === 'sending' ? 'Sending…' : 'Send report'}</button><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>{st === 'failed' && <span className="tx sp-fail" role="status">It did not send. Press Send report to try again.</span>}</div>
    </form>
  );
}

export default function SharePage() {
  const miniHere = useMiniHere();
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
  const chat = st.s === 'ok' ? st.chat : null;
  const when = chat?.ts ? new Date(chat.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <main className="pn sp" onClick={onClick}>
      <i className="ht" aria-hidden><i /><i /><i /></i>
      <header className="pn-isl">
        <a className="isl-b isl-t d" href="/" title="Open Coe"><CoeStar size={20} live={false} />Open Coe</a>
        <h2 className="isl-title d">Shared chat</h2>
      </header>
      <div className="pn-in sp-in">
        {st.s === 'loading' && <p className="tx sp-note" role="status">Opening the chat…</p>}
        {st.s === 'none' && <div className="sp-card sp-note"><h1 className="d">This link does not work</h1><p className="tx">The person who shared it may have taken it down, or the link is cut short.</p><a className="btn gold has-logo" href="/"><CoeStar size={20} live={false} />Open Coe</a></div>}
        {st.s === 'error' && <div className="sp-card sp-note"><h1 className="d">That could not be opened</h1><p className="tx">{st.why}</p><button type="button" className="btn" onClick={() => window.location.reload()}>Try again</button></div>}
        {chat && (
          <>
            <section className="sp-card sp-hero" aria-label="About this chat">
              <h1 className="sp-title d">{chat.title}</h1>
              <ul className="sp-meta">
                <li className="sp-chip d"><UiIcon name={chat.from === 'mini' ? 'panel' : 'chat'} size={16} />{chat.from === 'mini' ? 'Made in Coe Mini' : chat.from === 'coe' ? 'Made in Coe' : 'Made with Coe'}</li>
                {chat.v && <li className="sp-chip d"><UiIcon name="tip" size={16} />Version {chat.v}</li>}
                <li className="sp-chip d"><UiIcon name="list" size={16} />{chat.messages.length} {chat.messages.length === 1 ? 'message' : 'messages'}</li>
                {when && <li className="sp-chip d"><UiIcon name="calendar" size={16} />Shared {when}</li>}
              </ul>
              <p className="pn-info tx"><span className="pn-i" aria-hidden><UiIcon name="tip" size={15} strokeWidth={3.2} /></span><span>A read-only copy. Pages and code in it only run if you choose to show them.</span></p>
            </section>
            <RichContext.Provider value={ctx}>
              <ol className="cx-msgs sp-msgs sp-card">
                {chat.messages.map((m, i) => {
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
            <section className="sp-foot" aria-label="What next">
              <div className="sp-try sp-card"><b className="d">Want to try it?</b><p className="tx">Coe is free. Ask it anything{miniHere ? ', or get Coe Mini for your browser' : ''}.</p><a className="btn gold has-logo" href="/"><CoeStar size={20} live={false} />Open Coe</a></div>
              <div className="sp-repw"><Report /></div>
            </section>
          </>
        )}
        <SiteFooter />
      </div>
    </main>
  );
}
