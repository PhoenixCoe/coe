import { planNow } from '@/lib/coe/account';
import { ask, type CoeError } from '@/lib/coe/client';
import { MAX_REPLY, type ModelKey } from '@/lib/coe/models';
import type { CoeSettings } from '@/lib/coe/settings';
import { fid } from './text';
import { langName, type Finding, type Lang, type Severity } from './types';

const SYSTEM = `You check code for a person who is learning. Find real mistakes: code that will not run, wrong results, and things that will break.
Reply with JSON only. No text before or after it, no code fences.
Shape: {"findings":[{"line":number,"endLine":number|null,"severity":"error"|"warning"|"tip","title":"a few words","why":"one short sentence","idea":"one short sentence on what to do","replace":{"from":number,"to":number,"text":"the new code for those lines"}|null}],"summary":"one short sentence"}
Rules:
- Line numbers start at 1 and match the numbered code you are given.
- "replace" swaps lines from..to with "text". Give it only when you are sure. Keep it as small as possible. Keep the person's indentation and style.
- title, why and idea are plain, short and kind. No jargon. Do not repeat the same problem twice.
- Do not list style opinions as errors. Use "tip" for those, and at most three.
- If the code is fine, return an empty findings list and a summary that says so.
- Items marked "already found" are known. Do not repeat them.`;

export interface Asked { findings: Finding[]; summary: string; cut: boolean; tokens?: number; credits?: { used: number; limit: number; plan: string } }

const numbered = (code: string) => code.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');

function pickJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no json');
  return JSON.parse(t.slice(a, b + 1));
}
const sev = (s: unknown): Severity => (s === 'error' || s === 'warning' || s === 'tip' ? s : 'warning');
const int = (n: unknown, max: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(1, Math.round(n))) : undefined);

export async function askCoe(s: CoeSettings, o: { code: string; lang: Lang; notes: string; known: Finding[]; model: ModelKey; signal?: AbortSignal }): Promise<Asked> {
  const total = o.code.split('\n').length;
  const known = o.known.slice(0, 12).map((f) => `line ${f.line}: ${f.title}`).join('\n');
  const user = [
    `Language: ${o.lang === 'other' ? 'not sure, work it out' : langName(o.lang)}`,
    o.notes.trim() && `What the person says is wrong or what it should do:\n${o.notes.trim().slice(0, 1500)}`,
    known && `Already found:\n${known}`,
    `Code (${total} lines):\n${numbered(o.code)}`,
  ].filter(Boolean).join('\n\n');
  const r = await ask(s, { model: o.model, system: SYSTEM, messages: [{ role: 'user', text: user }], maxTokens: MAX_REPLY[planNow(s)], signal: o.signal });
  let j: { findings?: unknown[]; summary?: unknown };
  try { j = pickJson(r.text) as typeof j; }
  catch { throw Object.assign(new Error('Coe answered, but not in a form this page can read. Try again.'), { kind: 'bad' }) as CoeError; }
  const findings: Finding[] = [];
  for (const raw of Array.isArray(j.findings) ? j.findings : []) {
    const f = raw as Record<string, unknown>;
    const line = int(f.line, total); const title = typeof f.title === 'string' ? f.title.trim() : '';
    if (!line || !title) continue;
    const rep = f.replace as { from?: unknown; to?: unknown; text?: unknown } | null | undefined;
    let fix: Finding['fix'];
    if (rep && typeof rep.text === 'string') { const from = int(rep.from, total), to = int(rep.to, total); if (from && to && to >= from && to - from < 40) fix = { from, to, text: rep.text.replace(/\n$/, '') }; }
    findings.push({ id: fid(), line, endLine: int(f.endLine, total), severity: sev(f.severity), title: title.slice(0, 90), why: typeof f.why === 'string' ? f.why.slice(0, 220) : undefined, idea: typeof f.idea === 'string' ? f.idea.slice(0, 220) : undefined, fix, source: 'coe' });
  }
  return { findings: findings.slice(0, 20), summary: typeof j.summary === 'string' ? j.summary.slice(0, 240) : '', cut: r.cut, tokens: (r.inTokens ?? 0) + (r.outTokens ?? 0) || undefined, credits: r.credits };
}
