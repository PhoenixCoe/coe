'use client';
import { useEffect, useMemo, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { downloadBlob } from '@/ui/copy';
import { ProjectPreview } from './Blocks';
import { approve } from '@/lib/coe/tools';
import { links } from '@/lib/coe/links';
import { cleanPath, entryOf, listing, removeFile, writeFile, zipFiles, type Files } from '@/lib/coe/workspace';
import type { PlanKey } from '@/lib/coe/models';

/** The project folder for a chat: what Coe has written, which the person can read, edit, preview, zip, or commit to GitHub. */
export function Workspace({ files, convTitle, onChange, onClose, say, plan }: { files: Files; convTitle: string; onChange: (f: Files) => void; onClose: () => void; say: (t: string) => void; plan: PlanKey }) {
  const names = useMemo(() => Object.keys(files).sort(), [files]);
  const [sel, setSel] = useState<string>(names[0] ?? '');
  const [view, setView] = useState<'code' | 'page'>('code');
  const [gh, setGh] = useState(false);
  const [repo, setRepo] = useState(''), [branch, setBranch] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState<{ url: string; text: string } | null>(null), [err, setErr] = useState('');
  useEffect(() => { if (!names.includes(sel)) setSel(names[0] ?? ''); }, [names, sel]);
  const entry = entryOf(files);

  const add = () => {
    const n = window.prompt('Name the new file (for example index.html or src/app.js)'); if (!n) return;
    try { const p = cleanPath(n); onChange(writeFile(files, p, '')); setSel(p); setView('code'); } catch (e) { say((e as Error).message); }
  };
  const zip = async () => { downloadBlob(`${(convTitle.replace(/[^\w -]+/g, '').trim() || 'project').slice(0, 40)}.zip`, await zipFiles(files)); };
  const commit = async () => {
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await approve({ tool: 'github', action: 'commit', repo, branch: branch || undefined, message: msg || 'Update from Coe', files: [], from_workspace: true }, { plan, files: () => files });
      setRes({ url: r.url ?? '', text: r.result });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <aside className="cx-ws" aria-label="Project folder">
      <header className="cx-ws-h">
        <b className="d"><UiIcon name="folder" size={16} />Project folder</b><span className="cx-grow" />
        <button type="button" className="cx-act" onClick={zip} disabled={!names.length}><UiIcon name="download" size={14} />Zip</button>
        <button type="button" className="cx-act" onClick={() => { setGh((g) => !g); setRes(null); }} disabled={!names.length || plan !== 'pro'}><UiIcon name="branch" size={14} />GitHub</button>
        <button type="button" className="cx-ib" aria-label="Close the project folder" onClick={onClose}><UiIcon name="close" size={18} /></button>
      </header>
      {gh && (
        <div className="cx-ws-gh">
          {!links().github ? <p className="tx">Connect GitHub first (Settings, then Connections).</p> : <>
            <label className="tx">Repository<input type="text" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name" spellCheck={false} /></label>
            <label className="tx">Branch (new or existing)<input type="text" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="coe-changes" spellCheck={false} /></label>
            <label className="tx">Message<input type="text" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Update from Coe" /></label>
            <button type="button" className="btn small gold" disabled={busy || !/^[\w.-]+\/[\w.-]+$/.test(repo)} onClick={commit}>{busy ? 'Committing…' : `Commit ${names.length} files`}</button>
            {err && <p className="cx-tool-err tx">{err}</p>}
            {res && <p className="tx">Done. <a className="cx-link" href={res.url} target="_blank" rel="noopener noreferrer">Open it</a></p>}
          </>}
        </div>
      )}
      <div className="cx-ws-body">
        <nav className="cx-ws-list" aria-label="Files">
          {names.map((n) => <button key={n} type="button" className={n === sel ? 'on' : ''} onClick={() => { setSel(n); setView('code'); }}><UiIcon name="file" size={13} /><span className="tx">{n}</span></button>)}
          {!names.length && <p className="tx cx-small">Nothing here yet. Ask Coe to build something, and its files show up here.</p>}
          <button type="button" className="cx-ws-add tx" onClick={add}><UiIcon name="plus" size={13} />New file</button>
        </nav>
        <div className="cx-ws-main">
          {sel && sel in files ? <>
            <div className="cx-ws-bar">
              <b className="tx">{sel}</b><span className="cx-grow" />
              {entry && <div className="seg cx-pv-seg" role="group" aria-label="View"><button type="button" aria-pressed={view === 'code'} onClick={() => setView('code')}>Code</button><button type="button" aria-pressed={view === 'page'} onClick={() => setView('page')}>Page</button></div>}
              <button type="button" className="cx-act" onClick={() => { if (window.confirm(`Delete ${sel}?`)) onChange(removeFile(files, sel)); }}><UiIcon name="trash" size={14} />Delete</button>
            </div>
            {view === 'page' && entry ? <ProjectPreview files={files} /> : <textarea className="cx-ws-edit" spellCheck={false} aria-label={`Edit ${sel}`} value={files[sel]} onChange={(e) => onChange({ ...files, [sel]: e.target.value })} />}
          </> : <p className="tx cx-small cx-ws-none">{listing(files)}</p>}
        </div>
      </div>
    </aside>
  );
}
