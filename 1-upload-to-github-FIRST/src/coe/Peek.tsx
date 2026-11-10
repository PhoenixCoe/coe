'use client';
/**
 * Files you add, as small cards that show what is inside (the kind, and the first words), and a window to read the rest.
 * Pictures already open big; this is for documents, tables, notes and the like.
 */
import { useMemo } from 'react';
import { UiIcon } from '@/ui/icons';
import { Modal } from './Panels';
import type { Attach } from './store';

const ext = (n: string) => (/\.([a-z0-9]{1,5})$/i.exec(n)?.[1] ?? '').toUpperCase();
const first = (t: string, n = 120) => t.replace(/\s+/g, ' ').trim().slice(0, n);

/** A file as a card. Press it to read it. */
export function AttCard({ a, onOpen, onRemove }: { a: Attach; onOpen: () => void; onRemove?: () => void }) {
  const e = ext(a.name) || 'FILE';
  return (
    <span className="att-c">
      <button type="button" className="att-b" onClick={onOpen} aria-label={`Preview ${a.name}`} title="Preview">
        <span className="att-pg" aria-hidden><b className="d">{e}</b><span className="tx">{first(a.text) || 'Nothing to read in it'}</span></span>
        <span className="att-n"><b>{a.name}</b><i className="tx">{a.kind}{a.cut ? ', cut short' : ''}</i></span>
      </button>
      {onRemove && <button type="button" className="att-x" aria-label={`Remove ${a.name}`} onClick={onRemove}><UiIcon name="close" size={12} /></button>}
    </span>
  );
}

/** A tiny, safe table reader: commas or tabs, quotes kept together. */
function rowsOf(text: string, tab: boolean): string[][] {
  return text.split(/\r?\n/).slice(0, 41).filter((l) => l.length).map((l) => {
    const out: string[] = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === (tab ? '\t' : ',') && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out;
  });
}

const SHOW = 8000;

/** The inside of a file. */
export function AttPeek({ a, onClose }: { a: Attach; onClose: () => void }) {
  const table = /\.(csv|tsv)$/i.test(a.name);
  const rows = useMemo(() => (table ? rowsOf(a.text, /\.tsv$/i.test(a.name)) : []), [a.text, a.name, table]);
  const more = a.text.length > SHOW;
  return (
    <Modal title={a.name} onClose={onClose} wide>
      <div className="att-peek">
        <p className="att-meta tx"><UiIcon name="file" size={15} />{a.kind}{a.chars ? ` · ${a.chars.toLocaleString()} letters` : ''}</p>
        {table && rows.length > 0 ? (
          <div className="att-tbl"><table><tbody>{rows.map((r, i) => <tr key={i}>{r.slice(0, 12).map((c, k) => (i === 0 ? <th key={k}>{c}</th> : <td key={k}>{c}</td>))}</tr>)}</tbody></table></div>
        ) : a.text.trim() ? (
          <pre className="att-pre tx">{a.text.slice(0, SHOW)}</pre>
        ) : <p className="tx">There are no words in this file that Coe could read.</p>}
        {(more || a.cut || table) && <p className="att-note tx">{table ? 'The first rows are shown. Coe has the whole table.' : a.cut ? 'The file was long, so Coe read the first part.' : 'The first part is shown. Coe has all of it.'}</p>}
        {a.note && <p className="att-note tx">{a.note}</p>}
      </div>
    </Modal>
  );
}
