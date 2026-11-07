'use client';
/**
 * The Files window on the right: what you sent to Coe, what Coe sent back, and the project folder (with real folders).
 * It opens by itself when Coe makes two or more files, and it is never in the way: close it and the chat is full width again.
 */
import { useEffect, useMemo, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { downloadBlob } from '@/ui/copy';
import { ProjectPreview } from './Blocks';
import { useBackClose } from './back';
import { cleanPath, entryOf, listing, removeFile, writeFile, zipFiles, type Files } from '@/lib/coe/workspace';
import { dataUrl, type Msg } from './store';
import type { PlanKey } from '@/lib/coe/models';

export interface Item { key: string; name: string; note: string; get: () => Blob | null; src?: string }
const b64 = (data: string, type: string) => { const bin = atob(data); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };

/** Everything the person sent and everything Coe made, from the messages. */
export function filesOf(messages: Msg[]): { sent: Item[]; made: Item[] } {
  const sent: Item[] = [], made: Item[] = [];
  for (const m of messages) {
    if (m.hidden && m.role === 'user') continue;
    if (m.role === 'user') {
      m.images?.forEach((im, i) => sent.push({ key: `${m.id}:i${i}`, name: im.name, note: 'Picture', src: dataUrl(im), get: () => b64(im.data, im.type) }));
      m.attach?.forEach((a, i) => sent.push({ key: `${m.id}:a${i}`, name: a.name, note: `${a.kind}${a.cut ? ', cut short' : ''}`, get: () => new Blob([a.text], { type: 'text/plain' }) }));
    } else {
      m.images?.forEach((im, i) => made.push({ key: `${m.id}:i${i}`, name: im.name, note: 'Picture', src: dataUrl(im), get: () => b64(im.data, im.type) }));
      m.runs?.forEach((r) => {
        if (r.out?.kind === 'image') { const im = r.out.img; made.push({ key: `${r.id}:img`, name: im.name, note: 'Picture', src: dataUrl(im), get: () => b64(im.data, im.type) }); }
        if (r.out?.kind === 'files') r.out.items.forEach((f, i) => made.push({ key: `${r.id}:f${i}`, name: f.name, note: `${Math.max(1, Math.round(f.size / 1024))} KB`, get: () => b64(f.data, f.type) }));
      });
    }
  }
  return { sent, made };
}
/** How many files Coe has made in all: pictures, app files and project files. */
export const madeCount = (messages: Msg[], files?: Files) => filesOf(messages).made.length + Object.keys(files ?? {}).filter((p) => !p.endsWith('/.keep')).length;

type Tab = 'sent' | 'made' | 'project';
type Node = { name: string; path: string; dir: boolean; kids: Node[] };
function treeOf(names: string[]): Node[] {
  const root: Node = { name: '', path: '', dir: true, kids: [] };
  for (const p of names) {
    const bits = p.split('/'); let n = root;
    bits.forEach((b, i) => {
      const path = bits.slice(0, i + 1).join('/'), last = i === bits.length - 1;
      if (last && b === '.keep') return;
      let k = n.kids.find((x) => x.name === b && x.dir === !last);
      if (!k) { k = { name: b, path, dir: !last, kids: [] }; n.kids.push(k); }
      n = k;
    });
  }
  const sort = (n: Node) => { n.kids.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)); n.kids.forEach(sort); };
  sort(root); return root.kids;
}

export function Workspace({ files, convTitle, messages, tab: tabIn, onChange, onClose, say }: { files: Files; convTitle: string; messages: Msg[]; tab?: Tab; onChange: (f: Files) => void; onClose: () => void; say: (t: string) => void; plan: PlanKey }) {
  useBackClose(onClose);
  const { sent, made } = useMemo(() => filesOf(messages), [messages]);
  const names = useMemo(() => Object.keys(files).sort(), [files]);
  const real = names.filter((n) => !n.endsWith('/.keep'));
  const [tab, setTab] = useState<Tab>(tabIn ?? (made.length || !real.length ? (made.length ? 'made' : 'sent') : 'project'));
  useEffect(() => { if (tabIn) setTab(tabIn); }, [tabIn]);
  const [sel, setSel] = useState<string>(real[0] ?? '');
  const [view, setView] = useState<'code' | 'page'>('code');
  const [shut, setShut] = useState<Record<string, boolean>>({});
  useEffect(() => { if (!real.includes(sel)) setSel(real[0] ?? ''); }, [real, sel]);
  const entry = entryOf(files);
  const tree = useMemo(() => treeOf(names), [names]);

  const add = (dir = '') => {
    const n = window.prompt(dir ? `Name the new file in ${dir}/` : 'Name the new file (for example index.html or src/app.js)'); if (!n) return;
    try { const p = cleanPath(dir ? `${dir}/${n}` : n); onChange(writeFile(files, p, '')); setSel(p); setView('code'); setTab('project'); } catch (e) { say((e as Error).message); }
  };
  const folder = (dir = '') => {
    const n = window.prompt('Name the new folder'); if (!n) return;
    try { const p = cleanPath(dir ? `${dir}/${n}` : n).replace(/\/+$/, ''); onChange(writeFile(files, `${p}/.keep`, '')); } catch (e) { say((e as Error).message); }
  };
  const zip = async () => { downloadBlob(`${(convTitle.replace(/[^\w -]+/g, '').trim() || 'project').slice(0, 40)}.zip`, await zipFiles(Object.fromEntries(Object.entries(files).filter(([p]) => !p.endsWith('/.keep'))))); };
  const save = (it: Item) => { const b = it.get(); if (b) downloadBlob(it.name, b); };
  const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

  const row = (n: Node, depth: number): React.ReactNode => n.dir ? (
    <li key={n.path} role="treeitem" aria-expanded={!shut[n.path]}>
      <div className="fl-dir" style={{ paddingLeft: 6 + depth * 14 }}>
        <button type="button" className="fl-dname" onClick={() => setShut((s) => ({ ...s, [n.path]: !s[n.path] }))}><UiIcon name="down" size={12} className={shut[n.path] ? 'shut' : ''} /><UiIcon name="folder" size={14} /><span className="tx">{n.name}</span></button>
        <button type="button" className="fl-mini" aria-label={`New file in ${n.name}`} title="New file here" onClick={() => add(n.path)}><UiIcon name="plus" size={12} /></button>
      </div>
      {!shut[n.path] && <ul role="group">{n.kids.map((k) => row(k, depth + 1))}</ul>}
    </li>
  ) : (
    <li key={n.path} role="treeitem"><button type="button" className={`fl-file${n.path === sel ? ' on' : ''}`} style={{ paddingLeft: 6 + depth * 14 + 18 }} onClick={() => { setSel(n.path); setView('code'); }}><UiIcon name="file" size={13} /><span className="tx">{n.name}</span></button></li>
  );

  const list = (items: Item[], empty: string) => items.length ? (
    <ul className="fl-list">{items.map((it) => (
      <li key={it.key}>
        {it.src ? <img src={it.src} alt="" /> : <span className="fl-ic" aria-hidden><UiIcon name="file" size={18} /></span>}
        <span className="fl-t"><b className="tx">{it.name}</b><i className="tx">{it.note}</i></span>
        <button type="button" className="cx-act" aria-label={`Save ${it.name}`} onClick={() => save(it)}><UiIcon name="download" size={14} />Save</button>
      </li>
    ))}</ul>
  ) : <p className="tx cx-small fl-empty">{empty}</p>;

  return (
    <aside className="cx-ws" aria-label="Files">
      <header className="cx-ws-h">
        <b className="d"><UiIcon name="folder" size={16} />Files</b><span className="cx-grow" />
        <button type="button" className="cx-ib cx-closeb" aria-label="Close the files window" onClick={onClose}><UiIcon name="close" size={18} /><span>Close</span></button>
      </header>
      <div className="fl-tabs seg" role="tablist" aria-label="Files">
        <button type="button" role="tab" aria-selected={tab === 'sent'} aria-pressed={tab === 'sent'} onClick={() => setTab('sent')}>You sent{sent.length ? ` ${sent.length}` : ''}</button>
        <button type="button" role="tab" aria-selected={tab === 'made'} aria-pressed={tab === 'made'} onClick={() => setTab('made')}>Coe sent{made.length ? ` ${made.length}` : ''}</button>
        <button type="button" role="tab" aria-selected={tab === 'project'} aria-pressed={tab === 'project'} onClick={() => setTab('project')}>Project{real.length ? ` ${real.length}` : ''}</button>
      </div>
      {tab === 'sent' && <div className="fl-body">{list(sent, 'Nothing sent yet. Pictures and files you add to a message show up here.')}</div>}
      {tab === 'made' && <div className="fl-body">{list(made, 'Nothing yet. Pictures and files Coe makes show up here.')}</div>}
      {tab === 'project' && (
        <>
          <div className="fl-bar">
            <button type="button" className="cx-act" onClick={() => add('')}><UiIcon name="plus" size={14} />File</button>
            <button type="button" className="cx-act" onClick={() => folder('')}><UiIcon name="folder" size={14} />Folder</button>
            <span className="cx-grow" />
            <button type="button" className="cx-act" onClick={zip} disabled={!real.length}><UiIcon name="download" size={14} />Zip</button>
          </div>
          <div className="cx-ws-body">
            <nav className="cx-ws-list" aria-label="Project files">
              <ul role="tree" className="fl-tree">{tree.map((n) => row(n, 0))}</ul>
              {!real.length && <p className="tx cx-small">Nothing here yet. Ask Coe to build something, and its files and folders show up here.</p>}
            </nav>
            <div className="cx-ws-main">
              {sel && sel in files ? <>
                <div className="cx-ws-bar">
                  <b className="tx">{sel}</b><span className="cx-grow" />
                  {entry && <div className="seg cx-pv-seg" role="group" aria-label="View"><button type="button" aria-pressed={view === 'code'} onClick={() => setView('code')}>Code</button><button type="button" aria-pressed={view === 'page'} onClick={() => setView('page')}>Page</button></div>}
                  <button type="button" className="cx-act" aria-label={`Delete ${sel}`} onClick={() => { if (window.confirm(`Delete ${sel}?`)) onChange(removeFile(files, sel)); }}><UiIcon name="trash" size={14} />Delete</button>
                </div>
                {view === 'page' && entry ? <ProjectPreview files={files} /> : <textarea className="cx-ws-edit" spellCheck={false} aria-label={`Edit ${sel}`} value={files[sel]} onChange={(e) => onChange({ ...files, [sel]: e.target.value })} />}
              </> : <p className="tx cx-small cx-ws-none">{listing(files)}</p>}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
