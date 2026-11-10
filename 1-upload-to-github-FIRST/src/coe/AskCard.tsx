'use client';
/**
 * Coe asking you something: ```ask {"questions":[{"id","type":"choice|multi|slider|yesno|text","question",...}]}
 * It is a box in the chat, not a message, so it costs no tokens to answer until you press Send answers.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [at, setAt] = useState(0);
  const [done, setDone] = useState<string | null>(() => { try { return localStorage.getItem(keyOf(id)); } catch { return null; } });
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  if (!closed) return <div className="ask ask-wait tx"><UiIcon name="chat" size={18} />Coe has a question…</div>;
  if (!qs) return null;
  const get = (q: Q): A => (q.id in ans ? ans[q.id] : q.type === 'slider' ? q.def : q.type === 'multi' ? [] : null);
  const set = (q: Q, v: A) => setAns((o) => ({ ...o, [q.id]: v }));
  const finish = (text: string) => { try { localStorage.setItem(keyOf(id), text); } catch { /* storage blocked */ } setDone(text); send?.(text); };
  const submit = () => {
    const lines = qs.map((q) => { const t = said(q, get(q)); return t && !(q.type === 'slider' && !(q.id in ans)) ? `- ${q.question} ${t}` : ''; }).filter(Boolean);
    finish(lines.length ? `My answers:\n${lines.join('\n')}` : 'Choose sensible answers yourself and carry on.');
  };

  if (done) return (
    <div className="ask done" role="status"><span className="ask-dn d"><UiIcon name="check" size={16} />Answered</span>
      <p className="tx ask-sum">{done.startsWith('My answers:') ? done.replace('My answers:\n', '').split('\n').map((l) => l.replace(/^- /, '')).join(' · ') : 'Left it to Coe.'}</p></div>
  );

  const q = qs[Math.min(at, qs.length - 1)], v = get(q), last = at >= qs.length - 1, many = qs.length > 1;
  const next = () => { if (last) submit(); else setAt((n) => n + 1); };
  const pickOne = (o: string, on: boolean) => {
    set(q, on ? null : o);
    if (!on && last && qs.length === 1 && send) { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => finish(`My answers:\n- ${q.question} ${o}`), 260); return; }
    if (!on && !last) { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setAt((n) => Math.min(n + 1, qs.length - 1)), 220); }
  };
  const opts: string[] = q.type === 'yesno' ? ['Yes', 'No'] : q.options;
  const isOn = (o: string) => (q.type === 'yesno' ? v === (o === 'Yes') : q.type === 'choice' ? v === o : Array.isArray(v) && v.includes(o));
  const choose = (o: string) => {
    const on = isOn(o);
    if (q.type === 'yesno') { set(q, on ? null : o === 'Yes'); if (!on && last && qs.length === 1 && send) { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => finish(`My answers:\n- ${q.question} ${o}`), 260); return; } if (!on && !last) { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setAt((n) => Math.min(n + 1, qs.length - 1)), 220); } }
    else if (q.type === 'choice') pickOne(o, on);
    else set(q, on ? (v as string[]).filter((x) => x !== o) : [...(Array.isArray(v) ? v : []), o]);
  };
  return (
    <form className="ask" aria-label="Coe has a question" onSubmit={(e) => { e.preventDefault(); next(); }}
      onKeyDown={(e) => { if ((e.target as HTMLElement).tagName === 'INPUT') return; const n = Number(e.key); if (n >= 1 && n <= opts.length) { e.preventDefault(); choose(opts[n - 1]); } }}>
      {many && <div className="ask-prog" role="progressbar" aria-valuemin={1} aria-valuemax={qs.length} aria-valuenow={at + 1} aria-label={`Question ${at + 1} of ${qs.length}`}>{qs.map((x, k) => <i key={x.id} className={k < at ? 'done' : k === at ? 'now' : ''} />)}</div>}
      <div className="ask-top d"><span>Coe asks</span>{many && <span className="ask-of">{at + 1} / {qs.length}</span>}</div>
      <fieldset className="ask-q" key={q.id}>
        <legend className="ask-l d">{q.question}</legend>
        {(q.type === 'choice' || q.type === 'multi' || q.type === 'yesno') && (
          <div className="ask-opts" role={q.type === 'multi' ? 'group' : 'radiogroup'} aria-label={q.question}>
            {opts.map((o, k) => {
              const on = isOn(o);
              return <button key={o} type="button" role={q.type === 'multi' ? 'checkbox' : 'radio'} aria-checked={on} className={`ask-o${on ? ' on' : ''}`} onClick={() => choose(o)}>
                <kbd className="ask-n d" aria-hidden>{k + 1}</kbd><span className="ask-t tx">{o}</span><span className={`ask-k${q.type === 'multi' ? ' sq' : ''}`} aria-hidden>{on && <UiIcon name="check" size={13} />}</span></button>;
            })}
          </div>
        )}
        {q.type === 'slider' && <Slider hideLabel label={q.question} value={Number(v)} min={q.min} max={q.max} step={q.step} onChange={(n) => set(q, n)} format={(n) => `${n}${q.unit ? ' ' + q.unit : ''}`} marks={q.labels?.length ? q.labels.map((l, i, a) => ({ value: q.min + ((q.max - q.min) * i) / Math.max(1, a.length - 1), label: l })) : undefined} />}
        {q.type === 'text' && <input type="text" autoFocus className="cx-in ask-ti" value={typeof v === 'string' ? v : ''} maxLength={300} placeholder={q.placeholder || 'Type here'} aria-label={q.question} onChange={(e) => set(q, e.target.value)} />}
      </fieldset>
      <div className="ask-acts">
        {at > 0 && <button type="button" className="ask-b" aria-label="Back" title="Back" onClick={() => setAt((n) => Math.max(0, n - 1))}><UiIcon name="left" size={18} /></button>}
        <button type="button" className="ask-skip tx" disabled={!send} onClick={() => finish('Choose sensible answers yourself and carry on.')}>Let Coe decide</button>
        <span className="cx-grow" />
        <button type="submit" className="btn gold ask-go" disabled={!send}>{last ? 'Send' : 'Next'}<UiIcon name={last ? 'send' : 'right'} size={16} /></button>
      </div>
    </form>
  );
}
