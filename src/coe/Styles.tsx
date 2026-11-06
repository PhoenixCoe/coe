'use client';
/** "My styles": write your own way for Coe to work (a strict marker, a pirate, a patient maths coach) and pick it any time. */
import { useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { Modal } from './Panels';
import { STYLE_MAX, loadStyles, removeStyle, saveStyle, type Persona } from '@/lib/coe/personas';

const IDEAS = [
  { name: 'Strict marker', blurb: 'Marks like an examiner, no free marks.', prompt: 'Mark my work like a strict but fair examiner. Give a mark out of the total, say exactly where marks were lost, and show a model answer after. Do not be generous.' },
  { name: 'Study buddy', blurb: 'Quizzes me and keeps it light.', prompt: 'Act like a friendly study buddy. Explain in short chunks, then ask me one quick question to check I got it before moving on. Keep it light and encouraging, never patronising.' },
  { name: 'Devil\'s advocate', blurb: 'Argues the other side.', prompt: 'Argue the opposite side of whatever I say, as strongly and fairly as you can, so I can test my own thinking. Then tell me which of my points held up.' },
];

export function StyleEditor({ onClose, onUse, current }: { onClose: () => void; onUse: (id: string) => void; current: string }) {
  const [list, setList] = useState<Persona[]>(() => loadStyles());
  const [edit, setEdit] = useState<{ id?: string; name: string; blurb: string; prompt: string } | null>(null);
  const [err, setErr] = useState('');
  const refresh = () => setList(loadStyles());

  const save = (use: boolean) => {
    if (!edit) return;
    if (!edit.name.trim()) { setErr('Give it a name.'); return; }
    if (!edit.prompt.trim()) { setErr('Say how Coe should work.'); return; }
    const p = saveStyle(edit);
    if (!p) { setErr(`You can keep ${STYLE_MAX} styles. Remove one first.`); return; }
    refresh(); setEdit(null); setErr('');
    if (use) { onUse(p.id); onClose(); }
  };

  return (
    <Modal title="My styles" onClose={onClose} wide>
      <div className="sty">
        {!edit ? (
          <>
            <p className="tx">A style tells Coe how to work in every message until you change it. Write your own, or start from an idea.</p>
            {list.length > 0 && (
              <ul className="sty-list">
                {list.map((p, i) => (
                  <li key={p.id} className={`sty-item c${i % 5}`}>
                    <div className="sty-txt"><b className="d">{p.name}</b><span className="tx">{p.blurb}</span></div>
                    <div className="sty-btns">
                      <button type="button" className={`btn small${current === p.id ? ' gold' : ''}`} aria-pressed={current === p.id} onClick={() => { onUse(p.id); onClose(); }}>{current === p.id ? 'In use' : 'Use'}</button>
                      <button type="button" className="btn small" onClick={() => setEdit({ id: p.id, name: p.name, blurb: p.blurb, prompt: p.prompt })}>Edit</button>
                      <button type="button" className="btn small" aria-label={`Remove ${p.name}`} onClick={() => { removeStyle(p.id); refresh(); }}><UiIcon name="trash" size={14} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="sty-new">
              <button type="button" className="btn gold" disabled={list.length >= STYLE_MAX} onClick={() => setEdit({ name: '', blurb: '', prompt: '' })}><UiIcon name="plus" size={16} />Write a new style</button>
            </div>
            <h3 className="d sty-h">Ideas</h3>
            <ul className="sty-ideas">
              {IDEAS.map((x) => (
                <li key={x.name}><button type="button" className="sty-idea" onClick={() => setEdit({ ...x })}><b className="d">{x.name}</b><span className="tx">{x.blurb}</span></button></li>
              ))}
            </ul>
          </>
        ) : (
          <form className="sty-form" onSubmit={(e) => { e.preventDefault(); save(true); }}>
            <label className="sty-f"><span className="d">Name</span><input type="text" className="cx-in" value={edit.name} maxLength={30} autoFocus placeholder="Strict marker" onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="sty-f"><span className="d">One line to remind you</span><input type="text" className="cx-in" value={edit.blurb} maxLength={90} placeholder="Marks like an examiner" onChange={(e) => setEdit({ ...edit, blurb: e.target.value })} /></label>
            <label className="sty-f"><span className="d">How should Coe work?</span><textarea className="cx-in" rows={7} value={edit.prompt} maxLength={1500} placeholder="Write it the way you would tell a person: what to do, what to avoid, how long, how friendly." onChange={(e) => setEdit({ ...edit, prompt: e.target.value })} /></label>
            <p className="tx cx-small">{edit.prompt.length} / 1500</p>
            {err && <p className="sty-err tx" role="alert">{err}</p>}
            <div className="cap-bar">
              <span className="cx-grow" />
              <button type="button" className="btn small" onClick={() => { setEdit(null); setErr(''); }}>Back</button>
              <button type="button" className="btn small" onClick={() => save(false)}>Save</button>
              <button type="submit" className="btn gold">Save and use</button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
