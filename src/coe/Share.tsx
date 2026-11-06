'use client';
/** Share one chat as a read-only link. It is a copy of the words only, and you can withdraw it at any time. */
import { useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { Modal } from './Panels';
import { sharedId, shareChat, unshareChat } from '@/lib/coe/cloud';
import type { Conv } from './store';

export function ShareDialog({ conv, onClose, say }: { conv: Conv; onClose: () => void; say: (t: string) => void }) {
  const [id, setId] = useState(() => sharedId(conv.id));
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [copied, setCopied] = useState(false);
  const link = id ? `${window.location.origin}/share/#${id}` : '';

  const make = async () => {
    setBusy(true); setErr('');
    try { setId(await shareChat(conv)); } catch (e) { setErr((e as Error).message || 'That could not be shared. Try again.'); }
    setBusy(false);
  };
  const stop = async () => {
    setBusy(true); setErr('');
    try { await unshareChat(conv.id); setId(''); say('This chat is not shared any more. The link no longer works.'); } catch (e) { setErr((e as Error).message || 'That could not be undone. Try again.'); }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setErr('Copy it by hand: select the link and press Ctrl+C.'); }
  };

  return (
    <Modal title="Share this chat" onClose={onClose}>
      <div className="shr">
        {!id ? (
          <>
            <p className="tx">This makes a link to a <b>read-only copy</b> of “{conv.title}”. Anyone who has the link can read it, and nobody can change it.</p>
            <ul className="shr-facts tx">
              <li>Only the words are shared. Pictures, files and your account details are left out.</li>
              <li>Pages Coe made (games, diagrams, slides) are shared and still work.</li>
              <li>You can stop sharing whenever you like, and the link stops working.</li>
            </ul>
          </>
        ) : (
          <>
            <p className="tx">Anyone with this link can read a copy of this chat.</p>
            <div className="shr-link"><input type="text" readOnly value={link} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="cx-in" /><button type="button" className="btn gold" onClick={() => void copy()}><UiIcon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy'}</button></div>
            <p className="tx cx-small">Chat changed since? Press Update to put the new messages on the same link.</p>
          </>
        )}
        {err && <p className="sty-err tx" role="alert">{err}</p>}
        <div className="cap-bar">
          {id && <button type="button" className="btn small" disabled={busy} onClick={() => void stop()}><UiIcon name="trash" size={14} />Stop sharing</button>}
          <span className="cx-grow" />
          <button type="button" className="btn small" onClick={onClose}>Close</button>
          <button type="button" className="btn gold" disabled={busy} onClick={() => void make()}>{busy ? 'One moment…' : id ? 'Update' : 'Make a link'}</button>
        </div>
      </div>
    </Modal>
  );
}
