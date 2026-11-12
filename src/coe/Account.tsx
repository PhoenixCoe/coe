'use client';
import { useEffect, useRef, useState } from 'react';
import { pushProfile, session, signOut } from '@/lib/coe/cloud';
import { avatarImg, fileToAvatar, onAvatar, saveAvatar } from '@/lib/coe/avatar';
import { deleteAccount } from '@/lib/coe/billing';
import { forgetStatus, onStatus, status } from '@/lib/coe/account';
import { loadSettings } from '@/lib/coe/settings';


/** The profile picture: upload, change or take away. It follows the account, so Coe Mini shows it too. */
function ProfilePic({ letter, signedIn }: { letter: string; signedIn: boolean }) {
  const [img, setImg] = useState(avatarImg()); const [err, setErr] = useState(''); const file = useRef<HTMLInputElement>(null);
  useEffect(() => onAvatar(() => setImg(avatarImg())), []);
  const take = async (f?: File) => {
    setErr('');
    try { saveAvatar(f ? await fileToAvatar(f) : ''); if (signedIn) await pushProfile().catch(() => undefined); } catch (e) { setErr((e as Error).message || 'That picture could not be used.'); }
  };
  return (
    <div className="acc-pic">
      <span className="cx-av big d" aria-hidden>{img ? <img src={img} alt="" /> : letter}</span>
      <div className="acc-pic-t"><b className="d">Profile picture</b>
        <p className="tx cx-small">{signedIn ? 'Shown in Coe and Coe Mini.' : 'Kept on this device. Sign in to use it in Coe Mini too.'}</p>
        {err && <p className="tx cx-small acc-pic-e" role="alert">{err}</p>}
        <div className="cx-actions">
          <button type="button" className="btn small" onClick={() => file.current?.click()}>{img ? 'Change' : 'Upload'}</button>
          {img && <button type="button" className="btn small" onClick={() => void take()}>Remove</button>}
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void take(f); }} /></div>
      </div>
    </div>
  );
}

/** Settings > Profile: your picture, your plan, and deleting the account. Who you are, signing in and signing out are in the account menu (the picture button).
 *  How much is left today is in Settings > Usage. */
export function AccountTab({ onChange, onSetup }: { onChange: (signedIn: boolean) => void; onSetup: () => void }) {
  const me = session(), st = status();
  const [, bump] = useState(0); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [sure, setSure] = useState(false);
  useEffect(() => onStatus(() => bump((n) => n + 1)), []);
  const go = async (f: () => Promise<void>) => { setBusy(true); setErr(''); try { await f(); } catch (e) { setErr((e as Error).message || 'Something went wrong.'); } finally { setBusy(false); } };
  return (
    <div className="acc">
      <section className="acc-card"><h3 className="d">Setup</h3>
        <p className="tx cx-small">The first-time questions, with Coe asking. Do them now if you skipped them, or go through them again to change your answers.</p>
        <div className="cx-actions"><button type="button" className="btn gold" onClick={onSetup}>Enter setup</button></div>
      </section>
      <section className="acc-card">
        <ProfilePic letter={me ? me.email.slice(0, 1).toUpperCase() : '?'} signedIn={!!me} />
        {me && (
          <>
            <div className="acc-plan"><b className="d">Plan</b><span className={`cx-badge ${st.plan}`}>{st.plan === 'pro' ? 'Pro' : 'Free'}{st.given ? ' (given)' : ''}</span><a className="btn small" href="/plans/">Plans</a></div>
            {st.renews && st.plan === 'pro' && <p className="tx cx-small">Pro renews {new Date(st.renews).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</p>}
            {err && <div className="cx-err" role="alert"><p>{err}</p></div>}
            <details className="acc-danger"><summary className="d">Delete my account</summary>
              <p className="tx cx-small">Deletes your account, saved chats, notes and usage from Coe&apos;s server. It cannot be undone. If you pay for Pro, cancel it first on the Plans page.</p>
              {!sure ? <div className="cx-actions"><button type="button" className="btn" onClick={() => setSure(true)}>Delete my account</button></div>
                : <div className="cx-actions"><b className="d">Really delete it?</b>
                  <button type="button" className="btn danger" disabled={busy} onClick={() => go(async () => { await deleteAccount(loadSettings()); await signOut().catch(() => false); forgetStatus(); setSure(false); onChange(false); })}>Yes, delete</button>
                  <button type="button" className="btn" onClick={() => setSure(false)}>No</button></div>}
            </details>
          </>
        )}
      </section>
    </div>
  );
}
