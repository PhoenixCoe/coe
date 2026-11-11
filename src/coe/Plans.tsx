'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { UiIcon } from '@/ui/icons';
import { Seg } from '@/ui/Seg';
import { PLANS, fmtTok } from '@/lib/coe/models';
import { loadSettings } from '@/lib/coe/settings';
import { openPortal, startCheckout } from '@/lib/coe/billing';
import { limitNow, onStatus, refreshStatus, status, type Status } from '@/lib/coe/account';
import { cloudOn, session } from '@/lib/coe/cloud';
import { SignIn as Account } from './SignIn';
import { usage } from './store';
import { SiteFooter } from '@/ui/SiteFooter';

type PIcon = Parameters<typeof UiIcon>[0]['name'];
const POINT_ICONS: [RegExp, PIcon][] = [
  [/tokens a day/i, 'chart'], [/Deep Work/i, 'list'], [/taste of the big stuff/i, 'sparkle'], [/Coe Deep|Coe Swift|Coe Core/i, 'bolt'], [/study|Code check/i, 'graduate'],
  [/Charts|diagrams|previews/i, 'deck'], [/pictures in each|Make pictures/i, 'image'], [/longer replies/i, 'text'], [/Search the web/i, 'search'], [/PMC App/i, 'apps'],
  [/Big files/i, 'file'], [/own AI key/i, 'lock'], [/Everything in Free/i, 'check'],
];
const iconFor = (t: string): PIcon => POINT_ICONS.find(([r]) => r.test(t))?.[1] ?? 'check';

/** The Plans page. Two plain panels (Free, Pro), one switch for monthly or yearly, and today's tokens at the bottom.
 *  Your plan comes from your account. Without one, you are on Free. */
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

  const cloud = signedIn && st.billing;
  const used = cloud ? st.used : local, limit = Math.max(1, cloud ? st.limit : limitNow(loadSettings()));
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const pro$ = PLANS.find((p) => p.key === 'pro');
  const save = pro$ ? Math.max(0, pro$.monthly * 12 - pro$.yearly) : 0;

  return (
    <main className="pn">
      <i className="ht" aria-hidden><i /><i /><i /></i>

      <header className="pn-isl">
        <Link className="isl-b" href="/" aria-label="Back to Coe" title="Back to Coe"><UiIcon name="left" size={22} /></Link>
        <h2 className="isl-title d">Plans</h2>
        {signedIn
          ? <span className="isl-b isl-t d" title={st.email}>{pro ? 'Pro' : 'Free'}</span>
          : cloudOn && <button type="button" className="isl-b isl-t d" onClick={() => setAcct(true)}>Sign in</button>}
      </header>

      <div className="pn-in">
        <section className="pn-hero">
          <h1 className="d">Pick a plan</h1>
          <p className="tx">{signedIn ? <>Signed in as <b>{st.email}</b>.</> : 'You are not signed in, so you are on Free.'}</p>
          <div className="pn-bill">
            <Seg label="Billing" value={yearly ? 'year' : 'month'} onChange={(v) => setYearly(v === 'year')} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />
            {save > 0 && <p className="pn-info tx"><span className="pn-i" aria-hidden><UiIcon name="tip" size={15} strokeWidth={3.2} /></span>Paying yearly saves ${save} a year.</p>}
          </div>
        </section>

        {msg && <p className={`pn-msg tx${msg.bad ? ' bad' : ''}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}

        <section className="pn-grid" aria-label="Plans">
          {PLANS.map((p, n) => {
            const isPro = p.key === 'pro';
            const here = isPro ? pro : !pro;
            const price = yearly ? p.yearly : p.monthly;
            return (
              <article key={p.key} className={`pn-card${isPro ? ' pro' : ''}`} aria-label={`${p.name} plan`} style={{ animationDelay: `${0.08 + n * 0.08}s` }}>
                <header className="pn-h">
                  <span className="pn-sym" aria-hidden><UiIcon name={isPro ? 'medal' : 'sparkle'} size={26} /></span>
                  <h2 className="d">{p.name}</h2>
                  {here && <b className="pn-tag d">Your plan</b>}
                </header>
                <p className="pn-price"><b className="d">${price}</b><span className="tx">{!isPro ? 'always' : yearly ? 'a year' : 'a month'}</span></p>
                <div className="pn-slot">
                  {isPro
                    ? <>
                        <button type="button" className="pn-cta d" disabled={busy || !canBuy} onClick={() => (pro ? void go(() => openPortal(loadSettings())) : choosePro())}>{proLabel}</button>
                        {st.given ? <p className="pn-sub tx">Pro is on for this account.</p> : soon ? <p className="pn-sub tx">Pro is not on sale yet. Check back soon.</p> : null}
                      </>
                    : <p className="pn-sub tx">No card and no sign-in needed.</p>}
                </div>
                <ul className="pn-list">{p.points.map((x) => <li key={x} className="tx"><span className="pn-tick" aria-hidden><UiIcon name={iconFor(x)} size={16} strokeWidth={2.6} /></span><span>{x}</span></li>)}</ul>
              </article>
            );
          })}
        </section>

        <section className="pn-use" aria-label="Tokens used today">
          <div className="pn-use-h"><b className="d">Today</b><span className="tx">{fmtTok(used)} of {fmtTok(limit)} tokens used{cloud ? '' : ' on this device'}</span></div>
          <div className={`pn-meter${pct >= 90 ? ' hot' : ''}`} role="img" aria-label={`${pct} percent used`}><i style={{ width: `${pct}%` }} /></div>
          <p className="tx pn-info"><span className="pn-i" aria-hidden><UiIcon name="tip" size={15} strokeWidth={3.2} /></span><span>Tokens reset at midnight UTC.{cloud && pro && st.renews ? ` Pro renews ${new Date(st.renews).toLocaleDateString()}.` : ''}{signedIn ? '' : ' Sign in to keep your plan and tokens with your account.'}</span></p>
          {!signedIn && cloudOn && <button type="button" className="btn small gold" onClick={() => setAcct(true)}>Sign in</button>}
        </section>
        <SiteFooter />
      </div>
      {acct && <Account onClose={() => setAcct(false)} onChange={() => { void load(); }} />}
    </main>
  );
}
