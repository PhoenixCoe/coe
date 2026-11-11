'use client';
import { useEffect, useState } from 'react';
import { Row, Select } from '@/ui/Controls';
import { ownerCmd } from '@/lib/coe/billing';
import { refreshStatus, status } from '@/lib/coe/account';
import { loadSettings, type CoeSettings } from '@/lib/coe/settings';
import { onPretend, PRETEND, pretending, setPretend } from '@/lib/coe/ownertest';
import { COE_VERSION } from '@/lib/coe/changelog';

type Say = { kind: 'ok' | 'bad'; text: string } | null;

/** Owner tools. This tab exists only for an email listed in OWNER_EMAILS on the server (the server says so, the page cannot just claim it). */
export function OwnerTab({ settings, onClearFiles }: { settings: CoeSettings; onClearFiles: () => void }) {
  const [msg, setMsg] = useState<Say>(null), [busy, setBusy] = useState(''), [pick, setPick] = useState(pretending());
  const [info, setInfo] = useState<Record<string, unknown> | null>(null), [sure, setSure] = useState(false);
  const [trig, setTrig] = useState<{ name: string; what: string }[] | null>(null);
  useEffect(() => onPretend(() => setPick(pretending())), []);
  const run = async (what: string, f: () => Promise<void>) => { setBusy(what); setMsg(null); try { await f(); } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message || 'That did not work.' }); } setBusy(''); };
  const refill = () => run('refill', async () => { await ownerCmd(settings, 'refill'); await refreshStatus(settings); setMsg({ kind: 'ok', text: 'Done. Your tokens and daily allowances for today are back.' }); });
  const look = (cmd: 'status' | 'debug') => run(cmd, async () => { const r = await ownerCmd<{ status: Record<string, unknown> }>(settings, cmd); setInfo(r.status); });
  const dump = () => run('dump', async () => {
    const r = await ownerCmd<{ status: Record<string, unknown> }>(settings, 'debug').catch(() => null);
    const { apiKey: _a, keys: _k, code: _c, ...safe } = loadSettings() as unknown as Record<string, unknown>; void _a; void _k; void _c;
    const text = JSON.stringify({ app: 'Coe', version: COE_VERSION, at: new Date().toISOString(), page: location.href, agent: navigator.userAgent, screen: `${innerWidth}x${innerHeight}`, you: status(), settings: safe, server: r?.status ?? 'not reachable' }, null, 2);
    await navigator.clipboard.writeText(text);
    setMsg({ kind: 'ok', text: 'Copied. Keys and codes are left out.' });
  });
  const set = (v: string) => { setPick(v); setPretend(v); };
  const fmt = (v: unknown): string => (typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'object' && v ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${fmt(x)}`).join(', ') : String(v));
  return (
    <div className="set-list own">
      <p className="tx cx-small">Only you can see this. The server checks your account, so nobody else can open it.</p>
      <Row label="Refill my tokens" icon="chart" hint="Puts today's tokens and daily allowances back, for your account."><button type="button" className="btn small" disabled={!!busy} onClick={() => void refill()}>{busy === 'refill' ? 'Working' : 'Refill'}</button></Row>
      <Row label="Pretend a problem" icon="alert" hint={pick ? 'Your next message will fail this way, once.' : 'Pick one, then send a message to see how it looks.'}>
        <Select label="Pretend a problem" value={pick} options={PRETEND} onChange={set} block={false} small />
      </Row>
      <Row label="Test replies" icon="bolt" hint="Type TRIGGER-NAME as a message and Coe answers with a ready-made reply. No tokens are used, in Coe and in Coe Mini.">
        <button type="button" className="btn small" aria-expanded={!!trig} onClick={() => { if (trig) setTrig(null); else void import('@/lib/coe/triggers').then((m) => setTrig(m.TRIGGERS)); }}>{trig ? 'Hide the list' : 'Show the list'}</button>
      </Row>
      {trig && <dl className="own-info own-trig">{trig.map((t) => <div key={t.name}><dt className="d"><button type="button" className="cx-link" onClick={() => { void navigator.clipboard?.writeText(t.name).then(() => setMsg({ kind: 'ok', text: `Copied ${t.name}. Paste it as a message.` }), () => {}); }}>{t.name}</button></dt><dd className="tx">{t.what}</dd></div>)}</dl>}
      <Row label="Server status" icon="cloud" hint="What is switched on. Nothing secret is shown."><button type="button" className="btn small" disabled={!!busy} onClick={() => void look('status')}>{busy === 'status' ? 'Working' : 'Check'}</button></Row>
      <Row label="Debug dump" icon="code" hint="Copies a report of this device and the server. Keys and codes are left out."><button type="button" className="btn small" disabled={!!busy} onClick={() => void dump()}>{busy === 'dump' ? 'Working' : 'Copy'}</button></Row>
      <Row label="Clear this chat's files" icon="trash" hint="Empties the project folder of the chat you are in.">
        {sure ? <span className="own-sure"><button type="button" className="btn small" onClick={() => { onClearFiles(); setSure(false); setMsg({ kind: 'ok', text: 'The files in this chat are cleared.' }); }}>Yes, clear</button><button type="button" className="btn small" onClick={() => setSure(false)}>No</button></span> : <button type="button" className="btn small" onClick={() => setSure(true)}>Clear</button>}
      </Row>
      {msg && <p className={`own-msg tx${msg.kind === 'bad' ? ' bad' : ''}`} role={msg.kind === 'bad' ? 'alert' : 'status'}>{msg.text}</p>}
      {info && <dl className="own-info">{Object.entries(info).map(([k, v]) => <div key={k}><dt className="d">{k}</dt><dd className="tx">{fmt(v)}</dd></div>)}</dl>}
    </div>
  );
}
