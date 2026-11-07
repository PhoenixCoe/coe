'use client';
import { useEffect, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { MAX_FACTS, memory, onMemory, remember, setMemory } from '@/lib/coe/links';

/** What Coe knows about you. It stays in this browser (notes also follow your account when you are signed in). */
export function You({ pro, signedIn }: { pro: boolean; signedIn: boolean }) {
  const [, bump] = useState(0);
  useEffect(() => { const b = onMemory(() => bump((n) => n + 1)); return () => { b(); }; }, []);
  const notes = memory();
  const [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  const [edit, setEdit] = useState<number | null>(null), [draft, setDraft] = useState('');

  return (
    <div className="cx-form cx-you">

      <section className="cx-sec">
        <h3 className="d">What Coe remembers</h3>
        <p className="tx cx-small">Short notes Coe keeps about you so you do not repeat yourself. {signedIn ? 'They follow your account to other devices.' : 'They stay in this browser. Sign in to have them follow you.'} Say “remember that…” in a chat to add one.</p>
        {notes.length === 0 && <p className="tx cx-small"><i>Nothing yet.</i></p>}
        <ul className="cx-notes">
          {notes.map((n, i) => (
            <li key={i}>
              {edit === i
                ? <form onSubmit={(e) => { e.preventDefault(); const next = [...notes]; next[i] = draft; setMemory(next); setEdit(null); }}>
                  <input className="cx-in" autoFocus maxLength={240} value={draft} aria-label="Edit note" onChange={(e) => setDraft(e.target.value)} />
                  <button type="submit" className="cx-act">Save</button><button type="button" className="cx-act" onClick={() => setEdit(null)}>Cancel</button>
                </form>
                : <>
                  <span className="tx">{n}</span>
                  <button type="button" className="cx-ib" aria-label={`Edit: ${n}`} onClick={() => { setEdit(i); setDraft(n); }}><UiIcon name="edit" size={16} /></button>
                  <button type="button" className="cx-ib" aria-label={`Delete: ${n}`} onClick={() => setMemory(notes.filter((_, k) => k !== i))}><UiIcon name="trash" size={16} /></button>
                </>}
            </li>
          ))}
        </ul>
        <form className="cx-conn-f" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { remember(note); setNote(''); } }}>
          <input className="cx-in" maxLength={240} placeholder={notes.length >= MAX_FACTS ? 'The list is full. Delete one first.' : 'Add a note, e.g. I am studying GCSE chemistry'} aria-label="New note" value={note} disabled={notes.length >= MAX_FACTS} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" className="btn small" disabled={!note.trim() || notes.length >= MAX_FACTS}>Add</button>
        </form>
        {notes.length > 0 && <div className="cx-actions">{!sure
          ? <button type="button" className="btn small" onClick={() => setSure(true)}>Forget all</button>
          : <span className="cx-sure"><b className="d">Forget all {notes.length}?</b><button type="button" className="btn small" onClick={() => { setMemory([]); setSure(false); }}>Yes, forget</button><button type="button" className="btn small" onClick={() => setSure(false)}>No</button></span>}</div>}
      </section>
    </div>
  );
}
