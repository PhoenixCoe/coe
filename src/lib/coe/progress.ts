/**
 * The step counter. If Coe wrote a plan for this request, the counter follows the plan ("Step 3 of 6"); if not, it counts what Coe has done.
 * Also what the panel under the counter lists: the steps, what was made, and what was used.
 */
import type { Conv, Img, Msg } from '@/coe/store';
import { describeRun, turnSteps, type Cat, type Step } from '@/coe/Activity';

export interface Plan { steps: string[]; done: number }
export interface Info {
  /** The short text on the button. */
  label: string; short: string;
  /** A plan Coe wrote, with how far it has got; otherwise the steps it has taken. */
  plan: Plan | null; steps: Step[];
  /** Which one the rail points at (a plan step, or the step that is running). -1 when everything is done. */
  now: number; finished: boolean; total: number;
}

const BLOCK = /```coe-plan[ \t]*\r?\n([\s\S]*?)\r?\n```/g;

/** The newest plan in the request that is being answered (everything after the person's last message). */
export function planOf(messages: Msg[]): Plan | null {
  let from = messages.length - 1; while (from >= 0 && !(messages[from].role === 'user' && !messages[from].hidden)) from--;
  for (let i = messages.length - 1; i > from; i--) {
    const m = messages[i]; if (m.role !== 'assistant' || !m.text.includes('```coe-plan')) continue;
    let last: string | null = null; for (const g of m.text.matchAll(BLOCK)) last = g[1];
    if (last == null) continue;
    try {
      const j = JSON.parse(last) as { steps?: unknown; done?: unknown };
      const steps = (Array.isArray(j.steps) ? j.steps : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
      if (steps.length) return { steps, done: Math.max(0, Math.min(steps.length, Math.round(Number(j.done) || 0))) };
    } catch { /* an unfinished block: look further back */ }
  }
  return null;
}

/** What the button says, or null when there is nothing to count yet. */
export function stepInfo(messages: Msg[], busy: boolean): Info | null {
  let end = messages.length - 1; while (end >= 0 && messages[end].role !== 'assistant') end--;
  const steps = end >= 0 ? turnSteps(messages, end).filter((s) => s.cat !== 'check') : [];
  const plan = planOf(messages);
  if (plan) {
    const fin = plan.done >= plan.steps.length, at = Math.min(plan.done + 1, plan.steps.length);
    return { label: fin ? `All ${plan.steps.length} steps done` : `Step ${at} of ${plan.steps.length}`, short: fin ? `${plan.steps.length}/${plan.steps.length}` : `${at}/${plan.steps.length}`, plan, steps, now: fin ? -1 : plan.done, finished: fin, total: plan.steps.length };
  }
  if (!steps.length) return null;
  const run = steps.findIndex((s) => s.status === 'running' || s.status === 'pending');
  const n = steps.length;
  return { label: busy ? `Step ${n}` : `${n} ${n === 1 ? 'step' : 'steps'}`, short: String(n), plan: null, steps, now: busy && run >= 0 ? run : -1, finished: !busy, total: n };
}

export interface Used { cat: Cat | 'upload'; label: string; note: string }
const LABEL: Partial<Record<Cat, string>> = { web: 'Web search', cmd: 'Code and maths', read: 'Read files', make: 'Made files', edit: 'Edited', shot: 'Screenshots', pic: 'Pictures made', app: 'PMC Apps', place: 'Places', note: 'Memory' };
const UNIT: Partial<Record<Cat, [string, string]>> = { web: ['search', 'searches'], cmd: ['run', 'runs'], read: ['file', 'files'], make: ['file', 'files'], edit: ['change', 'changes'], shot: ['picture', 'pictures'], pic: ['picture', 'pictures'], app: ['use', 'uses'], place: ['look-up', 'look-ups'], note: ['note saved', 'notes saved'] };
export const USED_ORDER: Cat[] = ['web', 'cmd', 'read', 'make', 'edit', 'shot', 'pic', 'app', 'place', 'note'];

/** What was used in the whole chat: files the person added, then each kind of tool with a count. */
export function usedIn(messages: Msg[]): Used[] {
  const out: Used[] = [], up: string[] = [], n: Partial<Record<Cat, number>> = {};
  for (const m of messages) {
    if (m.role === 'user' && !m.hidden) { m.images?.forEach((i) => up.push(i.name)); m.attach?.forEach((a) => up.push(a.name)); }
    for (const r of m.runs ?? []) { if (r.status === 'pending') continue; const c = describeRun(r).cat; n[c] = (n[c] ?? 0) + 1; }
  }
  if (up.length) out.push({ cat: 'upload', label: 'Uploads', note: up.length > 1 ? `${up[0].length > 22 ? up[0].slice(0, 21) + '…' : up[0]} +${up.length - 1}` : up[0].length > 28 ? up[0].slice(0, 27) + '…' : up[0] });
  for (const c of USED_ORDER) { const k = n[c]; if (k) { const u = UNIT[c] ?? ['time', 'times']; out.push({ cat: c, label: LABEL[c] ?? 'Tools', note: `${k} ${k === 1 ? u[0] : u[1]}` }); } }
  return out;
}

/** Pictures Coe made with its tools, newest last. */
export const madePictures = (c: Conv): Img[] => c.messages.flatMap((m) => (m.runs ?? []).flatMap((r) => (r.out?.kind === 'image' ? [r.out.img] : [])));
