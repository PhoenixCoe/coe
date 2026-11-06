'use client';
import { useEffect, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { connectGoogle, disconnectGoogle, googleAvailable } from '@/lib/coe/google';
import { connectGithub } from '@/lib/coe/github';
import { MAX_FACTS, links, memory, onLinks, onMemory, remember, setGithub, setMemory } from '@/lib/coe/links';

/** What Coe knows about you, and the accounts it can reach for you. Both stay in this browser (notes also follow your account when you are signed in). */
export function You({ pro, signedIn }: { pro: boolean; signedIn: boolean }) {
  const [, bump] = useState(0);
  useEffect(() => { const a = onLinks(() => bump((n) => n + 1)), b = onMemory(() => bump((n) => n + 1)); return () => { a(); b(); }; }, []);
  const l = links(), notes = memory();
  const [err, setErr] = useState(''), [busy, setBusy] = useState('');
  const [tok, setTok] = useState(''), [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  const [edit, setEdit] = useState<number | null>(null), [draft, setDraft] = useState('');
  const gExp = l.google ? l.google.exp > Date.now() : false;
  const run = async (k: string, f: () => Promise<unknown>) => { setBusy(k); setErr(''); try { await f(); } catch (e) { setErr((e as Error).message || 'That did not work.'); } finally { setBusy(''); } };

  return (
    <div className="cx-form cx-you">
      {err && <div className="cx-err" role="alert"><p>{err}</p></div>}

      <section className="cx-sec">
        <h3 className="d">Connections</h3>
        {!pro && <p className="tx cx-small">Putting things into Google and GitHub is part of Pro. You can still connect now.</p>}

        <div className="cx-conn">
          <div className="cx-conn-h"><b className="d">Google</b><span className={`cx-dot${l.google && gExp ? ' on' : ''}`}>{l.google ? (gExp ? 'Connected' : 'Ran out, connect again') : 'Not connected'}</span></div>
          <p className="tx cx-small">Lets Coe make Google Docs, Sheets and Slides in your Drive. By default it can only open files it made itself. Google access lasts about an hour, then you press Connect again.</p>
          {!googleAvailable
            ? <p className="tx cx-small">Not switched on for this site yet. The owner adds a Google client ID (see the setup list).</p>
            : <div className="cx-actions">
              <button type="button" className="btn small" disabled={busy === 'g'} onClick={() => run('g', () => connectGoogle('make'))}>{l.google && gExp ? 'Reconnect' : 'Connect Google'}</button>
              <button type="button" className="btn small" disabled={busy === 'g2'} onClick={() => run('g2', () => connectGoogle('read'))} title="Also lets Coe read documents, sheets and decks that already exist in your Drive">Connect with reading</button>
              {l.google && <button type="button" className="btn small" onClick={() => disconnectGoogle()}>Disconnect</button>}
            </div>}
          {l.google && <p className="tx cx-small">Access level: {l.google.level === 'read' ? 'make files, and read the ones you name' : 'make files only'}.</p>}
        </div>

        <div className="cx-conn">
          <div className="cx-conn-h"><b className="d">GitHub</b><span className={`cx-dot${l.github ? ' on' : ''}`}>{l.github ? `Connected as ${l.github.login}` : 'Not connected'}</span></div>
          <p className="tx cx-small">Lets Coe read your repositories and, when you press a button on the preview, commit, open issues and pull requests. It uses a token you make yourself, kept in this browser only. Use a fine-grained token limited to the repositories you choose. Make one at github.com/settings/personal-access-tokens/new, with Contents, Issues and Pull requests set to Read and write.</p>
          {l.github
            ? <div className="cx-actions"><button type="button" className="btn small" onClick={() => setGithub(undefined)}>Disconnect</button></div>
            : <form className="cx-conn-f" onSubmit={(e) => { e.preventDefault(); void run('gh', async () => { await connectGithub(tok); setTok(''); }); }}>
              <input className="cx-in" type="password" autoComplete="off" spellCheck={false} placeholder="Paste a GitHub token" aria-label="GitHub token" value={tok} onChange={(e) => setTok(e.target.value)} />
              <button type="submit" className="btn small" disabled={busy === 'gh' || !tok.trim()}>{busy === 'gh' ? 'Checking…' : 'Connect'}</button>
            </form>}
        </div>
      </section>

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
