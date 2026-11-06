'use client';
/**
 * The PMC audio player: it replaces the browser's own grey player everywhere Coe plays a sound.
 * Play and pause, back and forward 10 seconds, a seek bar (a wave when the shape of the sound is known), speed, volume and an optional Save.
 * Only one player plays at a time, and it shows on the phone's lock screen through the Media Session when the browser supports it.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
const clock = (s: number) => (Number.isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');

export function PmcPlayer({ src, title, peaks, seconds, save, className = '' }: { src: string; title: string; peaks?: number[]; seconds?: number; save?: string; className?: string }) {
  const uid = useId(), au = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false), [now, setNow] = useState(0), [len, setLen] = useState(seconds ?? 0);
  const [vol, setVol] = useState(1), [muted, setMuted] = useState(false), [speed, setSpeed] = useState(1), [bad, setBad] = useState(false), [wait, setWait] = useState(false);
  const scrub = useRef(false);

  useEffect(() => {
    const a = au.current; if (!a) return;
    const length = () => { const d = a.duration; if (Number.isFinite(d) && d > 0) setLen(d); };
    const on = (n: string, f: () => void) => { a.addEventListener(n, f); return () => a.removeEventListener(n, f); };
    const off = [
      on('loadedmetadata', length), on('durationchange', length),
      on('timeupdate', () => { if (!scrub.current) setNow(a.currentTime); }),
      on('play', () => { setPlaying(true); window.dispatchEvent(new CustomEvent('pmc:coe-player', { detail: uid })); }),
      on('pause', () => setPlaying(false)),
      on('ended', () => { setPlaying(false); setNow(0); a.currentTime = 0; }),
      on('waiting', () => setWait(true)), on('playing', () => setWait(false)), on('canplay', () => setWait(false)),
      on('error', () => { setBad(true); setPlaying(false); }),
    ];
    const other = (e: Event) => { if ((e as CustomEvent).detail !== uid && !a.paused) a.pause(); };
    window.addEventListener('pmc:coe-player', other);
    return () => { off.forEach((f) => f()); window.removeEventListener('pmc:coe-player', other); };
  }, [uid]);

  // The lock screen and headphone buttons, where the browser has them.
  useEffect(() => {
    if (!playing || !('mediaSession' in navigator)) return;
    const a = au.current, m = navigator.mediaSession; if (!a) return;
    try {
      m.metadata = new MediaMetadata({ title, artist: 'Coe' });
      m.setActionHandler('play', () => void a.play()); m.setActionHandler('pause', () => a.pause());
      m.setActionHandler('seekbackward', () => { a.currentTime = Math.max(0, a.currentTime - 10); });
      m.setActionHandler('seekforward', () => { a.currentTime = Math.min(a.duration || 1e9, a.currentTime + 10); });
    } catch { /* not supported */ }
    return () => { try { ['play', 'pause', 'seekbackward', 'seekforward'].forEach((k) => m.setActionHandler(k as MediaSessionAction, null)); } catch { /* ignore */ } };
  }, [playing, title]);

  const toggle = () => { const a = au.current; if (!a) return; if (a.paused) void a.play().catch(() => setBad(true)); else a.pause(); };
  const jump = (by: number) => { const a = au.current; if (!a) return; const to = Math.max(0, Math.min(Number.isFinite(a.duration) ? a.duration : 1e9, a.currentTime + by)); a.currentTime = to; setNow(to); };
  const seek = (v: number) => { const a = au.current; if (!a) return; a.currentTime = v; setNow(v); };
  const faster = () => { const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; setSpeed(next); if (au.current) au.current.playbackRate = next; };
  const loud = (v: number) => { setVol(v); setMuted(v === 0); if (au.current) { au.current.volume = v; au.current.muted = v === 0; } };
  const hush = () => { const m = !muted; setMuted(m); if (au.current) au.current.muted = m; };

  const known = len > 0 && Number.isFinite(len), at = known ? Math.min(1, now / len) : 0;
  const bars = peaks && peaks.length ? peaks : null;

  if (bad) return <div className={`pmp bad ${className}`} role="alert"><UiIcon name="alert" size={18} /><span className="tx">{title} could not be played here.</span>{save && <a className="pmp-b" href={src} download={save}><UiIcon name="download" size={16} />Save</a>}</div>;

  return (
    <div className={`pmp${playing ? ' on' : ''}${wait ? ' wait' : ''} ${className}`} role="group" aria-label={`Player for ${title}`}>
      <audio ref={au} src={src} preload="metadata" />
      <div className="pmp-top">
        <button type="button" className="pmp-go" onClick={toggle} aria-label={playing ? `Pause ${title}` : `Play ${title}`}><UiIcon name={playing ? 'pause' : 'play'} size={26} strokeWidth={playing ? 4 : 3} /></button>
        <div className="pmp-meta">
          <span className="pmp-name d" title={title}>{title}</span>
          <span className="pmp-row"><span className="pmp-eq" aria-hidden><i /><i /><i /><i /></span><output className="pmp-time" htmlFor={`${uid}-s`}>{clock(now)} / {clock(len)}</output></span>
        </div>
      </div>
      <div className={`pmp-seek${bars ? ' wave' : ''}`} style={{ ['--p' as string]: `${at * 100}%` }}>
        {bars && <div className="pmp-bars" aria-hidden>{bars.map((h, i) => <i key={i} className={(i + 0.5) / bars.length <= at ? 'on' : ''} style={{ height: `${Math.round(h * 100)}%` }} />)}</div>}
        {bars && <i className="pmp-head" aria-hidden />}
        <input id={`${uid}-s`} type="range" className={bars ? 'pmp-range' : 'sld-in'} min={0} max={known ? len : 1} step={0.1} value={known ? Math.min(now, len) : 0} disabled={!known} aria-label="Position" aria-valuetext={`${clock(now)} of ${clock(len)}`}
          style={{ ['--p' as string]: `${at * 100}%` }}
          onPointerDown={() => { scrub.current = true; }} onPointerUp={() => { scrub.current = false; }} onBlur={() => { scrub.current = false; }}
          onChange={(e) => seek(Number(e.target.value))} />
      </div>
      <div className="pmp-bar">
        <button type="button" className="pmp-b" onClick={() => jump(-10)} aria-label="Back 10 seconds"><UiIcon name="rewind" size={17} /><span>10</span></button>
        <button type="button" className="pmp-b" onClick={() => jump(10)} aria-label="Forward 10 seconds"><span>10</span><UiIcon name="fast" size={17} /></button>
        <button type="button" className="pmp-b" onClick={faster} aria-label={`Speed ${speed} times. Press for the next speed`}><span>{speed}×</span></button>
        <span className="pmp-vol"><button type="button" className="pmp-b" onClick={hush} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'}><UiIcon name={muted || vol === 0 ? 'mute' : 'volume'} size={18} /></button>
          <input type="range" className="sld-in pmp-vr" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label="Volume" style={{ ['--p' as string]: `${(muted ? 0 : vol) * 100}%` }} onChange={(e) => loud(Number(e.target.value))} /></span>
        {save && <a className="pmp-b save" href={src} download={save}><UiIcon name="download" size={16} /><span>Save</span></a>}
      </div>
    </div>
  );
}
