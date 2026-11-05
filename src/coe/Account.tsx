'use client';
import { useState } from 'react';
import { Modal } from './Panels';
import { cloudOn, sendCode, session, signOut, verifyCode } from '@/lib/coe/cloud';

/** Sign in with an email: Coe sends a code (and a link). The chats then follow the person to any device. */
export function Account({ onClose, onChange }: { onClose: () => void; onChange: (signedIn: boolean) => void }) {
  const [me, setMe] = useState(() => session());
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
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
    return (
      <Modal title="Account" onClose={onClose}>
        <p className="tx">Signed in as <b>{me.email}</b>. Your chats are saved to your account and follow you to other devices. Pictures stay on the device you added them on.</p>
        {err && <div className="cx-err" role="alert"><p>{err}</p></div>}
        <div className="cx-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => go(async () => {
            if (await signOut()) { setMe(null); onChange(false); } else setErr('Could not save your chats first. Check your connection and try again.');
          })}>{busy ? 'Signing out…' : 'Sign out'}</button>
        </div>
        <p className="tx cx-small">Signing out takes your chats off this device. They stay in your account.</p>
      </Modal>
    );
  }
  return (
    <Modal title="Sign in" onClose={onClose}>
      <p className="tx">Sign in to keep your chats in your account. Without it they stay on this device only.</p>
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
