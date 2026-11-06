'use client';
/**
 * Coe asking you something: ```ask {"questions":[{"id","type":"choice|multi|slider|yesno|text","question",...}]}
 * It is a box in the chat, not a message, so it costs no tokens to answer until you press Send answers.
 */
import { useMemo, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { Slider } from '@/ui/Controls';

type Q = { id: string; type: 'choice' | 'multi' | 'slider' | 'yesno' | 'text'; question: string; options: string[]; min: number; max: number; step: number; unit: string; def: number; labels?: string[]; placeholder: string };
type A = string | string[] | number | boolean | null;

function parse(code: string): Q[] | null {
  try {
    const j = JSON.parse(code); const raw = Array.isArray(j) ? j : j?.questions; if (!Array.isArray(raw)) return null;
    const out: Q[] = raw.slice(0, 4).map((r: Record<string, unknown>, i: number) => {
      const type = (['choice', 'multi', 'slider', 'yesno', 'text'] as const).find((t) => t === r.type) ?? (Array.isArray(r.options) ? 'choice' : 'text');
      const min = Number.isFinite(Number(r.min)) ? Number(r.min) : 0, max = Number.isFinite(Number(r.max)) && Number(r.max) > min ? Number(r.max) : min + 10;
      const step = Number(r.step) > 0 ? Number(r.step) : 1;
      return { id: String(r.id ?? `q${i + 1}`).slice(0, 30), type, question: String(r.question ?? '').slice(0, 220), options: Array.isArray(r.options) ? (r.options as unknown[]).slice(0, 8).map((o) => String(o).slice(0, 80)) : [], min, max, step, unit: String(r.unit ?? '').slice(0, 20), def: Math.min(max, Math.max(min, Number.isFinite(Number(r.default)) ? Number(r.default) : Math.round((min + max) / 2 / step) * step)), labels: Array.isArray(r.labels) ? (r.labels as unknown[]).slice(0, 5).map(String) : undefined, placeholder: String(r.placeholder ?? '').slice(0, 80) };
    }).filter((q: Q) => q.question && (q.type !== 'choice' && q.type !== 'multi' ? true : q.options.length >= 2));
    return out.length ? out : null;
  } catch { return null; }
}
const keyOf = (k: string) => `pmc:coe:asked:${k}`;
const said = (q: Q, a: A): string => (a === null || a === '' || (Array.isArray(a) && !a.length) ? '' : Array.isArray(a) ? a.join(', ') : typeof a === 'boolean' ? (a ? 'Yes' : 'No') : typeof a === 'number' ? `${a}${q.unit ? ' ' + q.unit : ''}` : a);

export function AskCard({ code, closed, id, send }: { code: string; closed: boolean; id: string; send?: (text: string) => void }) {
  const qs = useMemo(() => (closed ? parse(code) : null), [code, closed]);
  const [ans, setAns] = useState<Record<string, A>>({});
  const [done, setDone] = useState<string | null>(() => { try { return localStorage.getItem(keyOf(id)); } catch { return null; } });
  if (!closed) return <div className="ask ask-wait tx"><UiIcon name="chat" size={18} />Coe has a question…</div>;
  if (!qs) return null;
  const get = (q: Q): A => (q.id in ans ? ans[q.id] : q.type === 'slider' ? q.def : q.type === 'multi' ? [] : null);
  const set = (q: Q, v: A) => setAns((o) => ({ ...o, [q.id]: v }));
  const finish = (text: string) => { try { localStorage.setItem(keyOf(id), text); } catch { /* storage blocked */ } setDone(text); send?.(text); };
  const submit = () => {
    const lines = qs.map((q) => { const t = said(q, get(q)); return t ? `- ${q.question} ${t}` : ''; }).filter(Boolean);
    finish(lines.length ? `My answers:\n${lines.join('\n')}` : 'Choose sensible answers yourself and carry on.');
  };
  const any = qs.some((q) => said(q, get(q)) !== '' && !(q.type === 'slider' && !(q.id in ans)));

  if (done) return (
    <div className="ask done" role="status"><div className="ask-h d"><UiIcon name="check" size={18} />Answered</div>
      <p className="tx ask-sum">{done.startsWith('My answers:') ? done.replace('My answers:\n', '').split('\n').map((l) => l.replace(/^- /, '')).join(' · ') : 'Left it to Coe.'}</p></div>
  );
  return (
    <form className="ask" aria-label="Coe has a question" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="ask-h d"><UiIcon name="chat" size={18} />Coe asks</div>
      {qs.map((q) => {
        const v = get(q);
        return (
          <fieldset key={q.id} className="ask-q">
            <legend className="ask-l tx">{q.question}</legend>
            {(q.type === 'choice' || q.type === 'multi') && (
              <div className="ask-opts" role={q.type === 'choice' ? 'radiogroup' : 'group'}>
                {q.options.map((o) => {
                  const on = q.type === 'choice' ? v === o : Array.isArray(v) && v.includes(o);
                  return <button key={o} type="button" role={q.type === 'choice' ? 'radio' : 'checkbox'} aria-checked={on} className={`ask-o${on ? ' on' : ''}`}
                    onClick={() => set(q, q.type === 'choice' ? (on ? null : o) : on ? (v as string[]).filter((x) => x !== o) : [...(Array.isArray(v) ? v : []), o])}><span className={`ask-k${q.type === 'multi' ? ' sq' : ''}`} aria-hidden>{on && <UiIcon name="check" size={12} />}</span><span className="d">{o}</span></button>;
                })}
              </div>
            )}
            {q.type === 'yesno' && (
              <div className="ask-opts yn" role="radiogroup">{[true, false].map((b) => <button key={String(b)} type="button" role="radio" aria-checked={v === b} className={`ask-o${v === b ? ' on' : ''}`} onClick={() => set(q, v === b ? null : b)}><span className="ask-k" aria-hidden>{v === b && <UiIcon name="check" size={12} />}</span><span className="d">{b ? 'Yes' : 'No'}</span></button>)}</div>
            )}
            {q.type === 'slider' && <Slider hideLabel label={q.question} value={Number(v)} min={q.min} max={q.max} step={q.step} onChange={(n) => set(q, n)} format={(n) => `${n}${q.unit ? ' ' + q.unit : ''}`} marks={q.labels?.length ? q.labels.map((l, i, a) => ({ value: q.min + ((q.max - q.min) * i) / Math.max(1, a.length - 1), label: l })) : undefined} />}
            {q.type === 'text' && <input type="text" className="cx-in ask-t" value={typeof v === 'string' ? v : ''} maxLength={300} placeholder={q.placeholder || 'Type here'} aria-label={q.question} onChange={(e) => set(q, e.target.value)} />}
          </fieldset>
        );
      })}
      <div className="ask-acts">
        <button type="submit" className="btn gold" disabled={!send}><UiIcon name="send" size={15} />Send answers</button>
        <button type="button" className="btn small" disabled={!send} onClick={() => finish('Choose sensible answers yourself and carry on.')}>You choose</button>
      </div>
    </form>
  );
}
