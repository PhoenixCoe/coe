'use client';
/** Every voice option, in one place. Settings > Voice shows this; the voice screen itself has none, so it stays clear. */
import { useEffect, useRef, useState } from 'react';
import { Row, Select, Slider, Switch } from '@/ui/Controls';
import { UiIcon } from '@/ui/icons';
import { STYLES, VOICES, loadPrefs, savePrefs, speak, type Speaking, type VoicePrefs } from '@/lib/coe/voice';
import type { CoeSettings } from '@/lib/coe/settings';

export const LANGS = [
  ['', 'Work it out'], ['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'], ['pt-PT', 'Portuguese'],
  ['pl-PL', 'Polish'], ['ro-RO', 'Romanian'], ['ar-SA', 'Arabic'], ['hi-IN', 'Hindi'], ['zh-CN', 'Chinese'], ['ja-JP', 'Japanese'],
] as const;

export function VoiceFields({ settings }: { settings: CoeSettings }) {
  const [p, setP] = useState<VoicePrefs>(() => loadPrefs());
  const [err, setErr] = useState('');
  const talk = useRef<Speaking | null>(null);
  useEffect(() => () => talk.current?.stop(), []);
  const set = (patch: Partial<VoicePrefs>) => { const n = { ...p, ...patch }; setP(n); savePrefs(n); };
  const hear = () => { talk.current?.stop(); setErr(''); const s = speak(settings, 'Hi, I\'m Coe. This is how I sound.', p); talk.current = s; void s.done.then((r) => { if (r.error) setErr(r.error); }); };
  return (
    <div className="set-list">
      <Row label="Voice" icon="volume" hint="The voice Coe speaks with.">
        <Select label="Voice" value={p.voice} onChange={(voice) => set({ voice, browser: false })} options={VOICES.map((v) => ({ value: v.id, label: v.name, hint: v.note }))} />
      </Row>
      <Row label="Style" icon="wand" hint="How the voice performs.">
        <Select label="Style" value={p.style} onChange={(style) => set({ style })} options={STYLES.map((v) => ({ value: v.id, label: v.name }))} />
      </Row>
      <Row label="Speed" icon="timer" wide>
        <Slider hideLabel label="Speed" value={p.speed} min={0.7} max={1.4} step={0.05} onChange={(speed) => set({ speed })} format={(n) => `${n.toFixed(2)}×`} marks={[{ value: 0.7, label: 'Slow' }, { value: 1, label: 'Normal' }, { value: 1.4, label: 'Fast' }]} />
      </Row>
      <Row label="I speak" icon="language" hint="Helps Coe hear you correctly.">
        <Select label="Language I speak" value={p.lang} onChange={(lang) => set({ lang })} options={LANGS.map(([value, label]) => ({ value, label }))} />
      </Row>
      <Switch icon="headset" label="Keep listening" hint="In voice mode, listen again after each answer, with no tapping." on={p.hands} onChange={(hands) => set({ hands })} />
      <Switch icon="volume" label="Read answers aloud" hint="Say every answer out loud in normal chat too." on={p.auto} onChange={(auto) => set({ auto })} />
      <Switch icon="globe" label="Use my browser's voice" hint="Free and unlimited, but less natural. Used automatically if Coe's voices can't be reached." on={p.browser} onChange={(browser) => set({ browser })} />
      <div className="cx-actions"><button type="button" className="btn small" onClick={hear}><UiIcon name="play" size={15} />Hear it</button>{err && <span className="tx cx-small" role="alert">{err}</span>}</div>
    </div>
  );
}
