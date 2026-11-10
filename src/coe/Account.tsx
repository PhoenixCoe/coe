'use client';
import { useEffect, useState } from 'react';
import { session, signOut } from '@/lib/coe/cloud';
import { deleteAccount } from '@/lib/coe/billing';
import { forgetStatus, onStatus, status } from '@/lib/coe/account';
import { loadSettings } from '@/lib/coe/settings';


/** Settings > Account: your plan, sign in or out. How much is left today is in Settings > Usage. */
export function AccountTab({ onSignIn, onChange }: { onSignIn: () => void; onChange: (signedIn: boolean) => void }) {
  const me = session(), st = status();
  const [, bump] = useState(0); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [sure, setSure] = useState(false);
  useEffect(() => onStatus(() => bump((n) => n + 1)), []);
  const go = async (f: () => Promise<void>) => { setBusy(true); setErr(''); try { await f(); } catch (e) { setErr((e as Error).message || 'Something went wrong.'); } finally { setBusy(false); } };
  return (
    <div className="acc">
      <section className="acc-card"><h3 className="d">Your account</h3>
        {me ? (
          <>
            <div className="acc-who"><span className="cx-av d" aria-hidden>{me.email.slice(0, 1).toUpperCase()}</span><div><b className="d">{me.email}</b><span className={`cx-badge ${st.plan}`}>{st.plan === 'pro' ? 'Pro' : 'Free'}{st.given ? ' (given)' : ''}</span></div></div>
            {st.renews && st.plan === 'pro' && <p className="tx cx-small">Pro renews {new Date(st.renews).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</p>}
            {err && <div className="cx-err" role="alert"><p>{err}</p></div>}
            <div className="cx-actions"><a className="btn" href="/plans/">Plans</a>
              <button type="button" className="btn" disabled={busy} onClick={() => go(async () => { if (await signOut()) { forgetStatus(); onChange(false); } else setErr('Could not save your chats first. Check your connection and try again.'); })}>{busy ? 'Working' : 'Sign out'}</button></div>
            <details className="acc-danger"><summary className="d">Delete my account</summary>
              <p className="tx cx-small">Deletes your account, saved chats, notes and usage from Coe&apos;s server. It cannot be undone. If you pay for Pro, cancel it first on the Plans page.</p>
              {!sure ? <div className="cx-actions"><button type="button" className="btn" onClick={() => setSure(true)}>Delete my account</button></div>
                : <div className="cx-actions"><b className="d">Really delete it?</b>
                  <button type="button" className="btn danger" disabled={busy} onClick={() => go(async () => { await deleteAccount(loadSettings()); await signOut().catch(() => false); forgetStatus(); setSure(false); onChange(false); })}>Yes, delete</button>
                  <button type="button" className="btn" onClick={() => setSure(false)}>No</button></div>}
            </details>
          </>
        ) : (
          <>
            <p className="tx">Your chats are saved on this device only. Sign in to keep them in your account, on every device, with a bigger daily amount.</p>
            <div className="cx-actions"><button type="button" className="btn gold" onClick={onSignIn}>Sign in</button></div>
          </>
        )}
      </section>
    </div>
  );
}
