'use client';
/**
 * The progress panel: opens from the step counter in the top bar. Three parts, like the ones in Claude:
 * the steps (a rail with a dot for each), what was made (documents, pictures, project files), and what was used.
 */
import { useEffect, useMemo, useRef } from 'react';
import { UiIcon, type UiName } from '@/ui/icons';
import { dataUrl, type Conv, type Img } from './store';
import { KINDS } from '@/lib/coe/editors';
import { madePictures, usedIn, type Info } from '@/lib/coe/progress';
import { piecesOf } from './Gallery';

const ICON: Record<string, UiName> = { upload: 'attach', web: 'globe', cmd: 'code', read: 'file', make: 'folder', edit: 'edit', shot: 'camera', pic: 'image', app: 'apps', place: 'pin', note: 'bookmark' };

export function Progress({ info, conv, busy, onClose, onDoc, onFiles, onZoom, onGallery }: {
  info: Info | null; conv: Conv; busy: boolean; onClose: () => void;
  onDoc: (id: string) => void; onFiles: () => void; onZoom: (img: Img) => void; onGallery: () => void;
}) {
  const root = useRef<HTMLElement>(null), now = useRef<HTMLLIElement>(null);
  const used = useMemo(() => usedIn(conv.messages), [conv.messages]);
  const pics = useMemo(() => madePictures(conv), [conv]);
  const pieces = useMemo(() => piecesOf(conv).length, [conv]);
  const docs = conv.docs ?? [], nFiles = Object.keys(conv.files ?? {}).length;
  useEffect(() => { root.current?.querySelector<HTMLElement>('.pg-x')?.focus({ preventScroll: true }); }, []);
  useEffect(() => { now.current?.scrollIntoView({ block: 'nearest' }); }, [info?.now, info?.steps.length]);

  type Row = { id: string; text: string; st: 'done' | 'now' | 'next' | 'bad'; detail?: string };
  const rows: Row[] = info?.plan
    ? info.plan.steps.map((t, i) => ({ id: 'p' + i, text: t, st: i < info.plan!.done ? 'done' : i === info.plan!.done && !info.finished ? 'now' : 'next' }))
    : (info?.steps ?? []).map((s): Row => ({ id: s.id, text: s.status === 'running' ? s.now : s.done, st: s.status === 'error' ? 'bad' : s.status === 'running' || s.status === 'pending' ? 'now' : 'done', detail: s.detail }));
  const hasOut = docs.length > 0 || pics.length > 0 || nFiles > 0 || pieces > 0;

  return (
    <aside ref={root} className="cx-prog" role="dialog" aria-label="Progress" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
      <header className="pg-h">
        <b className="d">Progress</b>
        {info && <span className="pg-n tx">{info.label}</span>}
        <span className="cx-grow" />
        <button type="button" className="pg-x" onClick={onClose} aria-label="Close progress" title="Close"><UiIcon name="close" size={18} /></button>
      </header>
      <div className="pg-scroll">
        {rows.length > 0 ? (
          <ol className={`pg-rail${busy ? ' live' : ''}`}>
            {rows.map((r) => (
              <li key={r.id} ref={r.st === 'now' ? now : undefined} className={`pg-s ${r.st}`} aria-current={r.st === 'now' ? 'step' : undefined}>
                <i className="pg-dot" aria-hidden>{r.st === 'done' ? <UiIcon name="check" size={10} strokeWidth={4} /> : r.st === 'bad' ? '!' : null}</i>
                <span className="pg-t">{r.text}{r.detail ? <small className="tx">{r.detail}</small> : null}</span>
              </li>
            ))}
          </ol>
        ) : <p className="pg-empty tx">Steps show here when Coe works on something bigger.</p>}

        {hasOut && (
          <section className="pg-sec" aria-label="Outputs">
            <h3 className="d">Outputs</h3>
            {docs.map((d) => (
              <button key={d.id} type="button" className="pg-row" onClick={() => onDoc(d.id)}><UiIcon name={KINDS[d.kind].icon} size={18} /><span className="pg-rt">{d.title || KINDS[d.kind].name}</span><i className="tx">{KINDS[d.kind].name}</i></button>
            ))}
            {nFiles > 0 && <button type="button" className="pg-row" onClick={onFiles}><UiIcon name="folder" size={18} /><span className="pg-rt">Project folder</span><i className="tx">{nFiles} {nFiles === 1 ? 'file' : 'files'}</i></button>}
            {pieces > 0 && <button type="button" className="pg-row" onClick={onGallery}><UiIcon name="layers" size={18} /><span className="pg-rt">Made in this chat</span><i className="tx">{pieces}</i></button>}
            {pics.length > 0 && (
              <div className="pg-pics">{pics.slice(-6).map((im, k) => (
                <button key={k} type="button" className="pg-pic" onClick={() => onZoom(im)} aria-label={`Look closer: ${im.name}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={dataUrl(im)} alt={im.name} /></button>
              ))}</div>
            )}
          </section>
        )}

        {used.length > 0 && (
          <section className="pg-sec" aria-label="Used in this chat">
            <h3 className="d">Used in this chat</h3>
            {used.map((u) => <div key={u.cat} className="pg-row static"><UiIcon name={ICON[u.cat] ?? 'sparkle'} size={18} /><span className="pg-rt">{u.label}</span><i className="tx">{u.note}</i></div>)}
          </section>
        )}
      </div>
    </aside>
  );
}
