'use client';
import { useEffect, useState } from 'react';
import { Modal } from './Panels';
import { cloudOn, sendCode, session, signOut, takeAuthError, verifyCode } from '@/lib/coe/cloud';
import { deleteAccount } from '@/lib/coe/billing';
import { forgetStatus, onStatus, status } from '@/lib/coe/account';
import { QUOTAS, fmtTok } from '@/lib/coe/models';
import { loadSettings } from '@/lib/coe/settings';


/** Sign in with a provider or an emailed code. Signed in: plan, today's usage, what is connected, sign out, delete. */
export function Account({ onClose, onChange }: { onClose: () => void; onChange: (signedIn: boolean) => void }) {
  const [me, setMe] = useState(() => session());
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(() => takeAuthError());
  const [sure, setSure] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => onStatus(() => bump((n) => n + 1)), []);
  const go = async (f: () => Promise<void>) => { setBusy(true); setErr(''); try { await f(); } catch (e) { setErr((e as Error).message || 'Something went wrong.'); } finally { setBusy(false); } };

  if (!cloudOn) {
    return (
      <Modal title="Sign in" onClose={onClose}>
        <p className="tx">Sign in is not switched on yet. Your chats are saved on this device.</p>
        <div className="cx-actions"><button type="button" className="btn" onClick={onClose}>OK</button></div>
      </Modal>
    );
  }
  if (me) {
    const st = status();
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10); return { d, n: st.week?.find((w) => w.day === d)?.used ?? 0 }; });
    const top = Math.max(1, st.limit, ...days.map((x) => x.n));
    const rows = (['work', 'search', 'image', 'voice', 'app'] as const).map((k) => ({ k, label: QUOTAS[k].name, q: st.quotas?.[k] })).filter((r) => r.q);
    return (
      <Modal title="Account" onClose={onClose} wide>
        <div className="cx-acct-top">
          <div><p className="tx">Signed in as <b>{me.email}</b></p>
            <p className="tx cx-small">Your chats and notes are saved to your account and follow you to other devices. Pictures stay on the device you added them on.</p></div>
          <span className={`cx-badge ${st.plan}`}>{st.plan === 'pro' ? 'Pro' : 'Free'}{st.given ? ' (given)' : ''}</span>
        </div>

        {st.billing && <>
          <h3 className="d cx-h3">Today</h3>
          <div className="cx-meter" role="img" aria-label={`${fmtTok(st.used)} of ${fmtTok(st.limit)} tokens used`}><i style={{ width: `${Math.min(100, (st.used / Math.max(1, st.limit)) * 100)}%` }} /></div>
          <p className="tx cx-small">{fmtTok(st.used)} of {fmtTok(st.limit)} tokens used. They come back at midnight (UTC).{st.renews && st.plan === 'pro' ? ` Pro renews ${new Date(st.renews).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.` : ''}</p>
          {rows.length > 0 && <ul className="cx-quotas">{rows.map((r) => <li key={r.k} className="tx"><span>{r.label}</span><b>{r.q!.used} / {r.q!.limit > 99999 ? 'no limit' : r.q!.limit}</b></li>)}</ul>}
          <h3 className="d cx-h3">Last 7 days</h3>
          <div className="cx-week" role="img" aria-label="Tokens used each day this week">
            {days.map((x) => <div key={x.d}><i style={{ height: `${Math.max(3, (x.n / top) * 100)}%` }} title={`${fmtTok(x.n)} tokens`} /><span className="tx">{new Date(x.d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2)}</span></div>)}
          </div>
        </>}

        {err && <div className="cx-err" role="alert"><p>{err}</p></div>}
        <div className="cx-actions">
          <button type="button" className="btn" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('pmc:coe-open', { detail: 'you' })); }}>Memory and connections</button>
          <a className="btn" href="/plans/">Plans</a>
          <button type="button" className="btn" disabled={busy} onClick={() => go(async () => {
            if (await signOut()) { forgetStatus(); setMe(null); onChange(false); } else setErr('Could not save your chats first. Check your connection and try again.');
          })}>{busy ? 'Working…' : 'Sign out'}</button>
        </div>
        <p className="tx cx-small">Signing out takes your chats off this device. They stay in your account.</p>

        <h3 className="d cx-h3">Delete account</h3>
        <p className="tx cx-small">Deletes your account, saved chats, notes and usage from Coe&apos;s server. It cannot be undone. If you pay for Pro, cancel it first on the Plans page.</p>
        {!sure
          ? <div className="cx-actions"><button type="button" className="btn" onClick={() => setSure(true)}>Delete my account</button></div>
          : <div className="cx-actions cx-sure"><b className="d">Really delete it?</b>
            <button type="button" className="btn danger" disabled={busy} onClick={() => go(async () => { await deleteAccount(loadSettings()); await signOut().catch(() => false); forgetStatus(); setMe(null); setSure(false); onChange(false); onClose(); })}>{busy ? 'Deleting…' : 'Yes, delete everything'}</button>
            <button type="button" className="btn" onClick={() => setSure(false)}>No</button></div>}
      </Modal>
    );
  }
  return (
    <Modal title="Sign in" onClose={onClose}>
      <p className="tx">Sign in to keep your chats and notes in your account, on every device. Without it they stay on this device only.</p>
      {step === 'email' ? (
        <form className="cx-form" onSubmit={(e) => { e.preventDefault(); void go(async () => { await sendCode(email.trim()); setStep('code'); }); }}>
          <div className="cx-fr"><label className="d" htmlFor="acc-email">Email</label>
          <input id="acc-email" className="cx-in" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {err && <div className="cx-err" role="alert"><p>{err}</p></div>}
          <div className="cx-actions"><button type="submit" className="btn gold" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send me a code'}</button></div>
        </form>
      ) : (
        <form className="cx-form" onSubmit={(e) => { e.preventDefault(); void go(async () => { await verifyCode(email.trim(), code); setMe(session()); onChange(true); }); }}>
          <p className="tx">A code was sent to <b>{email}</b>. Type it here, or press the link in the email.</p>
          <div className="cx-fr"><label className="d" htmlFor="acc-code">Code</label>
          <input id="acc-code" className="cx-in" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} /></div>
          {err && <div className="cx-err" role="alert"><p>{err}</p></div>}
          <div className="cx-actions">
            <button type="submit" className="btn gold" disabled={busy || code.trim().length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
            <button type="button" className="btn" onClick={() => { setStep('email'); setCode(''); setErr(''); }}>Back</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
