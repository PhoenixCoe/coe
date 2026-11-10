'use client';
import { useEffect, useState } from 'react';
import { Modal } from './Panels';
import { connectMini, forgetPair, onExtConnected } from '@/lib/coe/extension';

/** Coe Mini asked to join this account. The code here must match the one Coe Mini is showing, so only the person holding both can connect. */
export function ConnectMini({ code, email, onClose, onSwitch }: { code: string; email: string; onClose: () => void; onSwitch: () => void }) {
  const [step, setStep] = useState<'ask' | 'wait' | 'done' | 'no'>('ask');
  const [why, setWhy] = useState('');
  useEffect(() => {
    if (step !== 'wait') return;
    const off = onExtConnected((yes, w) => { setWhy(w); setStep(yes ? 'done' : 'no'); });
    const t = window.setTimeout(() => setStep((s) => (s === 'wait' ? 'no' : s)), 9000);
    return () => { off(); window.clearTimeout(t); };
  }, [step]);
  const shut = () => { if (step !== 'done') forgetPair(); onClose(); };
  const parts = [code.slice(0, 3), code.slice(3)];
  return (
    <Modal title={step === 'done' ? 'Connected' : 'Connect Coe Mini'} onClose={shut}>
      <div className="cm-card">
        {step === 'ask' && (
          <>
            <p className="lead tx">Coe Mini wants to use your Coe account{email ? <> (<b>{email}</b>)</> : null}. Is this the code it is showing?</p>
            <div className="cm-code" role="img" aria-label={`Code ${parts.join(' ')}`}><b className="d">{parts[0]}</b><i aria-hidden="true" /><b className="d">{parts[1]}</b></div>
            <p className="tx small">Only press Connect if it is the same code as in Coe Mini.</p>
            <div className="cm-act">
              <button type="button" className="btn primary" onClick={() => { connectMini(code, email); setStep('wait'); }}>Connect</button>
              <button type="button" className="btn" onClick={shut}>No</button>
            </div>
            <button type="button" className="cx-link" onClick={onSwitch}>Not this account? Sign in as someone else</button>
          </>
        )}
        {step === 'wait' && <p className="lead tx" role="status">Connecting</p>}
        {step === 'done' && (
          <>
            <span className="cm-tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" /></svg></span>
            <p className="lead tx">Coe Mini and Coe are connected. Your answers about you, your settings and your Coe Mini chats now show in both. You can turn this off any time in Settings.</p>
            <div className="cm-act"><button type="button" className="btn primary" onClick={onClose}>OK</button></div>
          </>
        )}
        {step === 'no' && (
          <>
            <p className="lead tx" role="alert">{why === 'account' ? 'Coe Mini is signed in as someone else. Sign in to Coe with the same account as Coe Mini, then try again.' : why === 'signin' ? 'Sign in to Coe Mini first, then try again.' : 'Coe Mini did not say yes. Open Coe Mini, press New code, and try again.'}</p>
            <div className="cm-act"><button type="button" className="btn primary" onClick={shut}>OK</button></div>
          </>
        )}
      </div>
    </Modal>
  );
}
