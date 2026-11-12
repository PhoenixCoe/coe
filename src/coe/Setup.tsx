'use client';
import { useEffect, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { CoeStar } from '@/ui/Mark';
import { AGE_OPTIONS, ROLE_OPTIONS, levelWords } from '@/lib/coe/profile';
import { deviceScale, markMet, type CoeSettings } from '@/lib/coe/settings';
import { cloudOn, noteAccountMet, session } from '@/lib/coe/cloud';
import { ACCENTS, LEADS, THEMES, fitAccent, loadAccent, loadLead, setAccent, setTheme } from '@/lib/coe/look';

type Step = 'hi' | 'name' | 'age' | 'role' | 'about' | 'look' | 'feel' | 'style' | 'done';
const STEPS: Step[] = ['hi', 'name', 'age', 'role', 'about', 'look', 'feel', 'style', 'done'];
const ASKS = 7;
/** "Normal" is the size that suits this device (smaller on a phone or tablet); Large and Extra large are steps up from it. */
const sizes = (): [number, string][] => { const n = deviceScale(), up = (k: number) => Math.round((n * k) / 5) * 5; return [[n, 'Normal'], [up(1.15), 'Large'], [up(1.3), 'Extra large']]; };
const MOTIONS: [CoeSettings['motion'], string][] = [['full', 'Full'], ['calm', 'Calm'], ['off', 'Off']];
const LENGTHS: [CoeSettings['length'], string][] = [['short', 'Short'], ['balanced', 'Normal'], ['detailed', 'Detailed']];
const TONES: [CoeSettings['tone'], string][] = [['friendly', 'Friendly'], ['neutral', 'Neutral'], ['formal', 'Formal'], ['playful', 'Playful']];
type RIcon = Parameters<typeof UiIcon>[0]['name'];
const ROLE_ICON: Record<string, RIcon> = { student: 'graduate', teacher: 'book', parent: 'users', working: 'folder', other: 'sparkle' };

const Tile = ({ on, onPick, icon, children, first }: { on: boolean; onPick: () => void; icon?: RIcon; children: string; first?: boolean }) => (
  <button type="button" role="radio" aria-checked={on} data-first={first ? '' : undefined} className={`su-tile${on ? ' on' : ''}`} onClick={onPick}>
    {icon && <span className="su-ti" aria-hidden><UiIcon name={icon} size={24} strokeWidth={2.4} /></span>}<b className="d">{children}</b>
    <span className="su-ck" aria-hidden>{on && <UiIcon name="check" size={16} strokeWidth={3.4} />}</span>
  </button>
);

const ThemeCard = ({ t, on, pick, first }: { t: (typeof THEMES)[number]; on: boolean; pick: () => void; first?: boolean }) => {
  const L = LEADS.find((l) => l.id === t.lead)!;
  return (
    <button type="button" role="radio" aria-checked={on} data-first={first ? '' : undefined} className={`su-th${on ? ' on' : ''}`} onClick={pick}>
      <span className="su-pv" style={{ background: L.page, borderColor: L.edge }} aria-hidden><i style={{ background: fitAccent(t.accent) }} /><b style={{ background: L.edge, opacity: 0.85 }} /><b style={{ background: L.edge, opacity: 0.4, width: '40%' }} /></span>
      <b className="d">{t.name}</b>
    </button>
  );
};

/** The first time Coe opens: a short run of full screens, one question each. Every question can be skipped, and the answers follow the account to other devices and to Coe Mini. */
export function Setup({ s, save, onClose }: { s: CoeSettings; save: (patch: Partial<CoeSettings>) => void; onClose: () => void }) {
  const [i, setI] = useState(0), [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [name, setName] = useState(s.name), [ageBand, setAge] = useState<CoeSettings['ageBand']>(s.ageBand), [role, setRole] = useState<CoeSettings['role']>(s.role);
  const [yearOrJob, setYear] = useState(s.yearOrJob), [subjects, setSubj] = useState(s.subjects);
  const [length, setLength] = useState<CoeSettings['length']>(s.length), [tone, setTone] = useState<CoeSettings['tone']>(s.tone);
  const [scale, setScale] = useState(s.scale), [motion, setMotion] = useState<CoeSettings['motion']>(s.motion);
  const [, look] = useState(0);   // the page colour and accent are kept by the look module; this just redraws
  const root = useRef<HTMLDivElement>(null);
  const step = STEPS[i];
  const patch = (): Partial<CoeSettings> => ({ name: name.trim().slice(0, 30), ageBand, role, yearOrJob: yearOrJob.trim().slice(0, 60), subjects: subjects.trim().slice(0, 100), length, tone });
  const finish = () => { const u = cloudOn ? session()?.uid : undefined; markMet(u || '1'); if (u) noteAccountMet(); save(patch()); onClose(); };
  const go = (to: number, d: 'fwd' | 'back') => { setDir(d); setI(Math.max(0, Math.min(STEPS.length - 1, to))); };
  const next = () => (step === 'done' ? finish() : go(i + 1, 'fwd'));
  const back = () => go(i - 1, 'back');

  // Keep the keyboard inside the setup screens, and start each screen on its first control.
  useEffect(() => { const t = window.setTimeout(() => root.current?.querySelector<HTMLElement>('[data-first]')?.focus({ preventScroll: true }), 60); return () => window.clearTimeout(t); }, [i]);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !root.current) return;
      const f = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const a = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (a === f[0] || !root.current.contains(a))) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (a === f[f.length - 1] || !root.current.contains(a))) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', key); };
  }, []);

  const filled = step === 'name' ? !!name.trim() : step === 'age' ? !!ageBand : step === 'role' ? !!role : step === 'about' ? !!(yearOrJob.trim() || subjects.trim()) : true;   // the look, feel and style screens always have a choice on them
  const label = step === 'hi' ? 'Let’s go' : step === 'done' ? 'Start chatting' : filled ? 'Next' : 'Skip this one';
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); next(); } };
  const ageLabel = AGE_OPTIONS.find((o) => o.value === ageBand)?.label, roleLabel = ROLE_OPTIONS.find((o) => o.value === role)?.label;
  const mark = [name.trim(), ageBand ? ageLabel : '', role ? roleLabel : '', yearOrJob.trim(), subjects.trim()].filter(Boolean);
  const signed = !!session();
  const q = i - 1;   // 0..3 for the four questions

  return (
    <div ref={root} className="su" role="dialog" aria-modal="true" aria-label="Set up Coe">
      <i className="ht" aria-hidden><i /><i /><i /></i>
      <header className="su-isl">
        <span className="isl-b isl-t d"><CoeStar size={22} /></span>
        <h2 className="isl-title d">Setup</h2>
        {q >= 0 && q < ASKS && <span className="isl-b isl-t d" aria-live="polite">{q + 1} of {ASKS}</span>}
        {step !== 'done' && <button type="button" className="isl-b isl-t d" onClick={finish} title="Leave setup. Anything you entered is kept.">Skip setup</button>}
      </header>
      <ol className="su-prog" aria-hidden style={{ width: `min(${ASKS * 56}px, 100%)` }}>{Array.from({ length: ASKS }, (_, n) => <li key={n} className={n < q ? 'done' : n === q ? 'now' : ''} />)}</ol>

      <main className={`su-main ${dir}`} key={step}>
        {step === 'hi' && <>
          <div className="su-star"><CoeStar size={150} spin /></div>
          <h1 className="su-h d">Hi. I’m Coe.</h1>
          <p className="su-p tx">A few quick questions so I can help you better. It takes a minute. Skip any you like, and change them later in Settings.</p>
        </>}
        {step === 'name' && <>
          <h1 className="su-h d">What should I call you?</h1>
          <input data-first className="su-field d" type="text" maxLength={30} value={name} placeholder="Your first name" autoComplete="off" aria-label="Your first name" onChange={(e) => setName(e.target.value)} onKeyDown={enter} />
          <p className="su-p tx">A first name is plenty. I use it in the greeting.</p>
        </>}
        {step === 'age' && <>
          <h1 className="su-h d">How old are you?</h1>
          <div className="su-grid" role="radiogroup" aria-label="Your age group">
            {AGE_OPTIONS.filter((o) => o.value).map((o, n) => <Tile key={o.value} first={n === 0} on={ageBand === o.value} onPick={() => setAge(ageBand === o.value ? '' : o.value)}>{o.label}</Tile>)}
          </div>
          <p className="pn-info tx"><span className="pn-i" aria-hidden><UiIcon name="tip" size={15} strokeWidth={3.2} /></span><span>Only used to pick the right words for you. Never sold or used for ads. You can leave it empty.</span></p>
        </>}
        {step === 'role' && <>
          <h1 className="su-h d">What best fits you?</h1>
          <div className="su-grid" role="radiogroup" aria-label="What best fits you">
            {ROLE_OPTIONS.filter((o) => o.value).map((o, n) => <Tile key={o.value} first={n === 0} icon={ROLE_ICON[o.value]} on={role === o.value} onPick={() => setRole(role === o.value ? '' : o.value)}>{o.label}</Tile>)}
          </div>
        </>}
        {step === 'about' && <>
          <h1 className="su-h d">A little more about you.</h1>
          <div className="su-fields">
            <label className="su-l"><span className="d">{levelWords(role)[0]}</span><input data-first className="su-field sm d" type="text" maxLength={60} value={yearOrJob} placeholder={levelWords(role)[1]} autoComplete="off" onChange={(e) => setYear(e.target.value)} onKeyDown={enter} /></label>
            <label className="su-l"><span className="d">What you study or work on</span><input className="su-field sm d" type="text" maxLength={100} value={subjects} placeholder="Maths, science, music" autoComplete="off" onChange={(e) => setSubj(e.target.value)} onKeyDown={enter} /></label>
          </div>
        </>}
        {step === 'look' && <>
          <h1 className="su-h d">Pick a look.</h1>
          <div className="su-themes" role="radiogroup" aria-label="Theme">
            {THEMES.map((t, n) => <ThemeCard key={t.id} t={t} first={n === 0} on={loadLead() === t.lead && loadAccent().toLowerCase() === fitAccent(t.accent)} pick={() => { setTheme(t); look((x) => x + 1); }} />)}
          </div>
          <div className="su-acc" role="group" aria-label="Accent colour">
            <span className="su-gl d">Or just the colour</span>
            <div className="su-dots">{ACCENTS.map((a) => { const on = loadAccent().toLowerCase() === a.hex.toLowerCase(); return <button key={a.id} type="button" className={`su-dot${on ? ' on' : ''}`} style={{ background: a.hex }} aria-label={a.name} aria-pressed={on} title={a.name} onClick={() => { setAccent(a.hex); look((x) => x + 1); }}>{on && <UiIcon name="check" size={16} strokeWidth={3.4} />}</button>; })}</div>
          </div>
        </>}
        {step === 'feel' && <>
          <h1 className="su-h d">Make it comfortable.</h1>
          <div className="su-grp"><span className="su-gl d">Text size</span>
            <div className="su-grid sm" role="radiogroup" aria-label="Text size">{sizes().map(([v, l], n) => <Tile key={v} first={n === 0} on={scale === v} onPick={() => { setScale(v); save({ scale: v, autoScale: n === 0 }); }}>{l}</Tile>)}</div></div>
          <div className="su-grp"><span className="su-gl d">Animation</span>
            <div className="su-grid sm" role="radiogroup" aria-label="Animation">{MOTIONS.map(([v, l]) => <Tile key={v} on={motion === v} onPick={() => { setMotion(v); save({ motion: v }); }}>{l}</Tile>)}</div></div>
        </>}
        {step === 'style' && <>
          <h1 className="su-h d">How should I answer?</h1>
          <div className="su-grp"><span className="su-gl d">Answers are</span>
            <div className="su-grid sm" role="radiogroup" aria-label="Answer length">{LENGTHS.map(([v, l], n) => <Tile key={v} first={n === 0} on={length === v} onPick={() => setLength(v)}>{l}</Tile>)}</div></div>
          <div className="su-grp"><span className="su-gl d">I sound</span>
            <div className="su-grid sm" role="radiogroup" aria-label="Tone">{TONES.map(([v, l]) => <Tile key={v} on={tone === v} onPick={() => setTone(v)}>{l}</Tile>)}</div></div>
        </>}
        {step === 'done' && <>
          <div className="su-star"><CoeStar size={120} /></div>
          <h1 className="su-h d">{name.trim() ? `Nice to meet you, ${name.trim()}.` : 'All set.'}</h1>
          {mark.length > 0
            ? <ul className="su-chips" aria-label="What you told me">{mark.map((m, n) => <li key={n} className="d" style={{ animationDelay: `${0.1 + n * 0.07}s` }}>{m}</li>)}</ul>
            : <p className="su-p tx">No worries, you skipped it all. You can add it any time in Settings, under About you.</p>}
          <p className="pn-info tx"><span className="pn-i" aria-hidden><UiIcon name="tip" size={15} strokeWidth={3.2} /></span><span>{signed ? 'Saved to your account, so your other devices and Coe Mini already know this.' : cloudOn ? 'Sign in any time to keep this on every device and in Coe Mini.' : 'Saved on this device.'}</span></p>
        </>}
      </main>

      <footer className="su-nav">
        {i > 0 ? <button type="button" className="btn su-back" onClick={back}><UiIcon name="left" size={18} />Back</button> : <span />}
        <button type="button" data-first={step === 'hi' || step === 'done' ? '' : undefined} className={`btn primary su-next${step !== 'hi' && step !== 'done' && !filled ? ' quiet' : ''}`} onClick={next}>{label}<UiIcon name="right" size={18} /></button>
      </footer>
    </div>
  );
}
