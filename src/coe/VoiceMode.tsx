'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import type { CoeSettings } from '@/lib/coe/settings';
import { Wave, WAVE_BANDS } from './Wave';
import { browserListen, browserListens, canListen, forSpeech, listen, loadPrefs, savePrefs, serverVoice, setVoiceActive, speak, transcribe, type Speaking, type VoicePrefs } from '@/lib/coe/voice';

type Phase = 'ready' | 'listening' | 'working' | 'thinking' | 'speaking' | 'paused';
export interface VoiceReply { id: string; text: string; error?: boolean }

/** A full-screen conversation by voice. Listens, sends what you said, speaks the answer, and listens again. */
export function VoiceMode({ settings, busy, reply, onSay, onStopChat, onSettings, onClose }: {
  settings: CoeSettings; busy: boolean; reply: VoiceReply | null; onSay: (text: string) => void; onStopChat: () => void; onSettings: () => void; onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [prefs, setPrefs] = useState<VoicePrefs>(() => loadPrefs());
  const [heard, setHeard] = useState('');
  const [said, setSaid] = useState('');
  const [err, setErr] = useState('');
  const [hands, setHands] = useState(() => loadPrefs().hands);      // keep listening after each answer
  const bands = useRef<number[]>(new Array(WAVE_BANDS).fill(0)), pulse = useRef(0);
  const alive = useRef(true), awaiting = useRef(false), lastSpoken = useRef(reply?.id ?? ''), speaking = useRef<Speaking | null>(null);
  const stopListen = useRef<(() => void) | null>(null), prefsRef = useRef(prefs), handsRef = useRef(hands), phaseRef = useRef<Phase>('ready');
  prefsRef.current = prefs; handsRef.current = hands;
  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const level = (v: number) => { pulse.current = Math.max(pulse.current, Math.min(1, v)); };
  const spectrum = (b: number[]) => { bands.current = b; };

  const ears = serverVoice(settings) && canListen();
  const canHear = ears || browserListens();

  const beginRef = useRef<(() => void) | undefined>(undefined);
  const submit = useCallback((text: string) => {
    const t = text.trim(); if (!t) { beginRef.current?.(); return; }
    setHeard(t); setSaid(''); setErr(''); awaiting.current = true; go('thinking'); onSay(t);
  }, [onSay]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Listening is stopped early by a tap: for the real voice that is done by ending the recording.
  const stopRec = useRef<(() => void) | null>(null);
  const turnReal = useCallback(async () => {
    // A listen() that can be ended by a tap.
    const ctl = new AbortController(); stopRec.current = () => ctl.abort();
    if (!alive.current) return;
    setErr(''); go('listening'); level(0);
    try {
      const { blob } = await listen({ onLevel: level, onSpectrum: spectrum, signal: ctl.signal, waitMs: 20000 });
      if (!alive.current) return;
      if (!blob) { if (handsRef.current && phaseRef.current === 'listening') void begin(); else go('ready'); return; }
      go('working');
      const text = await transcribe(settings, blob, prefsRef.current.lang.slice(0, 2));
      if (!alive.current) return;
      if (!text) { if (handsRef.current) void begin(); else go('ready'); return; }
      submit(text);
    } catch (e) { if (alive.current) fallBack(e as Error); }
  }, [settings, submit]);   // eslint-disable-line react-hooks/exhaustive-deps

  const fallBack = (e: Error & { code?: string }) => {
    const m = e.message || 'Voice did not work.';
    if (browserListens() && !prefsRef.current.browser && (e.code === 'plan' || /voice|audio|could not|read/i.test(m))) {
      setErr(m + ' Using your browser\'s listening instead.'); const p = { ...prefsRef.current, browser: true }; setPrefs(p); savePrefs(p); prefsRef.current = p; void begin(); return;
    }
    setErr(m); go('paused');
  };
  const begin = useCallback(async () => {
    if (!alive.current) return;
    if (serverVoice(settings) && canListen() && !prefsRef.current.browser) { await turnReal(); return; }
    setErr(''); go('listening'); level(0.2);
    try {
      const b = browserListen(prefsRef.current.lang, (t) => { setHeard(t); level(1); }); stopListen.current = b.stop;
      const text = await b.result; if (!alive.current) return;
      if (!text.trim()) { if (handsRef.current && phaseRef.current === 'listening') void begin(); else go('ready'); return; }
      submit(text);
    } catch (e) { if (alive.current) fallBack(e as Error); }
  }, [settings, turnReal, submit]);   // eslint-disable-line react-hooks/exhaustive-deps
  beginRef.current = () => { void begin(); };

  useEffect(() => { alive.current = true; setVoiceActive(true); if (canHear) void begin(); else { setErr('This browser cannot listen. Try Chrome, Edge or Safari, or type instead.'); go('paused'); } return () => { alive.current = false; setVoiceActive(false); stopRec.current?.(); stopListen.current?.(); speaking.current?.stop(); }; }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  // When the answer is finished, say it.
  useEffect(() => {
    if (!awaiting.current || busy || !reply || reply.id === lastSpoken.current) return;
    lastSpoken.current = reply.id; awaiting.current = false;
    const spoken = reply.error ? 'Sorry, that did not work. Try asking again.' : reply.text;
    setSaid(forSpeech(reply.text).slice(0, 600) || (reply.error ? 'That did not work.' : ''));
    go('speaking'); level(0.35);
    const s = speak(settings, spoken, prefsRef.current, { onStart: () => level(0.8), onSpectrum: spectrum }); speaking.current = s;
    void s.done.then((r) => { if (!alive.current || speaking.current !== s) return; if (r.error && !r.fallback) setErr(r.error); speaking.current = null; if (handsRef.current) void begin(); else go('ready'); });
  }, [busy, reply?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (phase !== 'speaking') return; const t = window.setInterval(() => level(0.75), 250); return () => clearInterval(t); }, [phase]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase !== 'listening' && phase !== 'speaking') bands.current = new Array(WAVE_BANDS).fill(0); }, [phase]);

  const tap = () => {
    if (phase === 'listening') { stopRec.current?.(); stopListen.current?.(); }
    else if (phase === 'speaking') { speaking.current?.stop(); speaking.current = null; void begin(); }
    else if (phase === 'thinking') { onStopChat(); awaiting.current = false; void begin(); }
    else if (phase === 'ready' || phase === 'paused') void begin();
  };
  const set = (p: Partial<VoicePrefs>) => { const n = { ...prefs, ...p }; setPrefs(n); savePrefs(n); };

  const label = { ready: 'Tap the wave to talk', listening: 'Listening. Tap when you are done', working: 'Reading what you said…', thinking: 'Thinking. Tap to stop', speaking: 'Speaking. Tap to interrupt', paused: 'Tap the wave to talk' }[phase];
  return (
    <div className="cx-voice" role="dialog" aria-modal="true" aria-label="Voice mode">
      <div className="cx-voice-top">
        <b className="d"><UiIcon name="wave" size={18} />Voice</b>
        <span className="cx-grow" />
        <button type="button" className={`cx-mode${hands ? ' on' : ''}`} aria-pressed={hands} onClick={() => setHands(!hands)} title="Listen again after each answer"><UiIcon name="headset" size={15} />Keep listening</button>
        <button type="button" className="cx-mode" onClick={onSettings} title="Voice, speed, language and more"><UiIcon name="gear" size={15} />Voice settings</button>
        <button type="button" className="btn small" onClick={onClose}><UiIcon name="close" size={14} />End</button>
      </div>
      <div className="cx-voice-mid">
        <Wave phase={phase} bands={bands} pulse={pulse} onTap={tap} label={label} />
        <p className="d cx-voice-state" aria-live="polite">{label}</p>
        {heard && <p className="tx cx-voice-you"><span>You</span>{heard}</p>}
        {said && <p className="tx cx-voice-coe"><span>Coe</span>{said}</p>}
        {err && <p className="cx-voice-err" role="alert">{err}</p>}
        {prefs.browser && <p className="tx cx-voice-note">Using your browser&apos;s own voice. <button type="button" className="cx-act" onClick={() => set({ browser: false })}>Use Coe&apos;s voices</button></p>}
      </div>
    </div>
  );
}
