'use client';
/**
 * A list of questions with their answers, the same cards Coe Mini shows on a page: ```questions {"title","items":[{"q","options","answer","working","sure"}]}
 * The website cannot type into another page, so the cards are for reading and ticking off. Press "I did it" and the question folds away with a tick and the word Done.
 * "Wrong" asks Coe to try again (a free redo, like the Redo button). "How I got it" shows the working, or asks Coe for it.
 */
import { useEffect, useMemo, useState } from 'react';
import { UiIcon } from '@/ui/icons';

type Item = { q: string; options: string[]; answer: string; working: string; unsure: boolean };
function parse(code: string): { title: string; items: Item[] } | null {
  try {
    const j = JSON.parse(code); const raw = Array.isArray(j) ? j : j?.items; if (!Array.isArray(raw)) return null;
    const items: Item[] = raw.slice(0, 40).map((r: Record<string, unknown>) => ({
      q: String(r.q ?? r.question ?? '').slice(0, 600), options: Array.isArray(r.options) ? (r.options as unknown[]).slice(0, 8).map((o) => String(o).slice(0, 120)) : [],
      answer: String(r.answer ?? '').slice(0, 400), working: String(r.working ?? '').slice(0, 900), unsure: /^l/i.test(String(r.sure ?? '')),
    })).filter((i: Item) => i.q);
    return items.length ? { title: String(j?.title ?? '').slice(0, 90), items } : null;
  } catch { return null; }
}
type Saved = { done: number[]; right: number[]; fold: number[]; wrong: number[] };
const keyOf = (id: string) => `pmc:coe:qz:${id}`;
const load = (id: string): Saved => { try { const j = JSON.parse(localStorage.getItem(keyOf(id)) || 'null'); if (j && Array.isArray(j.done)) return { done: j.done, right: j.right ?? [], fold: j.fold ?? [], wrong: j.wrong ?? [] }; } catch { /* storage blocked */ } return { done: [], right: [], fold: [], wrong: [] }; };
const has = (a: number[], n: number) => a.includes(n);
const flip = (a: number[], n: number) => (a.includes(n) ? a.filter((x) => x !== n) : [...a, n]);

export function QuestionsBlock({ code, closed, id, ask, redo }: { code: string; closed: boolean; id: string; ask?: (text: string) => void; redo?: (note?: string) => void }) {
  const data = useMemo(() => (closed ? parse(code) : null), [code, closed]);
  const [s, setS] = useState<Saved>({ done: [], right: [], fold: [], wrong: [] });
  const [how, setHow] = useState<number[]>([]);
  useEffect(() => { setS(load(id)); }, [id]);
  const save = (n: Saved) => { setS(n); try { localStorage.setItem(keyOf(id), JSON.stringify(n)); } catch { /* storage blocked */ } };
  if (!closed) return <div className="qz-wait tx" role="status"><span className="dots"><i /><i /><i /></span>Setting out the questions…</div>;
  if (!data) return null;
  const live = !!ask;   // on a shared page it is only for reading
  const allFolded = data.items.every((_, i) => has(s.fold, i));
  return (
    <section className="qz" aria-label="Questions">
      <header className="qz-h">
        <b className="d">{data.items.length} question{data.items.length === 1 ? '' : 's'}</b>{data.title && <span className="qz-k d">{data.title}</span>}<span className="grow" />
        {data.items.length > 1 && <button type="button" className="btn small" onClick={() => save({ ...s, fold: allFolded ? [] : data.items.map((_, i) => i) })}>{allFolded ? 'Open all' : 'Fold all'}</button>}
      </header>
      {data.items.map((it, i) => {
        const done = has(s.done, i), folded = has(s.fold, i), shown = has(how, i);
        return (
          <article key={i} className={`qz-c${folded ? ' folded' : ''}${done ? ' isdone' : ''}`}>
            <div className="qz-t">
              <span className="qz-n d">{i + 1}</span>
              <div className="qz-q tx">{folded && it.q.length > 90 ? it.q.slice(0, 90) + '…' : it.q}</div>
              {done && <span className="qz-done d"><UiIcon name="check" size={13} strokeWidth={3.6} />Done</span>}
              <button type="button" className="qz-fold" aria-expanded={!folded} aria-label={`${folded ? 'Show' : 'Hide'} question ${i + 1}`} title={`${folded ? 'Show' : 'Hide'} question ${i + 1}`} onClick={() => save({ ...s, fold: flip(s.fold, i) })}><UiIcon name="down" size={15} /></button>
            </div>
            {folded ? (it.answer && <div className="qz-sum tx"><b className="d">Answer</b> {it.answer.length > 90 ? it.answer.slice(0, 90) + '…' : it.answer}</div>) : (
              <>
                {it.options.length > 0 && <div className="qz-o">{it.options.map((o) => <span key={o} className={`qz-p${it.answer && o.trim().toLowerCase() === it.answer.trim().toLowerCase() ? ' right' : ''}`}>{o}</span>)}</div>}
                {has(s.wrong, i) && <div className="qz-r hmm tx"><b className="d">Second try</b><div>Sorry, I got that one wrong. I have asked Coe to work it out again, and it is free.</div></div>}
                {it.answer && <div className="qz-r good"><b className="d">Answer{it.unsure ? ' · not sure' : ''}</b><div className="qz-a tx">{it.answer}</div>{it.working && shown && <div className="qz-w tx">{it.working}</div>}</div>}
                <div className="qz-act">
                  {live && !done && <button type="button" className="btn small" onClick={() => save({ ...s, done: [...s.done, i], fold: [...s.fold, i] })}>I did it</button>}
                  {(it.working || live) && <button type="button" className={`btn small${has(s.right, i) && !shown ? ' gold' : ''}`} aria-pressed={shown} onClick={() => { if (it.working) setHow(flip(how, i)); else ask?.(`How did you get the answer to question ${i + 1} (${it.q.slice(0, 80)})? Explain it step by step.`); }}>How I got it</button>}
                </div>
                {live && done && (
                  <div className="qz-v tx">
                    {has(s.right, i) ? <span className="qz-ok"><UiIcon name="check" size={13} strokeWidth={3.6} /> Marked right</span> : <>
                      <span>Was it right?</span>
                      <button type="button" className="btn small" onClick={() => save({ ...s, right: [...s.right, i] })}>Right</button>
                      <button type="button" className="btn small" title="Coe says sorry and works it out again, for free" onClick={() => { save({ ...s, done: s.done.filter((x) => x !== i), fold: s.fold.filter((x) => x !== i), wrong: [...s.wrong, i] }); redo?.(`The student says question ${i + 1} ("${it.q.slice(0, 80)}") was marked wrong. Work that one out again, look for the mistake, and show how you get the answer.`); }}>Wrong</button>
                    </>}
                  </div>
                )}
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
