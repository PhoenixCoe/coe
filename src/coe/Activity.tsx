'use client';
/**
 * What Coe is doing, and what it did: a line that changes with the job, a drop-down with every step and the
 * commands behind it, and a small browser window while it looks things up on the web.
 */
import { useEffect, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import type { Msg, ToolRun } from './store';

type IconName = Parameters<typeof UiIcon>[0]['name'];
export interface Step { id: string; icon: IconName; now: string; done: string; detail: string; command?: string; status: ToolRun['status'] | 'check'; ms?: number; run?: ToolRun; note?: string }

const short = (s: unknown, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const pretty = (o: unknown) => { try { return JSON.stringify(o, null, 2); } catch { return String(o); } };

/** One tool run, in words a person would use. */
export function describeRun(r: ToolRun): Omit<Step, 'id' | 'status' | 'ms' | 'run'> {
  const a = r.args as Record<string, unknown>;
  switch (r.tool) {
    case 'js': return { icon: 'code', now: 'Running code', done: 'Ran code', detail: short(String(a.code ?? '').split('\n').find((l) => l.trim()) ?? '', 80), command: String(a.code ?? '') };
    case 'maths': return { icon: 'sigma', now: 'Working it out exactly', done: 'Worked it out exactly', detail: short(`${a.op ?? ''} ${a.expr ?? (Array.isArray(a.exprs) ? a.exprs.join(', ') : '')}`), command: pretty(a) };
    case 'remember': return { icon: 'bookmark', now: 'Saving a note', done: 'Saved a note', detail: short(a.fact), command: pretty(a) };
    case 'search': return { icon: 'globe', now: 'Searching the web', done: 'Searched the web', detail: short(a.q), command: pretty(a) };
    case 'image': return { icon: 'image', now: 'Making a picture', done: 'Made a picture', detail: short(a.prompt), command: pretty(a) };
    case 'place': return { icon: 'pin', now: 'Looking up places', done: 'Looked up places', detail: short(a.query), command: pretty(a) };
    case 'pmc_app': return { icon: 'apps', now: `Using ${short(a.slug, 30)}`, done: `Used ${short(a.slug, 30)}`, detail: short([a.fill && 'filled in fields', Array.isArray(a.click) && a.click.length && `pressed ${a.click.join(', ')}`, a.call && 'sent a command'].filter(Boolean).join(', ') || 'opened the app'), command: pretty(a) };
    case 'github': return { icon: 'branch', now: 'Working with GitHub', done: 'Worked with GitHub', detail: short(`${a.action ?? ''} ${a.repo ?? ''}`), command: pretty(a) };
    case 'workspace': return { icon: 'folder', now: 'Working in the project folder', done: 'Worked in the project folder', detail: short(`${a.action ?? ''} ${a.path ?? ''}`), command: pretty(a) };
    case 'ask': return { icon: 'info', now: 'Asking you a question', done: 'Asked you a question', detail: short((a.questions as { question?: string }[] | undefined)?.[0]?.question ?? a.question), command: pretty(a) };
    default: return { icon: 'cloud', now: r.tool.startsWith('google') ? 'Working with Google' : 'Using a tool', done: r.tool.startsWith('google') ? 'Worked with Google' : 'Used a tool', detail: short(a.title ?? a.url ?? ''), command: pretty(a) };
  }
}

/** Every step of the request that ends at message `end`, oldest first. */
export function turnSteps(messages: Msg[], end: number): Step[] {
  let start = end; while (start > 0 && !(messages[start - 1].role === 'user' && !messages[start - 1].hidden)) start--;
  const out: Step[] = [];
  for (let i = start; i <= end; i++) {
    const m = messages[i];
    for (const r of m.runs ?? []) out.push({ id: r.id, ...describeRun(r), status: r.status, ms: r.t0 && r.t1 ? r.t1 - r.t0 : undefined, run: r, note: r.status === 'error' ? short(r.result, 160) : undefined });
    if (m.checked) out.push({ id: m.id + '-check', icon: 'shield', now: 'Looking over the answer', done: m.checked === 'fixed' ? 'Found a mistake and fixed it' : 'Looked over the answer: no mistakes found', detail: m.checked === 'fixed' ? short(m.fix, 120) : '', status: 'check' });
  }
  return out;
}

/** A small browser window: what Coe is searching for and the pages it read. It shows what was read; it is not a live copy of the sites. */
export function BrowserWindow({ run }: { run: ToolRun }) {
  const q = short(run.args.q, 140), running = run.status === 'running';
  const src = run.out?.kind === 'search' ? run.out.sources : [];
  const text = run.out?.kind === 'search' ? run.out.text : '';
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  return (
    <div className={`bw${running ? ' running' : ''}`} aria-label="What Coe found on the web">
      <div className="bw-top"><i /><i /><i /><span className="bw-bar tx"><UiIcon name="search" size={13} /><span className="bw-q">{q}</span></span></div>
      <div className="bw-load" aria-hidden />
      <div className="bw-body">
        {running && !src.length && <p className="bw-wait tx">Looking at the web…</p>}
        {src.length > 0 && <ul className="bw-tabs">{src.slice(0, 6).map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer"><span className="bw-fav d">{host(s.url).slice(0, 1).toUpperCase()}</span><span className="bw-t"><b className="d">{short(s.title, 60) || host(s.url)}</b><i>{host(s.url)}</i></span></a></li>)}</ul>}
        {text && <p className="bw-page tx">{short(text, 420)}</p>}
      </div>
    </div>
  );
}

const sec = (ms?: number) => (ms == null ? '' : ms < 950 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);

export function Activity({ steps, live, phaseNote }: { steps: Step[]; live: boolean; phaseNote?: string }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const [cmd, setCmd] = useState<Record<string, boolean>>({});
  const running = steps.find((s) => s.status === 'running');
  const searching = [...steps].reverse().find((s) => s.run?.tool === 'search');
  useEffect(() => { if (!live) setOpen((o) => (o === null ? null : o)); }, [live]);
  if (!steps.length) return null;
  const isOpen = open ?? live;
  const total = steps.reduce((n, s) => n + (s.ms ?? 0), 0);
  const head = live ? (running ? `${running.now}${running.detail ? ': ' + running.detail : ''}` : phaseNote || 'Working') : `What Coe did: ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}${total ? ` in ${sec(total)}` : ''}`;
  return (
    <div className={`act${live ? ' live' : ''}${isOpen ? ' open' : ''}`}>
      <button type="button" className="act-head" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
        <span className="act-ic" aria-hidden><UiIcon name={running?.icon ?? (live ? 'sparkle' : 'list')} size={16} /></span>
        <span className="act-t d">{head}</span>
        <UiIcon name="down" size={15} className="act-chev" />
      </button>
      {live && searching?.run && (searching.status === 'running' || isOpen) && <BrowserWindow run={searching.run} />}
      {isOpen && (
        <ol className="act-list">
          {steps.map((s) => (
            <li key={s.id} className={`act-s ${s.status}`}>
              <span className="act-si" aria-hidden><UiIcon name={s.status === 'error' ? 'alert' : s.status === 'running' ? s.icon : s.icon} size={15} /></span>
              <div className="act-sb">
                <div className="act-sl"><b className="d">{s.status === 'running' ? s.now : s.done}</b>{s.detail && <span className="tx">{s.detail}</span>}</div>
                <div className="act-sm tx">{s.status === 'running' ? 'Working…' : s.status === 'pending' ? 'Waiting for you' : s.status === 'error' ? 'Did not work' : s.status === 'check' ? 'Checked' : 'Done'}{s.ms ? ` · ${sec(s.ms)}` : ''}{s.note ? ` · ${s.note}` : ''}</div>
                {s.command && <button type="button" className="act-cmdb" aria-expanded={!!cmd[s.id]} onClick={() => setCmd((o) => ({ ...o, [s.id]: !o[s.id] }))}><UiIcon name="code" size={13} />{cmd[s.id] ? 'Hide the command' : 'Show the command'}</button>}
                {s.command && cmd[s.id] && <pre className="act-cmd"><code>{s.command.length > 4000 ? s.command.slice(0, 4000) + '\n…' : s.command}</code></pre>}
                {!live && s.run?.tool === 'search' && cmd[s.id] && <BrowserWindow run={s.run} />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
