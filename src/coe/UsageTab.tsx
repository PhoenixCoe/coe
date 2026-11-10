'use client';
import { useEffect, useState } from 'react';
import { session } from '@/lib/coe/cloud';
import { onStatus, status } from '@/lib/coe/account';
import { PLANS, QUOTAS, fmtTok } from '@/lib/coe/models';
import { clearRefunds, loadRefunds, onRefunds } from '@/lib/coe/refunds';
import { UsageBar } from './Usage';

const FREE_SIGNED = PLANS[0].perDay;
const when = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Settings > Usage: what is left today, the other daily limits, the last seven days, and every refund. */
export function UsageTab({ usedLocal, limitLocal }: { usedLocal: number; limitLocal: number }) {
  const me = session(), st = status();
  const [, bump] = useState(0); const [list, setList] = useState(() => loadRefunds());
  useEffect(() => onStatus(() => bump((n) => n + 1)), []);
  useEffect(() => { setList(loadRefunds()); return onRefunds(() => setList(loadRefunds())); }, []);
  const used = me && st.billing ? st.used : usedLocal, limit = me && st.billing ? st.limit : limitLocal;
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10); return { d, n: st.week?.find((w) => w.day === d)?.used ?? 0, r: st.refunds?.find((w) => w.day === d)?.used ?? 0 }; });
  const top = Math.max(1, limit, ...days.map((x) => x.n));
  const rows = (['search', 'image', 'app', 'voice'] as const).map((k) => ({ k, label: QUOTAS[k].name, q: st.quotas?.[k] })).filter((r) => r.q);
  const weekBack = me && st.billing ? days.reduce((n, x) => n + x.r, 0) : list.filter((x) => Date.now() - x.t < 7 * 86400000).reduce((n, x) => n + x.tokens, 0);
  const todayBack = me && st.billing ? days[6].r : list.filter((x) => new Date(x.t).toISOString().slice(0, 10) === days[6].d).reduce((n, x) => n + x.tokens, 0);
  return (
    <div className="acc">
      <section className="acc-card"><h3 className="d">Today</h3>
        <UsageBar used={used} limit={limit} note={me ? undefined : `Counted on this device. Sign in and you get ${fmtTok(FREE_SIGNED)} a day instead of ${fmtTok(limit)}.`} /></section>
      {me && rows.length > 0 && (
        <section className="acc-card"><h3 className="d">Other limits</h3>
          <ul className="acc-q">{rows.map((r) => { const lim = r.q!.limit > 99999 ? 0 : r.q!.limit; return <li key={r.k}><span className="tx">{r.label}</span><b className="d">{lim ? `${Math.max(0, lim - r.q!.used)} left of ${lim}` : 'no limit'}</b>{lim > 0 && <i className="acc-mini"><u style={{ width: `${Math.min(100, (r.q!.used / lim) * 100)}%` }} /></i>}</li>; })}</ul></section>
      )}
      {me && st.billing && (
        <section className="acc-card"><h3 className="d">Last 7 days</h3>
          <div className="cx-week" role="img" aria-label="Tokens used each day this week">{days.map((x) => <div key={x.d}><i style={{ height: `${Math.max(3, (x.n / top) * 100)}%` }} title={`${fmtTok(x.n)} tokens`} /><span className="tx">{new Date(x.d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2)}</span></div>)}</div></section>
      )}
      <section className="acc-card" aria-labelledby="refunds-h"><h3 className="d" id="refunds-h">Refunds</h3>
        <p className="tx">If a reply goes wrong, Coe gives back the tokens it used. That means code that was cut off, a picture or a file that could not be made, or an answer that never arrived. It does not count when you stop a reply yourself, or when something is only part of Pro or used up for today.</p>
        <div className="rf-sum"><div><b className="d">{fmtTok(todayBack)}</b><span className="tx">given back today</span></div><div><b className="d">{fmtTok(weekBack)}</b><span className="tx">in the last 7 days</span></div></div>
        {list.length === 0
          ? <p className="rf-none tx">No refunds yet. Nothing has gone wrong.</p>
          : <ul className="rf-list" aria-label="Refunds on this device">{list.map((r) => <li key={r.id}><div className="rf-top"><b className="d">+{fmtTok(r.tokens)}</b><span className="tx">{when(r.t)}</span></div><p className="rf-why tx">{r.why}</p>{r.chat && <p className="rf-chat tx">In “{r.chat}”</p>}</li>)}</ul>}
        {list.length > 0 && <div className="cx-actions"><button type="button" className="btn small" onClick={() => clearRefunds()}>Clear this list</button></div>}
        <p className="rf-note tx">The list is kept on this device. The totals above come from your account when you are signed in.</p>
      </section>
    </div>
  );
}
