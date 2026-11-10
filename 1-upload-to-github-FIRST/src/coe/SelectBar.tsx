'use client';
/** Select words in one of Coe's answers and a small bar appears: explain it, say it simpler, see an example, be quizzed on it, or ask about it. */
import { useEffect, useState } from 'react';
import { UiIcon } from '@/ui/icons';

type Pick = { x: number; y: number; text: string };
const OWN = 'li.cx-msg.assistant';

export function SelectBar({ onAsk, onQuote }: { onAsk: (text: string) => void; onQuote: (quote: string) => void }) {
  const [p, setP] = useState<Pick | null>(null);
  useEffect(() => {
    let t = 0;
    const within = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest(OWN) ?? null;
    const check = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const s = window.getSelection();
        if (!s || s.isCollapsed || !s.rangeCount) { setP(null); return; }
        const a = within(s.anchorNode);
        if (!a || a !== within(s.focusNode)) { setP(null); return; }
        const text = s.toString().replace(/\s+/g, ' ').trim();
        if (text.length < 3 || text.length > 1200) { setP(null); return; }
        const r = s.getRangeAt(0).getBoundingClientRect();
        if (!r.width && !r.height) { setP(null); return; }
        const touch = window.matchMedia?.('(pointer: coarse)').matches;   // a phone puts its own menu above the words
        setP({ x: Math.min(window.innerWidth - 150, Math.max(150, r.left + r.width / 2)), y: touch ? r.bottom + 12 : Math.max(58, r.top - 10), text });
      }, 140);
    };
    const hide = () => setP(null);
    document.addEventListener('selectionchange', check);
    window.addEventListener('scroll', hide, true);
    return () => { window.clearTimeout(t); document.removeEventListener('selectionchange', check); window.removeEventListener('scroll', hide, true); };
  }, []);
  if (!p) return null;
  const done = () => { try { window.getSelection()?.removeAllRanges(); } catch { /* none */ } setP(null); };
  const go = (prefix: string) => { onAsk(`${prefix} "${p.text}"`); done(); };
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const B = ({ icon, label, run }: { icon: Parameters<typeof UiIcon>[0]['name']; label: string; run: () => void }) => (
    <button type="button" className="selbar-b" onPointerDown={(e) => e.preventDefault()} onClick={run}><UiIcon name={icon} size={15} /><span>{label}</span></button>
  );
  return (
    <div className="selbar" role="toolbar" aria-label="Ask about the selected words" style={{ left: p.x, top: p.y, transform: touch ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }}>
      <B icon="graduate" label="Explain" run={() => go('Explain this part of your answer more clearly:')} />
      <B icon="wand" label="Simpler" run={() => go('Say this part again in simpler words:')} />
      <B icon="sigma" label="Example" run={() => go('Give me a worked example of this:')} />
      <B icon="cards" label="Quiz me" run={() => go('Quiz me with one question about this part, then mark my answer:')} />
      <B icon="chat" label="Ask…" run={() => { onQuote(p.text); done(); }} />
    </div>
  );
}
