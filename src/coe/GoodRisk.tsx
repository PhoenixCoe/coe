'use client';
/** A normal window that says the good and the risks of something before the person turns it on. The same box as in Coe Mini. */
import { createPortal } from 'react-dom';
import { Modal } from './Panels';

const TICK = <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="square" /></svg>;

function Sec({ cls, sym, head, list }: { cls: string; sym: React.ReactNode; head: string; list: string[] }) {
  return (
    <div className={`gr-sec ${cls}`}>
      <span className="gr-sym" aria-hidden>{sym}</span>
      <h4 className="d">{head}</h4>
      <ul>{list.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

export function GoodRisk({ title, lead, good, risks, yes, onYes, onNo }: { title: string; lead: string; good: string[]; risks: string[]; yes: string; onYes: () => void; onNo: () => void }) {
  // Drawn on the page itself, so a window that is already open (Settings) does not squash it.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <Modal title={title} onClose={onNo}>
      <p className="tx">{lead}</p>
      <Sec cls="good" sym={TICK} head="The good" list={good} />
      <Sec cls="warn" sym="!" head="The risks" list={risks} />
      <div className="cx-actions">
        <button type="button" className="btn" onClick={onNo} autoFocus>No</button>
        <button type="button" className="btn gold" onClick={onYes}>{yes}</button>
      </div>
    </Modal>,
    document.body,
  );
}
