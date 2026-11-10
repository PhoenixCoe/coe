'use client';
/**
 * What Coe is doing, and what it did: a line that changes with the job, a drop-down with every step and the
 * commands behind it.
 */
import { useEffect, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import type { Msg, ToolRun } from './store';
import { couldNot } from '@/lib/coe/honest';

type IconName = Parameters<typeof UiIcon>[0]['name'];
/** What kind of thing a step was, so a turn can be summed up in a line: "Read a file, ran 5 commands". */
export type Cat = 'read' | 'cmd' | 'web' | 'make' | 'edit' | 'shot' | 'pic' | 'app' | 'place' | 'note' | 'check' | 'other';
export interface Step { id: string; icon: IconName; now: string; done: string; detail: string; command?: string; status: ToolRun['status'] | 'check'; ms?: number; run?: ToolRun; note?: string; cat: Cat }

const short = (s: unknown, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const pretty = (o: unknown) => { try { return JSON.stringify(o, null, 2); } catch { return String(o); } };

/** One tool run, in words a person would use. */
export function describeRun(r: ToolRun): Omit<Step, 'id' | 'status' | 'ms' | 'run'> {   // eslint-disable-line complexity
  const a = r.args as Record<string, unknown>;
  switch (r.tool) {
    case 'js': return { cat: 'cmd', icon: 'code', now: 'Running code', done: 'Ran code', detail: short(String(a.code ?? '').split('\n').find((l) => l.trim()) ?? '', 80), command: String(a.code ?? '') };
    case 'maths': return { cat: 'cmd', icon: 'sigma', now: 'Working it out exactly', done: 'Worked it out exactly', detail: short(`${a.op ?? ''} ${a.expr ?? (Array.isArray(a.exprs) ? a.exprs.join(', ') : '')}`), command: pretty(a) };
    case 'remember': return { cat: 'note', icon: 'bookmark', now: 'Saving a note', done: 'Saved a note', detail: short(a.fact), command: pretty(a) };
    case 'search': return { cat: 'web', icon: 'globe', now: 'Searching the web', done: 'Searched the web', detail: short(a.q), command: pretty(a) };
    case 'image': return { cat: 'pic', icon: 'image', now: 'Making a picture', done: 'Made a picture', detail: short(a.prompt), command: pretty(a) };
    case 'place': return { cat: 'place', icon: 'pin', now: 'Looking up places', done: 'Looked up places', detail: short(a.query), command: pretty(a) };
    case 'pmc_app': return { cat: 'app', icon: 'apps', now: `Using ${short(a.slug, 30)}`, done: `Used ${short(a.slug, 30)}`, detail: short([a.fill && 'filled in fields', Array.isArray(a.click) && a.click.length && `pressed ${a.click.join(', ')}`, a.call && 'sent a command'].filter(Boolean).join(', ') || 'opened the app'), command: pretty(a) };
    case 'chat': return { cat: 'other', icon: 'chat', now: 'Changing a chat', done: 'Changed a chat', detail: short(`${a.action ?? ''} ${a.title ?? a.chat ?? ''}`), command: pretty(a) };
    case 'workspace': { const act = String(a.action ?? ''); return { cat: /^(read|list|tree|search)$/.test(act) ? 'read' : act === 'run' ? 'cmd' : /^(write|mkdir|move)$/.test(act) ? 'make' : /^(edit|delete)$/.test(act) ? 'edit' : 'other', icon: 'folder', now: 'Working in the project folder', done: act === 'read' ? 'Read a project file' : act === 'run' ? 'Ran code in the project' : act === 'write' ? 'Wrote a project file' : act === 'edit' ? 'Edited a project file' : 'Worked in the project folder', detail: short(`${a.path ?? a.q ?? ''}`), command: pretty(a) }; }
    case 'editor': { const act = String(a.action ?? 'list'), ttl = short(a.title ?? a.id ?? a.name, 50); const k = ({ doc: 'document', code: 'code file', web: 'web page', data: 'table' } as Record<string, string>)[String(a.kind ?? 'doc')] ?? 'document';
      return { cat: act === 'create' ? 'make' : /^(edit|append|rewrite|rename|delete)$/.test(act) ? 'edit' : act === 'open' ? 'other' : 'read', icon: 'note', now: act === 'create' ? `Making a ${k}` : 'Working in the editor', done: act === 'create' ? `Made a ${k}` : act === 'read' ? 'Read a document' : act === 'list' ? 'Looked at the editor' : act === 'open' ? 'Opened a document' : act === 'delete' ? 'Deleted a document' : act === 'rename' ? 'Renamed a document' : 'Edited a document', detail: ttl, command: pretty({ ...a, content: typeof a.content === 'string' && a.content.length > 600 ? a.content.slice(0, 600) + '…' : a.content }) }; }
    case 'read': return { cat: 'read', icon: 'file', now: 'Reading a file', done: 'Read a file', detail: short(a.name ?? a.file ?? a.path ?? 'what can be read'), command: pretty(a) };
    case 'screenshot': return { cat: 'shot', icon: 'camera', now: 'Taking a screenshot', done: 'Took a screenshot', detail: short(a.id ?? a.path ?? 'the page'), command: pretty(a) };
    case 'ask': return { cat: 'other', icon: 'info', now: 'Asking you a question', done: 'Asked you a question', detail: short((a.questions as { question?: string }[] | undefined)?.[0]?.question ?? a.question), command: pretty(a) };
    default: return { cat: 'other', icon: 'cloud', now: 'Using a tool', done: 'Used a tool', detail: short(a.title ?? a.url ?? ''), command: pretty(a) };
  }
}

/** Every step of the request that ends at message `end`, oldest first. */
export function turnSteps(messages: Msg[], end: number): Step[] {
  let start = end; while (start > 0 && !(messages[start - 1].role === 'user' && !messages[start - 1].hidden)) start--;
  const out: Step[] = [];
  for (let i = start; i <= end; i++) {
    const m = messages[i];
    for (const r of m.runs ?? []) out.push({ id: r.id, ...describeRun(r), ...(r.status === 'error' ? { done: couldNot(r) } : {}), status: r.status, ms: r.t0 && r.t1 ? r.t1 - r.t0 : undefined, run: r, note: r.status === 'error' ? short(r.shown ?? r.result, 160) : undefined });
    if (m.checked) out.push({ id: m.id + '-check', cat: 'check', icon: 'shield', now: 'Looking over the answer', done: m.checked === 'fixed' ? 'Found a mistake and fixed it' : 'Looked over the answer: no mistakes found', detail: m.checked === 'fixed' ? short(m.fix, 120) : '', status: 'check' });
  }
  return out;
}

/** "Read a file, ran 5 commands": what the turn did, in a line, the way Claude says it. */
export function summarise(steps: Step[]): string {
  const n: Partial<Record<Cat, number>> = {}, order: Cat[] = [];
  const failed = steps.filter((x) => x.status === 'error').map((x) => x.done[0].toLowerCase() + x.done.slice(1).replace(/^could not/, 'couldn\'t'));
  steps = steps.filter((x) => x.status !== 'error');
  for (const s of steps) { if (!n[s.cat]) order.push(s.cat); n[s.cat] = (n[s.cat] ?? 0) + 1; }
  const many = (c: number, one: string, more: (c: number) => string) => (c === 1 ? one : more(c));
  const bit: Record<Cat, (c: number) => string> = {
    read: (c) => many(c, 'read a file', (k) => `read ${k} files`), cmd: (c) => many(c, 'ran a command', (k) => `ran ${k} commands`),
    web: (c) => many(c, 'searched the web', (k) => `searched the web ${k} times`), make: (c) => many(c, 'created a file', (k) => `created ${k} files`),
    edit: (c) => many(c, 'edited a file', (k) => `edited ${k} files`), shot: (c) => many(c, 'took a screenshot', (k) => `took ${k} screenshots`),
    pic: (c) => many(c, 'made a picture', (k) => `made ${k} pictures`), app: (c) => many(c, 'used an app', (k) => `used ${k} apps`),
    place: (c) => many(c, 'looked up a place', (k) => `looked up ${k} places`), note: (c) => many(c, 'saved a note', (k) => `saved ${k} notes`),
    check: () => 'checked the answer', other: (c) => many(c, 'used a tool', (k) => `used ${k} tools`),
  };
  const t = [...order.map((c) => bit[c](n[c] ?? 1)), ...Array.from(new Set(failed))].join(', ');
  return t ? t[0].toUpperCase() + t.slice(1) : 'Steps';
}

const sec = (ms?: number) => (ms == null ? '' : ms < 950 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);

/** Steps that made a picture or a file show it right in the step, like Claude does. */
const thumbOf = (s: Step) => (s.run?.out?.kind === 'image' ? [s.run.out.img] : s.run?.out?.kind === 'files' ? s.run.out.items.filter((f) => f.type.startsWith('image/')).slice(0, 4).map((f) => ({ name: f.name, type: f.type, data: f.data })) : []);

/** "Worked for 14 s": shut by default, and only there at all when Coe did more than five things, or something went wrong or is waiting for you. */
export function Activity({ steps: every, live, phaseNote }: { steps: Step[]; live: boolean; phaseNote?: string }) {
  const steps = every.filter((s) => s.cat !== 'web');   // a web search already has its own small card in the chat
  const [open, setOpen] = useState(false);
  const [cmd, setCmd] = useState<Record<string, boolean>>({});
  void phaseNote;
  const [zoom, setZoom] = useState<{ src: string; name: string } | null>(null);
  useEffect(() => { if (!zoom) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [zoom]);
  if (live || !steps.length || steps.every((s) => s.status === 'error')) return null;   // when nothing worked, the reply already says so once   // while a reply is made, the only thing that moves is the one generating line
  const total = steps.reduce((n, s) => n + (s.ms ?? 0), 0), bad = steps.filter((s) => s.status === 'error').length, pend = steps.some((s) => s.status === 'pending');
  return (
    <div className={`act${open ? ' open' : ''}${bad ? ' bad' : ''}`}>
      <button type="button" className="act-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="act-t d">{summarise(steps)}</span>
        <span className="act-n tx">{total ? sec(total) : pend ? 'waiting for you' : ''}</span>
        <UiIcon name="down" size={15} className="act-chev" />
      </button>
      {open && (
        <ol className="act-list">
          {steps.map((s) => {
            const pics = thumbOf(s);
            return (
              <li key={s.id} className={`act-s ${s.status}`}>
                <span className="act-si" aria-hidden><UiIcon name={s.status === 'error' ? 'alert' : s.icon} size={14} /></span>
                <div className="act-sb">
                  <div className="act-sl"><b className="d">{s.status === 'running' ? s.now : s.done}</b>{s.detail && <span className="tx">{s.detail}</span>}</div>
                  {(s.status !== 'ok' || s.ms || s.note) && <div className="act-sm tx">{s.status === 'running' ? 'Working' : s.status === 'pending' ? 'Waiting for you' : s.status === 'error' ? 'Did not work' : s.status === 'check' ? 'Checked' : ''}{s.ms ? `${s.status === 'ok' ? '' : ' · '}${sec(s.ms)}` : ''}{s.note ? ` · ${s.note}` : ''}</div>}
                  {pics.length > 0 && <div className="act-pics">{pics.map((p, k) => <button key={k} type="button" className="act-pic" aria-label={`Look closer: ${p.name}`} title="Look closer" onClick={() => setZoom({ src: `data:${p.type};base64,${p.data}`, name: p.name })}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`data:${p.type};base64,${p.data}`} alt={p.name} /></button>)}</div>}
                  {s.run?.out?.kind === 'doc' && <button type="button" className="act-open btn small" onClick={() => window.dispatchEvent(new CustomEvent('coe:open-doc', { detail: { id: (s.run!.out as { id: string }).id } }))}><UiIcon name="edit" size={14} />Open “{short((s.run.out as { title: string }).title, 30)}”</button>}
                  {s.command && <button type="button" className="act-cmdb" aria-expanded={!!cmd[s.id]} aria-label={cmd[s.id] ? 'Hide the command' : 'Show the command'} title={cmd[s.id] ? 'Hide the command' : 'Show the command'} onClick={() => setCmd((o) => ({ ...o, [s.id]: !o[s.id] }))}><UiIcon name="code" size={13} /></button>}
                  {s.command && cmd[s.id] && <pre className="act-cmd"><code>{s.command.length > 4000 ? s.command.slice(0, 4000) + '\n…' : s.command}</code></pre>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {zoom && <div className="act-lb" role="dialog" aria-modal="true" aria-label={zoom.name} onClick={() => setZoom(null)}><button type="button" className="act-lbx btn gold" onClick={() => setZoom(null)} aria-label="Close picture"><UiIcon name="close" size={18} />Close</button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={zoom.src} alt={zoom.name} onClick={(e) => e.stopPropagation()} /></div>}
    </div>
  );
}
