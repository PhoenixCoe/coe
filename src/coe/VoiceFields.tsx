'use client';
/** Voice typing options. Coe does not speak back, so there are no voices to pick. */
import { useState } from 'react';
import { Row, Select, Switch } from '@/ui/Controls';
import { loadPrefs, savePrefs, type VoicePrefs } from '@/lib/coe/voice';

export const LANGS = [
  ['', 'Work it out'], ['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'], ['pt-PT', 'Portuguese'],
  ['pl-PL', 'Polish'], ['ro-RO', 'Romanian'], ['ar-SA', 'Arabic'], ['hi-IN', 'Hindi'], ['zh-CN', 'Chinese'], ['ja-JP', 'Japanese'],
] as const;

export function VoiceFields() {
  const [p, setP] = useState<VoicePrefs>(() => loadPrefs());
  const set = (patch: Partial<VoicePrefs>) => { const n = { ...p, ...patch }; setP(n); savePrefs(n); };
  return (
    <div className="set-list">
      <Row label="I speak" icon="language" hint="Helps Coe hear you correctly when you dictate with the microphone button.">
        <Select label="Language I speak" value={p.lang} onChange={(lang) => set({ lang })} options={LANGS.map(([value, label]) => ({ value, label }))} />
      </Row>
      <Switch icon="globe" label="Use my browser's listening" hint="Free and unlimited, but less accurate. Used automatically if Coe's listening can't be reached." on={p.browser} onChange={(browser) => set({ browser })} />
    </div>
  );
}
