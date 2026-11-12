'use client';
import { useEffect, useRef, useState } from 'react';
import { Halftone } from '@/ui/Halftone';
import { CoeWordmark } from '@/ui/Mark';
import { PmcMark } from '@/ui/PmcMark';
import { UiIcon } from '@/ui/icons';
import { accountsLive, cloudOn, sendCode, startAccountSignIn, takeAuthError, verifyCode } from '@/lib/coe/cloud';
import { useBackClose } from './back';

/* Same shape as the PMC Apps sign-in: logo on top, one boxed card (big green title | form), ink strip along the bottom.
   The main way in is a PMC Account (email and password, on accounts.pmcstudios.uk). An emailed code stays here as a small way in for when that page cannot be used. */
const KEY = 'pmc:coe:accounts';
const read = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 4) : []; } catch { return []; } };
const write = (a: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 4))); } catch { /* blocked */ } };

export function SignIn({ onClose, onChange }: { onClose: () => void; onChange: (signedIn: boolean) => void }) {
  const [saved, setSaved] = useState<string[]>([]);
  const [other, setOther] = useState(false);
  const [mode, setMode] = useState<'pmc' | 'code'>('pmc');
  const [pmcOk, setPmcOk] = useState(true);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(() => takeAuthError());
  const [wait, setWait] = useState(0);
  const first = useRef<HTMLInputElement>(null), codeBox = useRef<HTMLInputElement>(null);
  useBackClose(onClose);
  useEffect(() => { setSaved(read()); }, []);
  // If the PMC Account page is not reachable (not switched on yet, or no connection to it), this opens on the emailed code by itself, so nobody is stuck.
  useEffect(() => { if (!cloudOn) return; let on = true; void accountsLive().then((ok) => { if (on && !ok) { setPmcOk(false); setMode('code'); } }); return () => { on = false; }; }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { document.body.classList.add('si-open'); return () => document.body.classList.remove('si-open'); }, []);
  useEffect(() => { if (step === 'code') codeBox.current?.focus(); }, [step]);
  // Coming back to this page with the Back button brings it back as it was; the button must not stay stuck.
  useEffect(() => { const f = (e: PageTransitionEvent) => { if (e.persisted) setBusy(false); }; window.addEventListener('pageshow', f); return () => window.removeEventListener('pageshow', f); }, []);

  const showForm = other || saved.length === 0;
  const go = async (f: () => Promise<void>) => { setBusy(true); setErr(''); try { await f(); } catch (e) { setErr((e as Error).message || 'That did not work. Try again.'); } finally { setBusy(false); } };
  const toPmc = (where: '' | 'create' = '') => go(async () => { startAccountSignIn(where); await new Promise((r) => setTimeout(r, 4000)); });
  const send = (to: string) => go(async () => { await sendCode(to.trim()); setEmail(to.trim()); setCode(''); setStep('code'); setWait(30); });
  const forget = (a: string) => { const n = saved.filter((x) => x !== a); write(n); setSaved(n); };

  return (
    <div className="si" role="dialog" aria-modal="true" aria-labelledby="si-title">
      <Halftone className="si-dots" />
      <button type="button" className="si-x cx-ib" aria-label="Close" title="Close" onClick={onClose}><UiIcon name="close" size={22} /></button>
      <header className="si-top"><CoeWordmark height={44} /><i className="beta">Beta</i></header>
      <main className="si-main">
        <section className="si-box">
          <div className="si-side"><Halftone className="si-side-dots" /><h1 id="si-title" className="d">{mode === 'code' && step === 'code' ? 'Check your email' : 'Sign in'}</h1></div>
          <div className="si-body">
            {!cloudOn ? (
              <div className="si-stack">
                <p className="tx">Sign in is not switched on yet. Your chats are saved on this device.</p>
                <button type="button" className="btn gold" onClick={onClose}>OK</button>
              </div>
            ) : mode === 'pmc' ? (
              <div className="si-stack">
                <p className="tx">Use your PMC Account: one email and password for Coe and Coe Mini.</p>
                {err && <p className="si-err tx" role="alert">{err}</p>}
                <button type="button" className="btn gold si-pmc" disabled={busy} onClick={() => void toPmc()}>{busy ? 'Opening' : 'Sign in with PMC'}</button>
                <div className="si-row">
                  <button type="button" className="si-link tx" disabled={busy} onClick={() => void toPmc('create')}>Create an account</button>
                  <button type="button" className="si-link tx" onClick={() => { setMode('code'); setErr(''); }}>Email me a code instead</button>
                </div>
              </div>
            ) : step === 'email' ? (
              <div className="si-stack">
                {saved.length > 0 && (
                  <ul className="si-saved" aria-label="Accounts on this device">
                    {saved.map((a) => (
                      <li key={a}>
                        <button type="button" className="si-acct" disabled={busy} onClick={() => send(a)}>
                          <span className="si-av d" aria-hidden>{a.charAt(0).toUpperCase()}</span>
                          <span className="si-who"><b className="d">{a.split('@')[0]}</b><small className="tx">{a}</small></span>
                        </button>
                        <button type="button" className="si-forget" aria-label={`Remove ${a} from this device`} title="Remove from this device" onClick={() => forget(a)}><UiIcon name="close" size={16} /></button>
                      </li>
                    ))}
                    {!other && <li><button type="button" className="btn" onClick={() => { setOther(true); setTimeout(() => first.current?.focus(), 30); }}>Another account</button></li>}
                  </ul>
                )}
                {showForm && (
                  <form className="si-form" onSubmit={(e) => { e.preventDefault(); void send(email); }}>
                    <div className="si-f"><label className="d" htmlFor="si-email">Email</label>
                      <input ref={first} id="si-email" className="cx-in" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required autoFocus={saved.length === 0} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    {err && <p className="si-err tx" role="alert">{err}</p>}
                    <button type="submit" className="btn gold" disabled={busy || !email.trim()}>{busy ? 'Sending' : 'Email me a code'}</button>
                    {pmcOk && <p className="tx si-hint">This signs you in with a code only. It does not use your PMC Account password.</p>}
                  </form>
                )}
                {pmcOk && <button type="button" className="si-link tx" onClick={() => { setMode('pmc'); setErr(''); }}>Sign in with PMC instead</button>}
                {!showForm && err && <p className="si-err tx" role="alert">{err}</p>}
              </div>
            ) : (
              <form className="si-stack" onSubmit={(e) => { e.preventDefault(); void go(async () => { await verifyCode(email, code.trim()); write([email, ...read().filter((x) => x !== email)]); onChange(true); onClose(); }); }}>
                <p className="tx">We sent a code to <b>{email}</b>. Type it here.</p>
                <div className="si-f"><label className="d" htmlFor="si-code">Code</label>
                  <input ref={codeBox} id="si-code" className="cx-in si-code" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={8} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
                {err && <p className="si-err tx" role="alert">{err}</p>}
                <button type="submit" className="btn gold" disabled={busy || code.trim().length < 6}>{busy ? 'Checking' : 'Sign in'}</button>
                <div className="si-row">
                  <button type="button" className="si-link tx" onClick={() => { setStep('email'); setCode(''); setErr(''); }}>Wrong email?</button>
                  <button type="button" className="si-link tx" disabled={busy || wait > 0} onClick={() => void send(email)}>{wait > 0 ? `Send again in ${wait}s` : 'Send again'}</button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>
      <footer className="si-foot"><span className="si-copy"><PmcMark height={22} /><span className="tx">© {new Date().getFullYear()} PMC Studios</span></span><nav className="d" aria-label="More"><a href="https://pmcstudios.uk">PMC Studios</a><a href="/plans/">Plans</a><a href="/privacy/">Privacy</a><a href="/about/">About</a></nav></footer>
    </div>
  );
}
