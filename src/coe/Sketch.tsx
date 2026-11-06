'use client';
/** A drawing pad: sketch a diagram, a maths problem or a screen layout, and send it to Coe as a picture. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { Modal } from './Panels';

const INKS = [{ n: 'Black', c: '#171717' }, { n: 'Green', c: '#337957' }, { n: 'Red', c: '#B4503F' }, { n: 'Blue', c: '#2F5D8A' }, { n: 'Gold', c: '#B49A57' }];
const SIZES = [{ n: 'Fine', w: 3 }, { n: 'Medium', w: 7 }, { n: 'Thick', w: 16 }];
const W = 1200, H = 800;

export function Sketch({ onDone, onClose }: { onDone: (f: File) => void; onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [ink, setInk] = useState(INKS[0].c), [size, setSize] = useState(SIZES[1].w), [erase, setErase] = useState(false);
  const [undo, setUndo] = useState(0), [blank, setBlank] = useState(true);
  const stack = useRef<ImageData[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);

  const paper = useCallback(() => { const c = cv.current!.getContext('2d')!; c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, H); }, []);
  useEffect(() => { paper(); }, [paper]);

  const at = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const snap = () => { const c = cv.current!.getContext('2d')!; stack.current.push(c.getImageData(0, 0, W, H)); if (stack.current.length > 25) stack.current.shift(); setUndo(stack.current.length); };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); cv.current!.setPointerCapture(e.pointerId); snap();
    const p = at(e); last.current = p; dot(p.x, p.y, e.pressure);
  };
  const dot = (x: number, y: number, pr = 0.5) => { const c = cv.current!.getContext('2d')!; c.fillStyle = erase ? '#FFFFFF' : ink; const w = (erase ? size * 2.4 : size) * (pr > 0 && pr !== 0.5 ? 0.6 + pr * 0.8 : 1); c.beginPath(); c.arc(x, y, w / 2, 0, Math.PI * 2); c.fill(); setBlank(false); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const c = cv.current!.getContext('2d')!, p = at(e), l = last.current;
    c.strokeStyle = erase ? '#FFFFFF' : ink; c.lineWidth = (erase ? size * 2.4 : size) * (e.pressure > 0 && e.pressure !== 0.5 ? 0.6 + e.pressure * 0.8 : 1); c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(p.x, p.y); c.stroke(); last.current = p;
  };
  const up = () => { last.current = null; };
  const back = () => { const s = stack.current.pop(); if (!s) return; cv.current!.getContext('2d')!.putImageData(s, 0, 0); setUndo(stack.current.length); if (!stack.current.length) setBlank(true); };
  const clear = () => { snap(); paper(); setBlank(true); };
  const done = () => { cv.current!.toBlob((b) => { if (b) { onDone(new File([b], `sketch-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, { type: 'image/png' })); onClose(); } }, 'image/png'); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); back(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  return (
    <Modal title="Sketch" onClose={onClose} wide>
      <div className="sk">
        <div className="sk-tools" role="toolbar" aria-label="Drawing tools">
          <div className="sk-grp" role="group" aria-label="Colour">{INKS.map((i) => <button key={i.c} type="button" className={`sk-ink${!erase && ink === i.c ? ' on' : ''}`} style={{ background: i.c }} aria-label={i.n} aria-pressed={!erase && ink === i.c} onClick={() => { setInk(i.c); setErase(false); }} />)}</div>
          <div className="sk-grp" role="group" aria-label="Thickness">{SIZES.map((s) => <button key={s.w} type="button" className={`sk-size${size === s.w ? ' on' : ''}`} aria-label={s.n} aria-pressed={size === s.w} onClick={() => setSize(s.w)}><i style={{ width: Math.min(22, s.w + 4), height: Math.min(22, s.w + 4) }} /></button>)}</div>
          <button type="button" className={`btn small${erase ? ' gold' : ''}`} aria-pressed={erase} onClick={() => setErase((v) => !v)}>Rubber</button>
          <span className="cx-grow" />
          <button type="button" className="btn small" onClick={back} disabled={!undo}><UiIcon name="left" size={14} />Undo</button>
          <button type="button" className="btn small" onClick={clear} disabled={blank}><UiIcon name="trash" size={14} />Clear</button>
        </div>
        <canvas ref={cv} width={W} height={H} className="sk-cv" aria-label="Drawing area" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        <p className="tx sk-tip">Draw a diagram, a maths problem or a screen layout. Then ask Coe to explain it, solve it or build it.</p>
        <div className="cap-bar"><span className="cx-grow" /><button type="button" className="btn small" onClick={onClose}>Cancel</button><button type="button" className="btn gold" disabled={blank} onClick={done}><UiIcon name="send" size={16} />Add to message</button></div>
      </div>
    </Modal>
  );
}
