'use client';
import { useEffect, useState } from 'react';
import { connectMini, declineMini, forgetPair, onExtConnected } from '@/lib/coe/extension';
import { Notice } from './ErrorBox';

type Step = 'ask' | 'wait' | 'done' | 'no' | 'declined';
/** The linking code, written by Coe as a temporary chat: nothing is saved, no tokens are used, and nobody types. The only things to press are the buttons Coe made (Accept and Decline), and they are here, never in Coe Mini.
 *  It sits in the normal chat view under the normal top bar. Starting a new chat or opening another one is how you leave it (the page then forgets the code). */
export function LinkChat({ code, email, onSwitch }: { code: string; email: string; onSwitch: () => void }) {
  const [step, setStep] = useState<Step>('ask');
  const [why, setWhy] = useState('');
  useEffect(() => {
    if (step !== 'wait') return;
    const off = onExtConnected((yes, w) => { setWhy(w); setStep(yes ? 'done' : 'no'); });
    const t = window.setTimeout(() => setStep((s) => (s === 'wait' ? 'no' : s)), 9000);
    return () => { off(); window.clearTimeout(t); };
  }, [step]);
  useEffect(() => () => { forgetPair(); }, []);   // leaving the chat forgets a code nobody answered
  const parts = [code.slice(0, 3), code.slice(3)];
  return (
    <section className="lk" aria-label="Coe linking code">
      <p className="lk-lead d">Here is your Coe linking code:</p>
      <div className="lk-code" role="img" aria-label={`Code ${code.split('').join(' ')}`}><b className="d">{parts[0]}</b><i aria-hidden="true" /><b className="d">{parts[1]}</b></div>
      {step === 'ask' && (<>
        <p className="lk-for tx">Coe Mini is asking to use your account{email ? <> (<b>{email}</b>)</> : null}. It should be showing the same code.</p>
        <Notice level="orange" title="Only accept if this is you" text="Press Accept only if you just pressed Connect in Coe Mini and its code is the same. Not you? Press Decline. Accepting shares your About you answers, settings and Mini chats." />
        <div className="lk-act">
          <button type="button" className="btn primary" onClick={() => { connectMini(code, email); setStep('wait'); }}>Accept</button>
          <button type="button" className="btn" onClick={() => { declineMini(); setStep('declined'); }}>Decline</button>
        </div>
        <p className="lk-small tx">Works for 15 minutes. <button type="button" className="cx-link" onClick={onSwitch}>Not this account?</button></p>
      </>)}
      {step === 'wait' && <p className="lk-for tx" role="status">Connecting…</p>}
      {step === 'done' && <><Notice level="grey" title="Connected" text="Coe Mini and Coe now share your About you answers, settings and Mini chats. You can turn this off in Settings, Coe Mini." /><p className="lk-small tx">Start a new chat any time to leave this one.</p></>}
      {step === 'declined' && <><Notice level="grey" title="Declined" text="Coe Mini was not connected and nothing was shared. If that was not you, you can ignore it. If it was, press New code in Coe Mini." /><p className="lk-small tx">Start a new chat any time to leave this one.</p></>}
      {step === 'no' && <Notice level="red" title="Could not connect" text={why === 'account' ? 'Coe Mini is signed in as someone else. Sign in to Coe with the same account as Coe Mini, then try again.' : why === 'signin' ? 'Sign in to Coe Mini first, then try again.' : 'Coe Mini did not show this code. Press New code in Coe Mini and try again.'} />}
    </section>
  );
}
