'use client';
/** The Sound lab: drop in a sound and see what can be measured, ask Coe to name what it hears, split it by pitch range, or talk about it in the chat. */
import { useEffect, useRef, useState } from 'react';
import { Slider } from '@/ui/Controls';
import { UiIcon } from '@/ui/icons';
import { PmcPlayer } from '@/ui/Player';
import { Modal } from './Panels';
import { serverVoice } from '@/lib/coe/voice';
import { analyseSound, describeHeard, describeSound, hearSound, peaksOf, sliceForHearing, splitByPitch, type Heard, type SoundReport } from '@/lib/coe/hear';
import type { CoeSettings } from '@/lib/coe/settings';
import type { Attach } from './store';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function SoundLab({ settings, onClose, onAttach }: { settings: CoeSettings; onClose: () => void; onAttach: (a: Attach) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [rep, setRep] = useState<SoundReport | null>(null);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [parts, setParts] = useState<{ name: string; label: string; url: string; peaks?: number[] }[]>([]);
  const [play, setPlay] = useState<{ url: string; peaks?: number[] } | null>(null);
  const [from, setFrom] = useState(0);
  const [work, setWork] = useState('');
  const [err, setErr] = useState('');
  const pick = useRef<HTMLInputElement>(null);
  useEffect(() => () => parts.forEach((p) => URL.revokeObjectURL(p.url)), [parts]);
  useEffect(() => () => { if (play) URL.revokeObjectURL(play.url); }, [play]);

  const open = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 25e6) { setFile(f); setRep(null); setErr(`${f.name} is bigger than 25 MB. Try a shorter piece.`); return; }
    setFile(f); setRep(null); setHeard(null); setParts([]); setPlay(null); setErr(''); setFrom(0); setWork('Opening the sound…');
    try { setRep(await analyseSound(f, setWork)); setPlay({ url: URL.createObjectURL(f), peaks: await peaksOf(f, 72).catch(() => undefined) }); } catch { setErr(`${f.name} could not be opened. Try mp3, m4a, wav or webm.`); }
    setWork('');
  };
  const listen = async () => {
    if (!file) return; setErr(''); setWork('Cutting out the part to listen to…');
    try { const { wav } = await sliceForHearing(file, from); setWork('Coe is listening…'); setHeard(await hearSound(settings, wav)); }
    catch (e) { setErr((e as Error).message || 'Coe could not listen to that.'); }
    setWork('');
  };
  const split = async () => {
    if (!file) return; setErr(''); setWork('Splitting…');
    try { const cut = await splitByPitch(file, setWork); setParts(await Promise.all(cut.map(async (p) => ({ name: p.name, label: p.label, url: URL.createObjectURL(p.blob), peaks: await peaksOf(p.blob, 56).catch(() => undefined) })))); }
    catch { setErr('That could not be split.'); }
    setWork('');
  };
  const attach = () => {
    if (!file || !rep) return;
    const text = `Sound file "${file.name}"\n\n${describeSound(rep)}${heard ? '\n\n' + describeHeard(heard) : ''}`;
    onAttach({ name: file.name, kind: 'Sound', chars: text.length, text, note: clock(rep.seconds) + ' long' }); onClose();
  };
  const ears = serverVoice(settings);
  const peak = rep ? Math.max(...rep.timeline) : 0, floor = rep ? Math.min(...rep.timeline, peak - 6) : 0;

  return (
    <Modal title="Sound lab" onClose={onClose} wide>
      <div className="snd">
        <p className="tx">Drop in a recording or a song. Coe measures it right here on your device, and can listen to 30 seconds of it to name the instruments and noises it hears.</p>
        <input ref={pick} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac,.webm" hidden onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="snd-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void open(e.dataTransfer.files?.[0]); }}>
          <UiIcon name="wave" size={26} />
          <span className="tx">{file ? <b>{file.name}</b> : 'Drop a sound here'}</span>
          <button type="button" className="btn small gold" onClick={() => pick.current?.click()}><UiIcon name="attach" size={15} />{file ? 'Choose another' : 'Choose a sound'}</button>
        </div>
        {work && <p className="tx snd-work" role="status"><i className="snd-spin" aria-hidden />{work}</p>}
        {err && <p className="cx-warn tx" role="alert">{err}</p>}

        {rep && (
          <>
            <div className="snd-tiles">
              <div className="snd-t"><span className="tx">Tempo</span><b className="d">{rep.bpm ? `${rep.bpm} BPM` : 'No beat'}</b><i className="tx">{rep.beat === 'steady' ? 'steady' : rep.beat === 'loose' ? 'loose' : ''}</i></div>
              <div className="snd-t"><span className="tx">Key</span><b className="d">{rep.key ?? 'Unclear'}</b><i className="tx">{rep.notes.length ? `notes ${rep.notes.join(' ')}` : ''}</i></div>
              <div className="snd-t"><span className="tx">Loudness</span><b className="d">{rep.loudnessDb} dB</b><i className="tx">peak {rep.peakDb} dB</i></div>
              <div className="snd-t"><span className="tx">Length</span><b className="d">{clock(rep.seconds)}</b><i className="tx">{rep.silencePct}% silence</i></div>
            </div>
            <div className="snd-bal" role="img" aria-label={`${rep.bands.low}% bass, ${rep.bands.mid}% middle, ${rep.bands.high}% treble`}>
              <i style={{ flexGrow: Math.max(1, rep.bands.low) }}>Bass {rep.bands.low}%</i><i style={{ flexGrow: Math.max(1, rep.bands.mid) }}>Middle {rep.bands.mid}%</i><i style={{ flexGrow: Math.max(1, rep.bands.high) }}>Treble {rep.bands.high}%</i>
            </div>
            <div className="snd-tl" role="img" aria-label="Loudness over time">{rep.timeline.map((d, i) => <i key={i} style={{ height: `${10 + (90 * (d - floor)) / Math.max(1, peak - floor)}%` }} />)}</div>
            {play && <PmcPlayer src={play.url} title={file?.name ?? 'Your sound'} peaks={play.peaks} seconds={rep.seconds} />}
            <p className="tx">It sounds like <b>{rep.character}</b>, and the balance is {rep.balance}.</p>

            <div className="snd-act">
              <b className="d"><UiIcon name="headphones" size={17} />What is in it?</b>
              {rep.seconds > 31 && <Slider label="Listen from" value={from} min={0} max={Math.max(1, Math.floor(rep.seconds - 30))} step={1} onChange={setFrom} format={(n) => `${clock(n)} to ${clock(Math.min(rep.seconds, n + 30))}`} />}
              <button type="button" className="btn small gold" disabled={!!work || !ears} onClick={() => void listen()}><UiIcon name="headset" size={15} />Ask Coe to listen</button>
              <p className="tx cx-small">{ears ? 'Uses one of your daily sound listens (3 on Free, 60 on Pro). Only the 30 seconds are sent. What it names is a guess from an AI, so treat it as a good hint, not a fact.' : 'This needs Coe\'s server. Open Settings to set it up.'}</p>
              {heard && (
                <div className="snd-heard">
                  {heard.summary && <p className="tx"><b>{heard.summary}</b></p>}
                  {!!heard.instruments?.length && <ul className="snd-chips" aria-label="Instruments">{heard.instruments.map((i, k) => <li key={k} className={i.confidence === 'high' ? 'hi' : i.confidence === 'low' ? 'lo' : ''}><UiIcon name="note" size={13} />{i.name}{i.confidence && <em>{i.confidence}</em>}</li>)}</ul>}
                  {!!heard.voices?.length && <p className="tx"><b className="d">Voices </b>{heard.voices.join('; ')}</p>}
                  {!!heard.noises?.length && <p className="tx"><b className="d">Noises </b>{heard.noises.join('; ')}</p>}
                  {heard.setting && <p className="tx"><b className="d">Setting </b>{heard.setting}</p>}
                  {heard.notes && <p className="tx cx-small">{heard.notes}</p>}
                </div>
              )}
            </div>

            <div className="snd-act">
              <b className="d"><UiIcon name="layers" size={17} />Split by pitch range</b>
              <p className="tx cx-small">Filters the sound into low, middle and high. It helps you hear the bass or the cymbals on their own, but it is not real instrument separation.</p>
              {!parts.length ? <button type="button" className="btn small" disabled={!!work} onClick={() => void split()}><UiIcon name="wand" size={15} />Split it</button>
                : <ul className="snd-parts">{parts.map((p) => <li key={p.name}><PmcPlayer src={p.url} title={p.label} peaks={p.peaks} seconds={rep.seconds} save={`${file?.name.replace(/\.[^.]+$/, '') ?? 'sound'}-${p.name}.wav`} /></li>)}</ul>}
            </div>
            <div className="cx-actions"><button type="button" className="btn gold" onClick={attach}><UiIcon name="chat" size={16} />Talk about it with Coe</button></div>
          </>
        )}
      </div>
    </Modal>
  );
}
