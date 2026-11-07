'use client';
/** The Study hub: your saved decks, a daily streak, and review sessions that bring each card back just before you would forget it. */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useBackClose } from './back';
import { UiIcon } from '@/ui/icons';
import { downloadText } from '@/ui/copy';
import { Inline } from './Study';
import { sfx } from '@/lib/coe/look';
import { loadSettings } from '@/lib/coe/settings';
import {
  addCards, deckStats, dueCards, exportStudy, grade, importStudy, lastDays, level, loadStudy, nextLabel, removeCard, removeDeck, renameDeck, reviewedToday, streak, subscribeStudy, today,
  type Card, type Deck, type Grade,
} from '@/lib/coe/study';

let version = 0;
subscribeStudy(() => { version++; });
const useStudy = () => useSyncExternalStore(subscribeStudy, () => version, () => 0);

const GRADES: { g: Grade; name: string; key: string }[] = [{ g: 0, name: 'Again', key: '1' }, { g: 1, name: 'Hard', key: '2' }, { g: 2, name: 'Good', key: '3' }, { g: 3, name: 'Easy', key: '4' }];

export function StudyHub({ onClose, onAsk, say }: { onClose: () => void; onAsk: (text: string) => void; say: (t: string) => void }) {
  useStudy();
  const [review, setReview] = useState<{ ids: string[]; title: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);   // deck id being added to, or 'new'
  const [menu, setMenu] = useState<string | null>(null);
  useBackClose(onClose);
  const [view, setView] = useState<string | null>(null);        // deck whose cards are being listed
  const s = loadStudy(), st = streak(), lv = level(s.xp), days = lastDays(14), maxDay = Math.max(1, ...days.map((d) => d.count));
  const totalDue = dueCards().length;

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !review) onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose, review]);

  const begin = (deck?: Deck, all = false) => {
    let cs = all && deck ? s.cards.filter((c) => c.deck === deck.id) : dueCards(deck?.id);
    if (!cs.length) { say(deck ? 'Nothing is due in this deck. Press All to go through it anyway.' : 'Nothing is due. Come back tomorrow, or add more cards.'); return; }
    cs = [...cs].sort(() => Math.random() - 0.5).slice(0, 60);
    setReview({ ids: cs.map((c) => c.id), title: deck?.name ?? 'Everything due' });
  };
  const importFile = async (f?: File) => { if (!f) return; try { const n = importStudy(await f.text()); say(n ? `Added ${n} cards.` : 'Nothing new in that file.'); } catch (e) { say((e as Error).message); } };

  if (review) return <Review ids={review.ids} title={review.title} onClose={() => setReview(null)} />;

  const deckCards = view ? s.cards.filter((c) => c.deck === view) : [];
  return (
    <div className="sh" role="dialog" aria-label="Study">
      <header className="sh-top">
        <button type="button" className="sh-b d sh-back" onClick={onClose}><UiIcon name="left" size={16} /><span>Back to chat</span></button>
        <b className="d sh-name"><UiIcon name="study" size={22} />Study</b>
        <span className="cx-grow" />
        <label className="sh-b d"><UiIcon name="download" size={16} /><span>Import</span><input type="file" accept="application/json,.json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <button type="button" className="sh-b d" onClick={() => { downloadText('coe-study.json', exportStudy(), 'application/json'); }} disabled={!s.cards.length}><UiIcon name="out" size={16} /><span>Export</span></button>
        </header>

      <div className="sh-body">
        <section className="sh-stats" aria-label="Your progress">
          <div className="sh-stat sh-streak"><UiIcon name="flame" size={34} /><div><b className="d sh-big">{st.days}</b><span className="tx">day streak{st.days > 0 && !st.today ? '. Review one card today to keep it' : ''}</span></div></div>
          <div className="sh-stat"><div><b className="d sh-big">{totalDue}</b><span className="tx">due now</span></div>{totalDue > 0 && <button type="button" className="btn small gold" onClick={() => begin()}>Study now</button>}</div>
          <div className="sh-stat"><div><b className="d sh-big">Level {lv.lv}</b><span className="tx">{lv.into} of {lv.span} points to the next</span><div className="sh-xp" aria-hidden><i style={{ width: `${Math.min(100, (lv.into / lv.span) * 100)}%` }} /></div></div></div>
          <div className="sh-stat sh-week" role="img" aria-label="Cards reviewed in the last 14 days">
            <div className="sh-bars">{days.map((d) => <i key={d.key} title={`${d.key}: ${d.count}`} style={{ height: `${Math.max(6, (d.count / maxDay) * 100)}%` }} className={d.count ? 'on' : ''} />)}</div>
            {(() => { const goal = loadSettings().goal, n = reviewedToday(), met = n >= goal; return (
              <div className={`sh-goal${met ? ' met' : ''}`}><div className="sh-goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(n, goal)} aria-label="Today's card goal"><i style={{ width: `${Math.min(100, (n / goal) * 100)}%` }} /></div>
                <span className="tx">{met ? <><UiIcon name="trophy" size={14} /> Goal met: {n} cards today</> : `${n} of ${goal} cards today`}</span></div>); })()}
          </div>
        </section>

        <div className="sh-row">
          <h2 className="d sh-h">Your decks</h2>
          <button type="button" className="btn small" onClick={() => setAdding('new')}><UiIcon name="plus" size={15} />New deck</button>
          <button type="button" className="btn small" onClick={() => { onAsk('Make flash cards (a flashcards block, about 12 cards) on: '); onClose(); }}><UiIcon name="sparkle" size={15} />Ask Coe for cards</button>
        </div>

        {!s.decks.length && !adding && (
          <div className="sh-empty"><b className="d">No decks yet</b><p className="tx">Ask Coe for flash cards or a quiz, then press <b>Save to Study</b> under it. Cards you miss come back soon. Cards you know come back later and later.</p>
            <button type="button" className="btn gold" onClick={() => { onAsk('Make flash cards (a flashcards block, about 12 cards) on: '); onClose(); }}>Make my first deck</button></div>
        )}

        <div className="sh-decks">
          {s.decks.map((d, i) => {
            const k = deckStats(d.id);
            return (
              <article key={d.id} className={`sh-deck c${i % 5}`}>
                <div className="sh-deck-top">
                  <h3 className="d">{d.name}</h3>
                  <button type="button" className="sh-more" aria-label={`Options for ${d.name}`} aria-expanded={menu === d.id} onClick={() => setMenu(menu === d.id ? null : d.id)}><UiIcon name="more" size={18} /></button>
                  {menu === d.id && (
                    <div className="cx-pop sh-menu" role="menu">
                      <button type="button" role="menuitem" className="cx-opt" onClick={() => { setMenu(null); setAdding(d.id); }}><UiIcon name="plus" size={15} />Add a card</button>
                      <button type="button" role="menuitem" className="cx-opt" onClick={() => { setMenu(null); setView(d.id); }}><UiIcon name="list" size={15} />See the cards</button>
                      <button type="button" role="menuitem" className="cx-opt" onClick={() => { setMenu(null); const n = window.prompt('Rename the deck', d.name); if (n) renameDeck(d.id, n); }}><UiIcon name="edit" size={15} />Rename</button>
                      <button type="button" role="menuitem" className="cx-opt danger" onClick={() => { setMenu(null); if (window.confirm(`Delete "${d.name}" and its ${k.total} cards?`)) removeDeck(d.id); }}><UiIcon name="trash" size={15} />Delete</button>
                    </div>
                  )}
                </div>
                <dl className="sh-nums"><div><dt className="tx">cards</dt><dd className="d">{k.total}</dd></div><div><dt className="tx">due</dt><dd className="d">{k.due}</dd></div><div><dt className="tx">known</dt><dd className="d">{k.known}</dd></div></dl>
                <div className="sh-deck-bar" aria-hidden><i style={{ width: `${k.total ? (k.known / k.total) * 100 : 0}%` }} /></div>
                <div className="sh-deck-acts"><button type="button" className="btn small" disabled={!k.due} onClick={() => begin(d)}>Study {k.due ? k.due : ''}</button><button type="button" className="btn small" onClick={() => begin(d, true)}>All</button></div>
              </article>
            );
          })}
        </div>

        {adding && <AddCard deck={adding === 'new' ? null : s.decks.find((d) => d.id === adding) ?? null} onDone={() => setAdding(null)} say={say} />}

        {view && (
          <section className="sh-list" aria-label="Cards in this deck">
            <div className="sh-row"><h2 className="d sh-h">{s.decks.find((d) => d.id === view)?.name}</h2><button type="button" className="btn small" onClick={() => setView(null)}>Hide</button></div>
            <ul>{deckCards.map((c) => (
              <li key={c.id}><div className="sh-q"><Inline text={c.front} /></div><div className="sh-a tx"><Inline text={c.back} /></div>
                <span className="tx sh-due">{c.reps === 0 ? 'new' : c.due <= today() ? 'due' : `in ${c.due - today()}d`}</span>
                <button type="button" className="sh-more" aria-label="Delete this card" onClick={() => removeCard(c.id)}><UiIcon name="trash" size={16} /></button></li>
            ))}</ul>
          </section>
        )}
      </div>
    </div>
  );
}

function AddCard({ deck, onDone, say }: { deck: Deck | null; onDone: () => void; say: (t: string) => void }) {
  const [name, setName] = useState(deck?.name ?? ''), [front, setFront] = useState(''), [back, setBack] = useState('');
  const save = () => { if (!name.trim() || !front.trim() || !back.trim()) { say('Fill in the deck name, the question and the answer.'); return; } addCards(name, [{ front, back }]); setFront(''); setBack(''); say('Card added.'); };
  return (
    <form className="sh-add" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label className="sh-f"><span className="d">Deck</span><input className="cx-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maths: algebra" disabled={!!deck} /></label>
      <label className="sh-f"><span className="d">Question</span><textarea className="cx-in" rows={2} value={front} onChange={(e) => setFront(e.target.value)} placeholder="What is the quadratic formula?" /></label>
      <label className="sh-f"><span className="d">Answer</span><textarea className="cx-in" rows={2} value={back} onChange={(e) => setBack(e.target.value)} placeholder="Maths works here: $x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$" /></label>
      <div className="sh-row"><button type="submit" className="btn gold small">Add card</button><button type="button" className="btn small" onClick={onDone}>Done</button></div>
    </form>
  );
}

// ================================================================ a review session
function Review({ ids, title, onClose }: { ids: string[]; title: string; onClose: () => void }) {
  const [queue, setQueue] = useState(ids), [shown, setShown] = useState(false), [done, setDone] = useState(0), [misses, setMisses] = useState(0), [xp0] = useState(() => loadStudy().xp), [again, setAgain] = useState<Record<string, number>>({});
  const s = loadStudy();
  const card: Card | undefined = s.cards.find((c) => c.id === queue[0]);
  const finished = !card;
  const flip = useCallback(() => setShown(true), []);
  const rate = useCallback((g: Grade) => {
    if (!card) return;
    grade(card.id, g); (g === 0 ? sfx.wrong : sfx.right)();
    setDone((n) => n + 1); if (g === 0) setMisses((n) => n + 1);
    setShown(false);
    setQueue((q) => { const rest = q.slice(1); if (g === 0 && (again[card.id] ?? 0) < 2) { setAgain((a) => ({ ...a, [card.id]: (a[card.id] ?? 0) + 1 })); return [...rest.slice(0, 4), card.id, ...rest.slice(4)]; } return rest; });
  }, [card, again]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea')) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (finished) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); flip(); }
      else if (shown && '1234'.includes(e.key) && e.key.length === 1) rate((Number(e.key) - 1) as Grade);
      else if (shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); rate(2); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [shown, finished, flip, rate, onClose]);
  const st = streak(), gained = loadStudy().xp - xp0;
  const total = ids.length, left = new Set(queue).size;

  return (
    <div className="sh rv" role="dialog" aria-label={`Reviewing ${title}`}>
      <header className="sh-top"><b className="d sh-name"><UiIcon name="study" size={22} />{title}</b><span className="cx-grow" /><span className="tx rv-count">{finished ? 'Finished' : `${left} left`}</span><button type="button" className="sh-b d" onClick={onClose}><UiIcon name="close" size={16} /><span>{finished ? 'Done' : 'Back to Study'}</span></button></header>
      <div className="rv-bar" aria-hidden><i style={{ width: `${Math.min(100, ((total - left) / total) * 100)}%` }} /></div>
      {finished ? (
        <div className="rv-end">
          <b className="d rv-big">Done</b>
          <ul className="rv-sum">
            <li><b className="d">{done}</b><span className="tx">cards reviewed</span></li>
            <li><b className="d">{done ? Math.round(((done - misses) / done) * 100) : 0}%</b><span className="tx">got it first time</span></li>
            <li><b className="d">+{gained}</b><span className="tx">points</span></li>
            <li><b className="d">{st.days}</b><span className="tx">day streak</span></li>
          </ul>
          <button type="button" className="btn gold" onClick={onClose}>Back to Study</button>
        </div>
      ) : (
        <div className="rv-main">
          <button type="button" className={`rv-card${shown ? ' back' : ''}`} onClick={() => (shown ? undefined : flip())} aria-live="polite">
            <span className="rv-side d">{shown ? 'Answer' : 'Question'}</span>
            <span className="rv-front"><Inline text={card!.front} block /></span>
            {shown && <span className="rv-answer"><Inline text={card!.back} block /></span>}
            {!shown && <span className="rv-hint tx">Tap, or press Space, to show the answer</span>}
          </button>
          {shown ? (
            <div className="rv-grades" role="group" aria-label="How well did you know it?">
              {GRADES.map((x) => <button key={x.g} type="button" className={`rv-g g${x.g}`} onClick={() => rate(x.g)}><b className="d">{x.name}</b><span className="tx">{nextLabel(card!, x.g)}<kbd>{x.key}</kbd></span></button>)}
            </div>
          ) : (
            <button type="button" className="btn gold rv-show" onClick={flip}>Show answer</button>
          )}
        </div>
      )}
    </div>
  );
}
