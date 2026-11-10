'use client';
/** Take a picture with the camera, or of your screen, and put it straight into the message. */
import { useEffect, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { Modal } from './Panels';

export const canCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
export const canScreen = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices as MediaDevices | undefined)?.getDisplayMedia;

const WHY: Record<string, string> = {
  NotAllowedError: 'Permission was not given. Allow it in the address bar, then try again.',
  NotFoundError: 'No camera was found on this device.',
  NotReadableError: 'Another app is using the camera. Close it and try again.',
  SecurityError: 'This needs a secure page (https).',
};

export function Capture({ mode, onShot, onClose }: { mode: 'camera' | 'screen'; onShot: (f: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'starting' | 'live' | 'error'>('starting');
  const [err, setErr] = useState('');
  const [face, setFace] = useState<'environment' | 'user'>('environment');
  const [many, setMany] = useState(false);

  useEffect(() => {
    let dead = false;
    setState('starting');
    (async () => {
      try {
        stream.current?.getTracks().forEach((t) => t.stop());
        const s = mode === 'screen'
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
          : await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: face }, width: { ideal: 1920 } }, audio: false });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        s.getVideoTracks()[0]?.addEventListener('ended', () => { if (mode === 'screen') onClose(); });
        const v = video.current; if (v) { v.srcObject = s; await v.play().catch(() => {}); }
        setState('live');
        if (mode === 'camera') { try { const d = await navigator.mediaDevices.enumerateDevices(); setMany(d.filter((x) => x.kind === 'videoinput').length > 1); } catch { /* one camera */ } }
      } catch (e) {
        if (dead) return;
        const name = (e as DOMException).name;
        if (mode === 'screen' && name === 'NotAllowedError') { onClose(); return; }   // the person pressed Cancel in the browser's own picker
        setErr(WHY[name] ?? ((e as Error).message || 'That could not be started.')); setState('error');
      }
    })();
    return () => { dead = true; };
  }, [mode, face]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);

  const shoot = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const max = 1800, k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    const png = mode === 'screen';
    c.toBlob((b) => { if (!b) return; const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); onShot(new File([b], `${mode === 'screen' ? 'screen' : 'photo'}-${stamp}.${png ? 'png' : 'jpg'}`, { type: b.type })); onClose(); }, png ? 'image/png' : 'image/jpeg', 0.9);
  };

  return (
    <Modal title={mode === 'screen' ? 'Capture your screen' : 'Take a picture'} onClose={onClose} wide>
      <div className="cap">
        <div className={`cap-view${state === 'live' ? ' live' : ''}`}>
          <video ref={video} playsInline muted aria-label={mode === 'screen' ? 'Your screen' : 'Camera view'} />
          {state === 'starting' && <p className="cap-msg tx">{mode === 'screen' ? 'Choose a window or screen to share…' : 'Starting the camera…'}</p>}
          {state === 'error' && <p className="cap-msg tx" role="alert">{err}</p>}
        </div>
        <div className="cap-bar">
          {mode === 'camera' && many && <button type="button" className="btn small" onClick={() => setFace((f) => (f === 'user' ? 'environment' : 'user'))}><UiIcon name="refresh" size={15} />Flip camera</button>}
          <span className="cx-grow" />
          <button type="button" className="btn small" onClick={onClose}>Cancel</button>
          <button type="button" className="btn gold" disabled={state !== 'live'} onClick={shoot}><UiIcon name={mode === 'screen' ? 'screen' : 'camera'} size={18} />{mode === 'screen' ? 'Capture' : 'Take picture'}</button>
        </div>
      </div>
    </Modal>
  );
}
