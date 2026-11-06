'use client';
/** A ```slides block: a deck you can flip through, present full screen, and save as a PowerPoint file. */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UiIcon } from '@/ui/icons';
import { downloadBlob } from '@/ui/copy';
import { Inline, Shell, json } from './Study';
import { PAIRS, deckToPptx, pairFor, plain } from './pptx';

export interface Side { heading?: string; bullets?: string[] }
export interface Slide { layout?: 'title' | 'bullets' | 'two' | 'big' | 'quote'; title?: string; subtitle?: string; bullets?: string[]; text?: string; by?: string; left?: Side; right?: Side; notes?: string }
export interface Deck { title?: string; theme?: 'blocks' | 'cream' | 'ink' | 'gold' | 'green'; slides: Slide[] }

const W = 1280, H = 720;
/** How much to shrink the 1280 x 720 slide to fit the box it is in. The box is found when it appears, so it works for a box that is drawn late. */
function useFit(): [number, (el: HTMLElement | null) => void] {
  const [k, setK] = useState(0.3);
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const f = () => { const w = el.clientWidth, h = el.clientHeight; if (w) setK(h ? Math.min(w / W, h / H) : w / W); };
    f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect();
  }, [el]);
  return [k, setEl];
}

/** A small picture of one slide that fits whatever width it is given. */
function Thumb({ deck, i }: { deck: Deck; i: number }) {
  const [k, ref] = useFit();
  return <span className="sl-thf" ref={ref}><SlideView deck={deck} i={i} k={k} /></span>;
}

function layoutOf(s: Slide, i: number): NonNullable<Slide['layout']> {
  return s.layout ?? (i === 0 && !s.bullets?.length ? 'title' : s.bullets?.length ? 'bullets' : s.left || s.right ? 'two' : s.text ? 'quote' : 'bullets');
}
const sizeFor = (n: number, chars: number) => (n <= 3 && chars < 140 ? 46 : n <= 5 && chars < 260 ? 40 : n <= 7 ? 34 : 28);

export function SlideView({ deck, i, k }: { deck: Deck; i: number; k: number }) {
  const s = deck.slides[i], c = pairFor(deck, i), lay = layoutOf(s, i);
  const style = { '--sb': '#' + c.bg, '--sf': '#' + c.fg, '--sa': '#' + c.ac, transform: `scale(${k})` } as React.CSSProperties;
  const bullets = (s.bullets ?? []).slice(0, 9), chars = bullets.join('').length;
  return (
    <div className={`sl sl-lay-${lay}`} style={style}>
      <i className="sl-bar" />
      {lay === 'title' && <><h2 className="sl-h d">{s.title}</h2><i className="sl-rule" />{s.subtitle && <p className="sl-sub"><Inline text={s.subtitle} /></p>}<i className="sl-block" /></>}
      {lay === 'big' && <><h2 className="sl-big d">{s.title}</h2>{s.subtitle && <p className="sl-sub"><Inline text={s.subtitle} /></p>}</>}
      {lay === 'quote' && <><i className="sl-q d">“</i><p className="sl-quote"><Inline text={s.text ?? s.title ?? ''} /></p>{(s.by || (s.text && s.title)) && <p className="sl-by d">{s.by ?? s.title}</p>}</>}
      {lay === 'two' && <><h2 className="sl-t d">{s.title}</h2><div className="sl-cols">{[s.left, s.right].map((side, n) => side && <div key={n} className="sl-col">{side.heading && <h3 className="sl-ch d">{side.heading}</h3>}<ul style={{ fontSize: 34 }}>{(side.bullets ?? []).slice(0, 6).map((b, j) => <li key={j}><Inline text={b} /></li>)}</ul></div>)}</div></>}
      {lay === 'bullets' && <><h2 className="sl-t d">{s.title}</h2>{bullets.length ? <ul className="sl-ul" style={{ fontSize: sizeFor(bullets.length, chars) }}>{bullets.map((b, j) => <li key={j}><Inline text={b} /></li>)}</ul> : s.text ? <p className="sl-quote plain"><Inline text={s.text} /></p> : null}</>}
      <p className="sl-foot">{plain(deck.title)}<span>{i + 1} / {deck.slides.length}</span></p>
    </div>
  );
}

function Present({ deck, start, onClose }: { deck: Deck; start: number; onClose: () => void }) {
  const [i, setI] = useState(start), [notes, setNotes] = useState(false), [still, setStill] = useState(false);
  const [k, fit] = useFit();
  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(deck.slides.length - 1, x + d))), [deck.slides.length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') setI(0); else if (e.key === 'End') setI(deck.slides.length - 1);
      else if (e.key.toLowerCase() === 'n') setNotes((v) => !v);
      else if (e.key.toLowerCase() === 'f') { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); }
    };
    window.addEventListener('keydown', key, true);
    try { void document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* not allowed here */ }
    const hide = window.setTimeout(() => setStill(true), 2500);
    return () => { window.removeEventListener('keydown', key, true); window.clearTimeout(hide); try { if (document.fullscreenElement) void document.exitFullscreen(); } catch { /* already out */ } };
  }, [go, onClose, deck.slides.length]);
  const s = deck.slides[i];
  return createPortal(
    <div className={`sl-present${still ? ' still' : ''}`} role="dialog" aria-label="Presenting" aria-modal="true" onPointerMove={() => { setStill(false); }}>
      <div className="sl-pbox" ref={fit} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); go(e.clientX - r.left < r.width * 0.3 ? -1 : 1); }}>
        <div className="sl-pfit" style={{ width: W * k, height: H * k }}><SlideView deck={deck} i={i} k={k} /></div>
      </div>
      {notes && <div className="sl-pnotes tx">{s.notes ? plain(s.notes) : 'No notes for this slide.'}</div>}
      <div className="sl-pbar"><button type="button" className="sl-pb" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide"><UiIcon name="left" size={20} /></button>
        <span className="d">{i + 1} / {deck.slides.length}</span>
        <button type="button" className="sl-pb" onClick={() => go(1)} disabled={i === deck.slides.length - 1} aria-label="Next slide"><UiIcon name="right" size={20} /></button>
        <span className="cx-grow" /><span className="tx sl-phint">Arrows or click to move. N for notes. F for full screen. Esc to leave.</span>
        <button type="button" className="sl-pb" onClick={onClose}><UiIcon name="close" size={18} /><span className="d">Leave</span></button></div>
    </div>, document.body);
}

export const SlidesBlock = memo(function SlidesBlock({ code, closed }: { code: string; closed: boolean }) {
  const deck = useMemo<Deck | null>(() => {
    if (!closed) return null;
    const d = json<Deck>(code); if (!d || !Array.isArray(d.slides)) return null;
    const slides = d.slides.filter((s) => s && typeof s === 'object').slice(0, 40);
    return slides.length ? { ...d, slides } : null;
  }, [code, closed]);
  const [i, setI] = useState(0), [show, setShow] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  const thumbs = useRef<HTMLDivElement>(null);
  const [k, fit] = useFit();
  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min((deck?.slides.length ?? 1) - 1, x + d))), [deck]);
  useEffect(() => { thumbs.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [i]);
  if (!closed) return <Shell icon="deck" name="Slides" closed={false}><p className="tx cx-pv-wait">Making the slides…</p></Shell>;
  if (!deck) return <Shell icon="deck" name="Slides" closed><p className="cx-pv-err tx">Those slides could not be read.</p><pre className="cx-pv-code"><code>{code}</code></pre></Shell>;
  const s = deck.slides[Math.min(i, deck.slides.length - 1)], title = plain(deck.title) || 'Slides';
  const save = async () => { setBusy(true); setMsg(''); try { downloadBlob(`${title.replace(/[^\w -]+/g, '').trim().slice(0, 40) || 'slides'}.pptx`, await deckToPptx(deck)); } catch (e) { console.warn('pptx', e); setMsg('The file could not be made.'); } finally { setBusy(false); } };
  const outline = () => deck.slides.map((x, n) => `${n + 1}. ${plain(x.title ?? x.text ?? '')}\n${(x.bullets ?? []).map((b) => `   - ${plain(b)}`).join('\n')}`).join('\n').trim();
  return (
    <Shell icon="deck" name={`Slides: ${title}`} closed cls="slides"
      foot={<>
        <button type="button" className="cx-act" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide"><UiIcon name="left" size={14} />Back</button>
        <span className="tx cx-st-hint">Slide {i + 1} of {deck.slides.length}</span>
        <button type="button" className="cx-act" onClick={() => go(1)} disabled={i >= deck.slides.length - 1} aria-label="Next slide">Next<UiIcon name="right" size={14} /></button>
        <span className="cx-grow" />
        <button type="button" className="cx-act" onClick={() => navigator.clipboard?.writeText(outline()).then(() => setMsg('Outline copied.'), () => setMsg('Could not copy.'))}><UiIcon name="copy" size={14} />Outline</button>
        <button type="button" className="cx-act" disabled={busy} onClick={() => void save()}><UiIcon name="download" size={14} />{busy ? 'Making…' : 'Save .pptx'}</button>
        <button type="button" className="cx-act sl-go" onClick={() => setShow(true)}><UiIcon name="play" size={14} />Present</button>
      </>}>
      <div className="sl-wrap">
        <div className="sl-frame" ref={fit} tabIndex={0} aria-label={`Slide ${i + 1}`} onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } }}><SlideView deck={deck} i={Math.min(i, deck.slides.length - 1)} k={k} /></div>
        {msg && <p className="tx cx-st-hint sl-msg" role="status">{msg}</p>}
        {s.notes && <p className="sl-notes tx"><b className="d">Notes</b> {plain(s.notes)}</p>}
        <div className="sl-thumbs" ref={thumbs} role="tablist" aria-label="Slides">
          {deck.slides.map((_, n) => (
            <button key={n} type="button" role="tab" className={`sl-th${n === i ? ' on' : ''}`} aria-current={n === i ? 'true' : undefined} aria-selected={n === i} aria-label={`Slide ${n + 1}`} onClick={() => setI(n)}>
              <Thumb deck={deck} i={n} />
            </button>
          ))}
        </div>
      </div>
      {show && <Present deck={deck} start={i} onClose={() => setShow(false)} />}
    </Shell>
  );
});
