'use client';
/** "Report chat" in the top bar menu: why, a few words, and whether the last few messages go along so the team can see what happened. Nothing is sent unless it is ticked. */
import { useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { Modal } from './Panels';
import { loadSettings } from '@/lib/coe/settings';
import { reportChat, type ChatLines, type ReportWhy } from '@/lib/coe/feedback';

const WHY: [ReportWhy, string][] = [['unsafe', 'Unsafe or harmful'], ['wrong', 'Wrong or misleading'], ['other', 'Something else']];

export function ReportChat({ title, lines, onClose }: { title: string; lines: ChatLines; onClose: () => void }) {
  const [why, setWhy] = useState<ReportWhy>('wrong'), [note, setNote] = useState(''), [inc, setInc] = useState(true);
  const [st, setSt] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'limit'>('idle');
  const send = async () => {
    setSt('sending');
    const r = await reportChat(loadSettings(), why, note, title, inc ? lines : undefined);
    setSt(r.emailed ? 'sent' : r.limited ? 'limit' : 'failed');
  };
  return (
    <Modal title="Report chat" onClose={onClose}>
      {st === 'sent' || st === 'limit' ? (
        <div className="rc-form">
          <p className="pn-info tx sp-done" role="status"><span className="pn-i" aria-hidden><UiIcon name={st === 'sent' ? 'check' : 'info'} size={15} strokeWidth={3.2} /></span><span>{st === 'sent' ? 'Thank you. The report was sent and we will take a look.' : 'You have sent enough reports for today. Thank you.'}</span></p>
          <div className="sp-fa"><button type="button" className="btn gold" onClick={onClose}>Done</button></div>
        </div>
      ) : (
        <form className="rc-form" aria-label="Report chat" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <div className="sp-why" role="radiogroup" aria-label="Why">
            {WHY.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={why === v} className={`sp-w${why === v ? ' on' : ''}`} onClick={() => setWhy(v)}><span className="sp-wk" aria-hidden>{why === v && <UiIcon name="check" size={13} strokeWidth={3.4} />}</span><span className="d">{l}</span></button>)}
          </div>
          <label className="sp-nl"><span className="d">Anything we should know? (optional)</span><textarea className="cx-in" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A few words are plenty" /></label>
          <button type="button" role="checkbox" aria-checked={inc} className={`sp-w rc-inc${inc ? ' on' : ''}`} onClick={() => setInc((v) => !v)}>
            <span className="sp-wk" aria-hidden>{inc && <UiIcon name="check" size={13} strokeWidth={3.4} />}</span>
            <span><span className="d">Send the last few messages</span><span className="tx rc-sub">So we can see what happened. Nothing else from your chats is sent.</span></span>
          </button>
          <div className="sp-fa">
            <button type="submit" className="btn gold" disabled={st === 'sending'}>{st === 'sending' ? 'Sending…' : 'Send report'}</button>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            {st === 'failed' && <span className="tx sp-fail" role="status">It did not send. Press Send report to try again.</span>}
          </div>
        </form>
      )}
    </Modal>
  );
}
