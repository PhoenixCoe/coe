'use client';
/** A ```data block: a table you can sort, filter, total up, save as CSV, or ask Coe to chart. */
import { memo, useMemo, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { downloadText } from '@/ui/copy';
import { Shell, json } from './Study';

interface Table { title?: string; columns: string[]; rows: (string | number | null)[][] }

/** CSV that copes with quotes and commas inside quotes. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = '', q = false;
  const sep = (text.split('\n')[0].match(/\t/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? '\t' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim() !== '')) out.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim() !== '')) out.push(row);
  return out;
}
const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const num = (v: unknown): number | null => { if (typeof v === 'number') return Number.isFinite(v) ? v : null; if (typeof v !== 'string') return null; const t = v.replace(/[£$€,%\s]/g, ''); return t !== '' && /^-?\d*\.?\d+(e-?\d+)?$/i.test(t) ? Number(t) : null; };
const fmt = (n: number) => (Math.abs(n) >= 1e6 || (Math.abs(n) < 1e-3 && n !== 0) ? n.toExponential(2) : String(+n.toPrecision(6)));

function read(code: string): Table | null {
  const j = json<Partial<Table> & { data?: unknown }>(code);
  if (j && Array.isArray(j.columns) && Array.isArray(j.rows)) return { title: j.title, columns: j.columns.map(String), rows: j.rows.filter(Array.isArray).slice(0, 2000) as Table['rows'] };
  if (j && Array.isArray(j.rows) && j.rows.length && typeof j.rows[0] === 'object' && !Array.isArray(j.rows[0])) {   // rows as objects
    const cols = Object.keys(j.rows[0] as object); return { title: j.title, columns: cols, rows: (j.rows as unknown as Record<string, string | number | null>[]).slice(0, 2000).map((r) => cols.map((c) => r[c] ?? null)) };
  }
  const grid = parseCsv(code.trim()); if (grid.length < 2) return null;
  return { columns: grid[0].map((c) => c.trim()), rows: grid.slice(1, 2001).map((r) => grid[0].map((_, k) => r[k] ?? '')) };
}

export const DataBlock = memo(function DataBlock({ code, closed, ask }: { code: string; closed: boolean; ask?: (t: string) => void }) {
  const t = useMemo(() => (closed ? read(code) : null), [code, closed]);
  const [sort, setSort] = useState<{ c: number; dir: 1 | -1 } | null>(null), [q, setQ] = useState(''), [all, setAll] = useState(false), [totals, setTotals] = useState(false);
  const rows = useMemo(() => {
    if (!t) return [];
    let r = t.rows; const w = q.trim().toLowerCase();
    if (w) r = r.filter((row) => row.some((c) => String(c ?? '').toLowerCase().includes(w)));
    if (sort) r = [...r].sort((a, b) => { const x = a[sort.c], y = b[sort.c], nx = num(x), ny = num(y); const d = nx != null && ny != null ? nx - ny : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true, sensitivity: 'base' }); return d * sort.dir; });
    return r;
  }, [t, q, sort]);
  if (!closed) return <Shell icon="table" name="Table" closed={false}><p className="tx cx-pv-wait">Making the table…</p></Shell>;
  if (!t) return <Shell icon="table" name="Table" closed><p className="cx-pv-err tx">That table could not be read.</p><pre className="cx-pv-code"><code>{code}</code></pre></Shell>;
  const shown = all ? rows : rows.slice(0, 100);
  const numeric = t.columns.map((_, c) => { const v = rows.map((r) => num(r[c])); return v.length > 0 && v.every((x) => x != null) ? (v as number[]) : null; });
  const toCsv = () => [t.columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const click = (c: number) => setSort((s) => (!s || s.c !== c ? { c, dir: 1 } : s.dir === 1 ? { c, dir: -1 } : null));
  return (
    <Shell icon="table" name={t.title ? `Table: ${t.title}` : 'Table'} closed cls="data"
      foot={<>
        <span className="tx cx-st-hint">{rows.length === t.rows.length ? `${t.rows.length} rows` : `${rows.length} of ${t.rows.length} rows`}</span>
        <span className="cx-grow" />
        <button type="button" className="cx-act" aria-pressed={totals} onClick={() => setTotals((v) => !v)}><UiIcon name="sigma" size={14} />Totals</button>
        <button type="button" className="cx-act" onClick={() => downloadText(`${(t.title || 'table').replace(/[^\w -]+/g, '').trim().slice(0, 40) || 'table'}.csv`, toCsv(), 'text/csv')}><UiIcon name="download" size={14} />Save .csv</button>
        {ask && <button type="button" className="cx-act" onClick={() => ask(`Make a chart (a chart block) of the table called "${t.title || 'above'}". Pick the best kind of chart for it.`)}><UiIcon name="chart" size={14} />Chart it</button>}
      </>}>
      <div className="dt-bar"><label className="dt-find"><UiIcon name="search" size={15} /><span className="sr">Filter rows</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rows" spellCheck={false} /></label></div>
      <div className="dt-wrap" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
        <table className="dt">
          <thead><tr>{t.columns.map((c, k) => (
            <th key={k} aria-sort={sort?.c === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
              <button type="button" onClick={() => click(k)} className={sort?.c === k ? 'on' : ''}>{c}<i aria-hidden>{sort?.c === k ? (sort.dir === 1 ? '▲' : '▼') : ''}</i></button></th>
          ))}</tr></thead>
          <tbody>{shown.map((r, n) => <tr key={n}>{t.columns.map((_, k) => <td key={k} className={numeric[k] ? 'n' : ''}>{r[k] == null ? '' : String(r[k])}</td>)}</tr>)}</tbody>
          {totals && (
            <tfoot>
              {([['Total', (v: number[]) => v.reduce((a, b) => a + b, 0)], ['Average', (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length], ['Lowest', (v: number[]) => Math.min(...v)], ['Highest', (v: number[]) => Math.max(...v)]] as [string, (v: number[]) => number][]).map(([name, f]) => (
                <tr key={name}>{t.columns.map((_, k) => <td key={k} className={k === 0 && !numeric[0] ? '' : 'n'}>{k === 0 && !numeric[0] ? name : numeric[k] && rows.length ? fmt(f(numeric[k]!)) : ''}</td>)}</tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > 100 && !all && <button type="button" className="btn small dt-more" onClick={() => setAll(true)}>Show all {rows.length} rows</button>}
    </Shell>
  );
});
