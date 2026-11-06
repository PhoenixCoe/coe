'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CoeWordmark } from '@/ui/Mark';
import { UiIcon } from '@/ui/icons';
import { PLANS, fmtTok } from '@/lib/coe/models';
import { loadSettings } from '@/lib/coe/settings';
import { openPortal, startCheckout } from '@/lib/coe/billing';
import { limitNow, onStatus, refreshStatus, status, type Status } from '@/lib/coe/account';
import { cloudOn, session } from '@/lib/coe/cloud';
import { Account } from './Account';
import { usage } from './store';

type PIcon = Parameters<typeof UiIcon>[0]['name'];
const POINT_ICONS: [RegExp, PIcon][] = [
  [/tokens a day/i, 'chart'], [/Deep Work/i, 'list'], [/taste of the big stuff/i, 'sparkle'], [/Coe Deep|Coe Swift|Coe Core/i, 'bolt'], [/study|Code check/i, 'graduate'],
  [/Charts|diagrams|previews/i, 'deck'], [/pictures in each|Make pictures/i, 'image'], [/longer replies/i, 'text'], [/Search the web/i, 'search'], [/PMC App/i, 'apps'],
  [/Google/i, 'cloud'], [/GitHub/i, 'branch'], [/Big files/i, 'file'], [/own AI key/i, 'lock'], [/Everything in Free/i, 'check'],
];
const iconFor = (t: string): PIcon => POINT_ICONS.find(([r]) => r.test(t))?.[1] ?? 'check';

/** Two plain boxes side by side on black. Your plan comes from your account. Without one, you are on Free. */
export default function Plans() {
  const [yearly, setYearly] = useState(false);
  const [st, setSt] = useState<Status>(status());
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [acct, setAcct] = useState(false);
  const [local, setLocal] = useState(0);

  const load = useCallback(async () => { const s = await refreshStatus(loadSettings()); setSt(s); setReady(true); return s; }, []);
  useEffect(() => onStatus(() => setSt(status())), []);
  useEffect(() => {
    setLocal(usage().today);
    void load().then(async (s) => {
      if (new URLSearchParams(location.search).get('paid') === null) return;
      setMsg({ bad: false, text: s.plan === 'pro' ? 'Pro is on. Thank you.' : 'Thanks. Your plan turns on in a moment.' });
      for (let i = 0; i < 12 && !(status().plan === 'pro'); i++) { await new Promise((r) => setTimeout(r, 2500)); await load(); }
      if (status().plan === 'pro') setMsg({ bad: false, text: 'Pro is on. Thank you.' });
    });
  }, [load]);

  const signedIn = st.signedIn && !!session();
  const pro = st.plan === 'pro' && st.signedIn;
  const go = async (f: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { window.location.href = await f(); }
    catch (e) { setMsg({ bad: true, text: (e as Error).message || 'Something went wrong. Try again.' }); setBusy(false); }
  };
  const choosePro = () => {
    if (!signedIn) { if (cloudOn) setAcct(true); else setMsg({ bad: true, text: 'Accounts are not switched on for this site yet.' }); return; }
    void go(() => startCheckout(loadSettings(), yearly ? 'year' : 'month'));
  };
  const soon = ready && !st.canBuy && !pro;
  const proLabel = busy ? 'One moment…' : st.given ? 'Your plan' : pro ? 'Manage plan' : soon ? 'Not on sale yet' : signedIn ? 'Get Pro' : 'Sign in to get Pro';
  const canBuy = (!ready || st.canBuy || pro) && !st.given;

  return (
    <main className="pl">
      <header className="pl-top">
        <Link className="pl-brand" href="/" aria-label="Back to Coe"><CoeWordmark height={30} /></Link>
        <Link className="btn small pl-back" href="/"><UiIcon name="left" size={15} />Back to Coe</Link>
      </header>

      <section className="pl-head">
        <h1 className="d">Plans</h1>
        <p className="tx">{signedIn ? <>Signed in as <b>{st.email}</b>.</> : 'Not signed in, so you are on Free.'}</p>
        <div className="seg pl-seg" role="radiogroup" aria-label="Billing">
          {([['month', 'Monthly'], ['year', 'Yearly']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={(k === 'year') === yearly} onClick={() => setYearly(k === 'year')}>{label}{k === 'year' && <i>Save $10</i>}</button>
          ))}
        </div>
      </section>

      {msg && <p className={`pl-msg${msg.bad ? ' bad' : ''}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}

      <section className="pl-boxes" aria-label="Plans">
        {PLANS.map((p) => {
          const price = yearly ? p.yearly : p.monthly;
          const on = p.key === 'free' ? !pro : pro;
          return (
            <article key={p.key} className={`pl-box${p.key === 'pro' ? ' pro' : ''}`} aria-label={`${p.name} plan`}>
              <h2 className="d"><span className="pl-sym" aria-hidden><UiIcon name={p.key === 'pro' ? 'medal' : 'sparkle'} size={26} /></span>{p.name}</h2>
              <p className="pl-price"><b className="d">${price}</b><span className="tx">{p.key === 'free' ? 'always' : yearly ? 'a year' : 'a month'}</span></p>
              {p.key === 'free'
                ? <button type="button" className="btn" disabled>{on ? 'Your plan' : 'Included'}</button>
                : <button type="button" className={`btn${pro ? '' : ' gold'}`} disabled={busy || !canBuy} onClick={() => (pro ? void go(() => openPortal(loadSettings())) : choosePro())}>{proLabel}</button>}
              <ul>{p.points.map((x) => <li key={x} className="tx"><span className="pl-tick" aria-hidden><UiIcon name={iconFor(x)} size={15} strokeWidth={2.6} /></span>{x}</li>)}</ul>
            </article>
          );
        })}
      </section>

      <footer className="pl-foot tx">
        {st.given && <p className="pl-note">Pro is on for this account.</p>}
        {soon && <p className="pl-note">Pro is not on sale yet. Check back soon.</p>}
        {signedIn && st.billing
          ? <p>Today: <b>{fmtTok(st.used)}</b> of {fmtTok(st.limit)} tokens used. Tokens reset at midnight UTC.{pro && st.renews ? ` Pro renews ${new Date(st.renews).toLocaleDateString()}.` : ''}</p>
          : <p>Today: <b>{fmtTok(local)}</b> of {fmtTok(limitNow(loadSettings()))} tokens used on this device. {signedIn ? '' : 'Sign in to keep your plan and tokens with your account.'}</p>}
        {!signedIn && cloudOn && <p><button type="button" className="btn small" onClick={() => setAcct(true)}>Sign in</button></p>}
      </footer>
      {acct && <Account onClose={() => setAcct(false)} onChange={() => { void load(); }} />}
    </main>
  );
}
