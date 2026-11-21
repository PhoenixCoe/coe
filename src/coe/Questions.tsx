'use client';
/**
 * Questions with their answers, the same cards Coe Mini shows on a page: ```questions {"title","kind","items":[{"n","q","options","answer","working","sure","how"}]}
 * One question at a time, with a back arrow, a numbered box for each question and a next arrow (the same way through as in Coe Mini). Coe Mini keeps
 * the questions it works out in the chat as this block, so a chat opened here shows the same cards.
 * The website cannot type into another page, so the cards are for reading and ticking off. "I did it" ticks the question and goes to the next.
 * "Wrong" asks Coe to try again (a free redo, like the Redo button). "How I got it" shows the working, or asks Coe for it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { Inline } from './Study';

type Item = { n: number; q: string; options: string[]; answer: string; working: string; how: string; unsure: boolean; ok: boolean };
function parse(code: string): { title: string; kind: string; items: Item[] } | null {
  try {
    const j = JSON.parse(code); const raw = Array.isArray(j) ? j : j?.items; if (!Array.isArray(raw)) return null;
    const items: Item[] = raw.slice(0, 60).map((r: Record<string, unknown>, k: number) => ({
      n: Number(r.n) > 0 ? Number(r.n) : k + 1,
      q: String(r.q ?? r.question ?? '').slice(0, 600), options: Array.isArray(r.options) ? (r.options as unknown[]).slice(0, 8).map((o) => String(o).slice(0, 120)) : [],
      answer: String(r.answer ?? '').slice(0, 400), working: String(r.working ?? '').slice(0, 900), how: String(r.how ?? '').slice(0, 900), unsure: /^l/i.test(String(r.sure ?? '')), ok: r.ok === 1 || r.ok === true,
    })).filter((i: Item) => i.q);
    return items.length ? { title: String(j?.title ?? '').slice(0, 90), kind: String(j?.kind ?? '').slice(0, 24), items } : null;
  } catch { return null; }
}
type Saved = { done: number[]; right: number[]; wrong: number[] };
const keyOf = (id: string) => `pmc:coe:qz:${id}`;
const load = (id: string): Saved => { try { const j = JSON.parse(localStorage.getItem(keyOf(id)) || 'null'); if (j && Array.isArray(j.done)) return { done: j.done, right: j.right ?? [], wrong: j.wrong ?? [] }; } catch { /* storage blocked */ } return { done: [], right: [], wrong: [] }; };
const has = (a: number[], n: number) => a.includes(n);

export function QuestionsBlock({ code, closed, id, ask, redo }: { code: string; closed: boolean; id: string; ask?: (text: string) => void; redo?: (note?: string) => void }) {
  const data = useMemo(() => (closed ? parse(code) : null), [code, closed]);
  const [s, setS] = useState<Saved>({ done: [], right: [], wrong: [] });
  const [at, setAt] = useState(0);
  const [dir, setDir] = useState<'' | 'r' | 'l'>('');
  const [how, setHow] = useState<number[]>([]);
  const nav = useRef<HTMLDivElement>(null);
  useEffect(() => { setS(load(id)); }, [id]);
  const save = (n: Saved) => { setS(n); try { localStorage.setItem(keyOf(id), JSON.stringify(n)); } catch { /* storage blocked */ } };
  if (!closed) return <div className="qz-wait tx" role="status"><span className="dots"><i /><i /><i /></span>Setting out the questions…</div>;
  if (!data) return null;
  const live = !!ask;   // on a shared page it is only for reading
  const total = data.items.length, i = Math.max(0, Math.min(at, total - 1)), it = data.items[i];
  const go = (to: number) => { if (to < 0 || to >= total || to === i) return; setDir(to > i ? 'r' : 'l'); setAt(to); };
  const done = has(s.done, it.n), shown = has(how, it.n), why = it.how || it.working;
  const isOk = (x: Item) => x.ok || has(s.right, x.n);   // done with the right answer: Coe Mini saw the page show it, or you pressed Right
  const stateOf = (k: number) => (has(s.done, data.items[k].n) || data.items[k].ok ? ' done' : data.items[k].answer ? ' ans' : '') + (isOk(data.items[k]) ? ' got' : '');
  return (
    <section className="qz" aria-label="Questions">
      <header className="qz-h">
        <b className="d">{total} question{total === 1 ? '' : 's'}</b>{(data.kind || data.title) && <span className="qz-k d">{data.kind || data.title}</span>}<span className="grow" />
      </header>
      {total > 1 && (
        <div className="qz-nav" ref={nav} onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); } }}>
          <button type="button" className="qz-arw" aria-label="Back" title="Back" disabled={i === 0} onClick={() => go(i - 1)}><UiIcon name="back" size={15} strokeWidth={3.6} /></button>
          <div className="qz-pills" role="group" aria-label="Questions">
            {data.items.map((x, k) => <button key={k} type="button" className={`qz-pill${k === i ? ' on' : ''}${stateOf(k)}`} aria-current={k === i ? 'true' : undefined} aria-label={`Question ${x.n}${isOk(x) ? ', done and right' : x.answer ? ', answered' : ''}`} onClick={() => go(k)}>{isOk(x) ? <UiIcon name="check" size={16} strokeWidth={4} /> : x.n}</button>)}
          </div>
          <button type="button" className="qz-arw" aria-label="Next" title="Next" disabled={i === total - 1} onClick={() => go(i + 1)}><UiIcon name="arrow" size={15} strokeWidth={3.6} /></button>
        </div>
      )}
      <article key={i} className={`qz-c${done ? ' isdone' : ''}${dir ? ` in-${dir}` : ''}`}>
        <div className="qz-t">
          <span className={`qz-n d${isOk(it) ? ' got' : ''}`} role={isOk(it) ? 'img' : undefined} aria-label={isOk(it) ? `Question ${it.n}, done and right` : undefined}>{isOk(it) ? <UiIcon name="check" size={16} strokeWidth={4} /> : it.n}</span>
          <div className="qz-q tx"><Inline text={it.q} /></div>
          {done && !isOk(it) && <span className="qz-done d"><UiIcon name="check" size={13} strokeWidth={3.6} />Done</span>}
        </div>
        {it.options.length > 0 && <div className="qz-o">{it.options.map((o) => <span key={o} className={`qz-p${it.answer && o.trim().toLowerCase() === it.answer.trim().toLowerCase() ? ' right' : ''}`}><Inline text={o} /></span>)}</div>}
        {has(s.wrong, it.n) && <div className="qz-r hmm tx"><b className="d">Second try</b><div>Sorry, I got that one wrong. I have asked Coe to work it out again, and it is free.</div></div>}
        {it.answer && <div className="qz-r good"><b className="d">Answer{it.unsure ? ' · not sure' : ''}</b><div className="qz-a tx"><Inline text={it.answer} /></div></div>}
        <div className="qz-act">
          {live && !done && <button type="button" className="btn small" onClick={() => { save({ ...s, done: [...s.done, it.n] }); go(i + 1); }}>I did it</button>}
          {(why || live) && <button type="button" className={`btn small${has(s.right, it.n) && !shown ? ' gold' : ''}`} aria-pressed={shown} onClick={() => { if (why) setHow(shown ? how.filter((x) => x !== it.n) : [...how, it.n]); else ask?.(`How did you get the answer to question ${it.n} (${it.q.slice(0, 80)})? Explain it step by step.`); }}>{shown ? 'Hide how' : 'How I got it'}</button>}
        </div>
        {why && shown && <div className="qz-r"><b className="d">How I got it</b><div className="qz-w tx"><Inline text={why} /></div></div>}
        {live && done && (
          <div className="qz-v tx">
            {has(s.right, it.n) ? <span className="qz-ok"><UiIcon name="check" size={13} strokeWidth={3.6} /> Marked right</span> : <>
              <span>Was it right?</span>
              <button type="button" className="btn small" onClick={() => save({ ...s, right: [...s.right, it.n] })}>Right</button>
              <button type="button" className="btn small" title="Coe says sorry and works it out again, for free" onClick={() => { save({ ...s, done: s.done.filter((x) => x !== it.n), wrong: [...s.wrong, it.n] }); redo?.(`The student says question ${it.n} ("${it.q.slice(0, 80)}") was marked wrong. Work that one out again, look for the mistake, and show how you get the answer.`); }}>Wrong</button>
            </>}
          </div>
        )}
      </article>
    </section>
  );
}
