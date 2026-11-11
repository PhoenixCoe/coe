'use client';
/** Everything Coe has made in this chat, as colour plates: pages, pictures, diagrams, quizzes, charts. Press one to jump to it. */
import { useMemo } from 'react';
import { UiIcon } from '@/ui/icons';
import { Modal } from './Panels';
import { splitBlocks } from './Blocks';
import { dataUrl, type Conv } from './store';

export interface Piece { key: string; msg: string; kind: string; title: string; icon: Parameters<typeof UiIcon>[0]['name']; img?: string }
const KIND: Record<string, { name: string; icon: Piece['icon'] }> = {
  html: { name: 'Page', icon: 'globe' }, svg: { name: 'Picture', icon: 'image' }, mermaid: { name: 'Diagram', icon: 'branch' }, graph: { name: 'Graph', icon: 'chart' }, plot: { name: 'Graph', icon: 'chart' },
  chart: { name: 'Chart', icon: 'chart' }, mindmap: { name: 'Mind map', icon: 'branch' }, quiz: { name: 'Quiz', icon: 'cards' }, flashcards: { name: 'Flash cards', icon: 'cards' }, cards: { name: 'Flash cards', icon: 'cards' },
  slides: { name: 'Slides', icon: 'deck' }, data: { name: 'Table', icon: 'table' },
};
const jsonTitle = (code: string) => { try { const j = JSON.parse(code); return typeof j?.title === 'string' ? j.title : ''; } catch { return ''; } };

function titleOf(lang: string, code: string): string {
  if (lang === 'html') return /<title[^>]*>([^<]{1,60})/i.exec(code)?.[1]?.trim() || /<h1[^>]*>([^<]{1,60})/i.exec(code)?.[1]?.trim() || '';
  if (lang === 'svg') return /<title[^>]*>([^<]{1,60})/i.exec(code)?.[1]?.trim() || '';
  if (lang === 'mindmap') return code.split('\n').find((l) => l.trim())?.trim().replace(/^([-*•+]|\d+[.)])\s+/, '').slice(0, 40) || '';
  if (lang === 'mermaid') return code.trim().split('\n')[0].replace(/\s+/g, ' ').slice(0, 40);
  if (lang === 'graph' || lang === 'plot') return /^title:\s*(.+)$/im.exec(code)?.[1]?.trim() || code.split('\n').find((l) => l.trim() && !/^\w+:/.test(l))?.trim().slice(0, 40) || '';
  return jsonTitle(code);
}

/** Every made thing in the chat, in order. */
export function piecesOf(conv: Conv): Piece[] {
  const out: Piece[] = [];
  for (const m of conv.messages) {
    if (m.role !== 'assistant' || m.hidden) continue;
    for (const s of splitBlocks(m.text)) {
      if (s.t !== 'block' || !s.closed) continue;
      const k = KIND[s.lang]; if (!k) continue;
      out.push({ key: `${m.id}:${s.lang}:${s.n}`, msg: m.id, kind: k.name, icon: k.icon, title: titleOf(s.lang, s.code) || k.name });
    }
    for (const r of m.runs ?? []) if (r.out?.kind === 'image') out.push({ key: `${m.id}:img:${r.id}`, msg: m.id, kind: 'Picture', icon: 'image', title: r.out.img.name || 'Picture', img: dataUrl(r.out.img) });
  }
  return out;
}

export function Gallery({ conv, onGo, onClose }: { conv: Conv; onGo: (msg: string) => void; onClose: () => void }) {
  const pieces = useMemo(() => piecesOf(conv), [conv]);
  return (
    <Modal title="Made in this chat" onClose={onClose} wide>
      {!pieces.length ? (
        <div className="gal-none"><p className="tx">Nothing made in this chat yet. Pages, games, diagrams, graphs, quizzes and pictures you ask for show up here.</p></div>
      ) : (
        <ul className="gal">
          {pieces.map((p, i) => (
            <li key={p.key}>
              <button type="button" className={`plate c${i % 5}`} onClick={() => { onGo(p.msg); onClose(); }}>
                {p.img ? <img className="gal-img" src={p.img} alt="" /> : <UiIcon name={p.icon} size={30} />}
                <span className="plate-k d">{p.kind}</span>
                <b className="plate-t d">{p.title}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
