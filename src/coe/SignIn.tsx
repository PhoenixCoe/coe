'use client';
import { useEffect } from 'react';
import { cloudOn, startAccountSignIn } from '@/lib/coe/cloud';

/* Coe has no sign-in of its own. Anything that asks to sign in sends the person straight to their PMC ID (id.pmcstudios.uk),
   which sends them straight back here. There is nothing to draw: this opens the PMC ID page and closes itself. */
export function SignIn({ onClose, say }: { onClose: () => void; onChange?: (signedIn: boolean) => void; say?: (text: string) => void }) {
  useEffect(() => {
    if (!cloudOn) { say?.('Sign in is not switched on yet. Your chats are saved on this device.'); onClose(); return; }
    try { startAccountSignIn('signin'); } catch (e) { say?.((e as Error).message || 'Could not open the sign-in page.'); }
    onClose();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
