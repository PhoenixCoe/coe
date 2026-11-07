'use client';
/** The look, chat, learn and about tabs of Settings. Every option here is wired to something real. */
import { useEffect, useState } from 'react';
import { Row, Select, Slider, Switch } from '@/ui/Controls';
import { UiIcon } from '@/ui/icons';
import { LEADS, loadLead, setLead, setSfx, sfxOn, type Lead } from '@/lib/coe/look';
import { DEFAULTS, type CoeSettings } from '@/lib/coe/settings';
import { FEATURES, FEATURE_GROUPS, type FeaturePlan } from '@/lib/coe/features';
import { loadSettings } from '@/lib/coe/settings';
import { EXT_FILE, useExtension } from '@/lib/coe/extension';
import { mailtoFeedback, sendFeedback, type FeedbackKind } from '@/lib/coe/feedback';

type Up = (patch: Partial<CoeSettings>) => void;
type Icon = Parameters<typeof UiIcon>[0]['name'];

export function LookTab({ s, up }: { s: CoeSettings; up: Up }) {
  const [lead, setL] = useState<Lead>('cream'), [snd, setSnd] = useState(false);
  useEffect(() => { const f = () => { setL(loadLead()); setSnd(sfxOn()); }; f(); window.addEventListener('pmc:coe-look', f); return () => window.removeEventListener('pmc:coe-look', f); }, []);
  return (
    <div className="set-list">
      <Row label="Colour" icon="theme" hint="Which colour leads the whole page.">
        <Select label="Colour" value={lead} onChange={(v) => setLead(v)} options={LEADS.map((l) => ({ value: l.id, label: l.name, hint: l.blurb }))} />
      </Row>
      <Row label="Text size" icon="text" wide>
        <Slider hideLabel label="Text size" value={s.scale} min={80} max={150} step={5} onChange={(scale) => up({ scale })} format={(n) => `${n}%`}
          marks={[{ value: 80, label: 'Small' }, { value: 100, label: 'Normal' }, { value: 125, label: 'Large' }, { value: 150, label: 'Huge' }]} />
      </Row>
      <Row label="Animations" icon="play" hint="Slow or stop the movement across Coe.">
        <Select label="Animations" value={s.motion} onChange={(motion) => up({ motion })} options={[
          { value: 'full', label: 'Full', hint: 'Everything moves' }, { value: 'calm', label: 'Calm', hint: 'Only small movements' }, { value: 'off', label: 'Off', hint: 'Nothing moves' }]} />
      </Row>
      <Row label="Spacing" icon="panel" hint="How tight or roomy the page feels.">
        <Select label="Spacing" value={s.easy ? 'easy' : s.compact ? 'compact' : 'normal'} onChange={(v) => up({ compact: v === 'compact', easy: v === 'easy' })} options={[
          { value: 'compact', label: 'Compact', hint: 'More fits on screen' }, { value: 'normal', label: 'Normal' }, { value: 'easy', label: 'Roomy', hint: 'Bigger buttons, easier to tap' }]} />
      </Row>
      <Switch icon="access" label="High contrast" hint="Stronger text and borders." on={s.contrast} onChange={(contrast) => up({ contrast })} />
      <Switch icon="volume" label="Click sounds" hint="Soft sounds when you send and when Coe finishes." on={snd} onChange={(v) => setSfx(v)} />
      <Row label="Enter key" icon="keyboard" hint="What pressing Enter does in the message box.">
        <Select label="Enter key" value={s.enter} onChange={(enter) => up({ enter })} options={[{ value: 'send', label: 'Sends the message', hint: 'Shift+Enter adds a line' }, { value: 'newline', label: 'Adds a line', hint: 'Ctrl+Enter sends' }]} />
      </Row>
      <div className="cx-actions"><button type="button" className="btn small" onClick={() => up({ scale: DEFAULTS.scale, motion: DEFAULTS.motion, compact: false, easy: false, contrast: false })}><UiIcon name="refresh" size={15} />Reset the look</button></div>
    </div>
  );
}

export function ChatTab({ s, up }: { s: CoeSettings; up: Up }) {
  return (
    <div className="set-list">
      <div className="cx-fr"><label className="label" htmlFor="cx-name">What should Coe call you?</label>
        <input id="cx-name" className="cx-in" type="text" maxLength={30} value={s.name} placeholder="Your first name" autoComplete="off" onChange={(e) => up({ name: e.target.value })} /></div>
      <div className="cx-fr"><label className="label" htmlFor="cx-sys">Standing instructions</label>
        <textarea id="cx-sys" className="cx-in tall" rows={4} value={s.system} placeholder="For example: Keep answers short. I am learning to code." onChange={(e) => up({ system: e.target.value })} /></div>
      <Row label="Answer length" icon="list" hint="Unless you ask for something else in a message.">
        <Select label="Answer length" value={s.length} onChange={(length) => up({ length })} options={[{ value: 'short', label: 'Short', hint: 'The answer, then only what is needed' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed', hint: 'Reasons, steps and examples' }]} />
      </Row>
      <Row label="Word limit" icon="list" hint="The longest a reply may be.">
        <Select label="Word limit" value={String(s.maxWords)} onChange={(v) => up({ maxWords: Number(v) })} options={[{ value: '0', label: 'No limit' }, { value: '100', label: '100 words' }, { value: '250', label: '250 words' }, { value: '500', label: '500 words' }]} />
      </Row>
      <Row label="Tone" icon="chat" hint="How Coe sounds.">
        <Select label="Tone" value={s.tone} onChange={(tone) => up({ tone })} options={[{ value: 'friendly', label: 'Friendly' }, { value: 'neutral', label: 'Neutral' }, { value: 'formal', label: 'Formal' }, { value: 'playful', label: 'Playful' }]} />
      </Row>
      <Row label="Checking its work" icon="check" hint="Coe re-reads an answer and fixes mistakes before you see it. Each check uses a few tokens.">
        <Select label="Checking its own work" value={s.check} onChange={(check) => up({ check })} options={[{ value: 'off', label: 'Off' }, { value: 'smart', label: 'Smart', hint: 'Only when it matters' }, { value: 'always', label: 'Always' }]} />
      </Row>
      <Row label="While Coe is busy" icon="list" hint="What a new message does if Coe is still answering.">
        <Select label="Sending while Coe is busy" value={s.whileBusy} onChange={(whileBusy) => up({ whileBusy })} options={[{ value: 'queue', label: 'Wait in line', hint: 'It is sent when Coe finishes' }, { value: 'interrupt', label: 'Interrupt', hint: 'Coe stops and reads it now' }]} />
      </Row>
      <Switch icon="text" label="Headings and emphasis" hint="Big headings, centred text and animated words, but only for long writing like essays and plans." on={s.effects} onChange={(effects) => up({ effects })} />
    </div>
  );
}

const SAYS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Polish', 'Romanian', 'Arabic', 'Hindi', 'Chinese', 'Japanese', 'Welsh'];
export function LearnTab({ s, up }: { s: CoeSettings; up: Up }) {
  return (
    <div className="set-list">
      <Row label="What you already know" icon="graduate" hint="So explanations start in the right place.">
        <Select label="What you already know" value={s.level} onChange={(level) => up({ level })} options={[{ value: 'auto', label: 'Work it out' }, { value: 'simple', label: 'Beginner', hint: 'Everyday words, small steps' }, { value: 'standard', label: 'Some experience' }, { value: 'expert', label: 'Expert', hint: 'Skip the basics' }]} />
      </Row>
      <Row label="Reply language" icon="language" hint="Coe always answers in this language. Code stays as it is.">
        <Select label="Reply language" value={s.replyLang} onChange={(replyLang) => up({ replyLang })} options={[{ value: '', label: 'The one I write in' }, ...SAYS.map((v) => ({ value: v, label: v }))]} />
      </Row>
      <Row label="Daily card goal" icon="trophy" hint="How many study cards you want to review each day." wide>
        <Slider hideLabel label="Daily card goal" value={s.goal} min={5} max={60} step={5} onChange={(goal) => up({ goal })} format={(n) => `${n} cards`} marks={[{ value: 5, label: '5' }, { value: 20, label: '20' }, { value: 40, label: '40' }, { value: 60, label: '60' }]} />
      </Row>
    </div>
  );
}

/** A message to the people who make Coe. It is emailed to contact@pmcstudios.uk. */
function FeedbackForm() {
  const [kind, setKind] = useState<FeedbackKind>('idea'), [text, setText] = useState(''), [st, setSt] = useState<'' | 'sending' | 'sent' | 'failed'>('');
  return (
    <form className="cx-fbform" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; setSt('sending'); void sendFeedback(loadSettings(), undefined, text, kind).then((r) => setSt(r.emailed ? 'sent' : 'failed')); }}>
      <b className="d">Tell us something</b>
      <Select label="What is it?" value={kind} onChange={(v) => setKind(v)} options={[{ value: 'idea', label: 'An idea' }, { value: 'problem', label: 'Something is wrong' }, { value: 'other', label: 'Something else' }]} />
      <textarea className="cx-in tall" rows={4} maxLength={2000} value={text} placeholder="Write it here" aria-label="Your message" onChange={(e) => { setText(e.target.value); setSt(''); }} />
      <div className="cx-actions">
        <button type="submit" className="btn small gold" disabled={!text.trim() || st === 'sending'}>{st === 'sending' ? 'Sending…' : 'Send'}</button>
        {st === 'sent' && <span className="tx" role="status">Sent. Thank you.</span>}
        {st === 'failed' && <><span className="tx" role="status">It could not be sent from here.</span><button type="button" className="btn small" onClick={() => mailtoFeedback(text, kind)}>Email it instead</button></>}
      </div>
    </form>
  );
}

const PLAN_LABEL: Record<FeaturePlan, string> = { free: 'Free', pro: 'Pro', both: 'Free + Pro' };
export function AboutTab() {
  const [open, setOpen] = useState<string | null>(null), [q, setQ] = useState('');
  const find = q.trim().toLowerCase();
  const shown = FEATURES.filter((f) => !find || (f.title + ' ' + f.text).toLowerCase().includes(find));
  return (
    <div className="ab">
      <div className="ab-top">
        <b className="d ab-n">{FEATURES.length}</b>
        <div><b className="d">Things Coe can do</b><p className="tx">Every one of these works today. <span className="ab-tag free">Free</span> is for everyone, <span className="ab-tag pro">Pro</span> needs a plan, and <span className="ab-tag both">Free + Pro</span> has a taste on Free and much more on Pro.</p></div>
      </div>
      <input className="cx-in" type="search" value={q} placeholder="Search the list" aria-label="Search features" onChange={(e) => setQ(e.target.value)} />
      {find && <p className="tx cx-small">{shown.length} found</p>}
      {FEATURE_GROUPS.map((g) => {
        const rows = shown.filter((f) => f.group === g.id); if (!rows.length) return null;
        const on = !!find || open === g.id;
        return (
          <section key={g.id} className="ab-g">
            <button type="button" className="ab-h" aria-expanded={on} onClick={() => setOpen(open === g.id ? null : g.id)}>
              <span className="ab-gi" aria-hidden><UiIcon name={g.icon as Icon} size={20} /></span>
              <span className="ab-gt"><b className="d">{g.name}</b><span className="tx">{g.blurb}</span></span>
              <i className="ab-c">{rows.length}</i><UiIcon name="down" size={16} className="ab-chev" />
            </button>
            {on && (
              <ul className="ab-l">
                {rows.map((f) => (
                  <li key={f.title} className={f.wow ? 'wow' : ''}>
                    <span className="ab-ic" aria-hidden><UiIcon name={f.icon as Icon} size={18} /></span>
                    <div><b className="d">{f.title}</b>{f.wow && <em className="ab-star" title="A headline feature"><UiIcon name="star" size={12} /></em>}<p className="tx">{f.text}</p></div>
                    <span className={`ab-tag ${f.plan}`}>{PLAN_LABEL[f.plan]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <FeedbackForm />
      <p className="tx cx-small">Coe is made by PMC Studios. It can be wrong, so check anything important.</p>
    </div>
  );
}

/** Coe for Chrome: get it, and set it up from here. The extension answers through the page, so the two stay in step. */
export function ChromeTab() {
  const { state, version, prefs, change } = useExtension(true);
  const [copied, setCopied] = useState(false);
  const on = state === 'on';
  const copy = async () => { try { await navigator.clipboard.writeText('chrome://extensions'); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ } };
  return (
    <div className="set-list ex">
      <div className={`ex-top${on ? ' on' : ''}`}>
        <span className="ex-dot" aria-hidden />
        <div><b className="d">{on ? 'Coe for Chrome is on' : state === 'checking' ? 'Looking for the extension' : 'Coe for Chrome'}</b>
          <p className="tx">{on ? `Version ${version}. Your sign-in and these settings are shared with it.` : 'A small Coe that sits on any page. It finds the questions, gives hints and worked answers, and makes practice questions.'}</p></div>
      </div>
      {!on && (
        <>
          <a className="btn primary ex-get" href={`/${EXT_FILE}`} download><UiIcon name="download" size={18} />Get the Coe extension</a>
          <ol className="ex-steps">
            <li><span className="d">1</span><p className="tx">Open the file you got and choose <b>Extract all</b> (or double-click it on a Mac). You get a folder called <b>coe-extension</b>.</p></li>
            <li><span className="d">2</span><p className="tx">In Chrome, go to <b>chrome://extensions</b>. <button type="button" className="ex-copy" onClick={copy}>{copied ? 'Copied' : 'Copy this address'}</button></p></li>
            <li><span className="d">3</span><p className="tx">Turn on <b>Developer mode</b> (top right).</p></li>
            <li><span className="d">4</span><p className="tx">Click <b>Load unpacked</b> and choose the <b>coe-extension</b> folder.</p></li>
            <li><span className="d">5</span><p className="tx">Come back to this page. It spots the extension by itself and the settings show up here.</p></li>
          </ol>
        </>
      )}
      {on && prefs && (
        <>
          <Switch icon="globe" label="Appear on school sites" hint="Shows up by itself on Google Forms, Sparx and Seneca. Off means only when you ask." on={prefs.auto} onChange={(auto) => change({ auto })} />
          <Row label="When it appears" icon="panel" hint="Open means the bar drops in ready. Small means just a little tab.">
            <Select label="When it appears" value={prefs.start} onChange={(start) => change({ start })} options={[{ value: 'bar', label: 'Open bar', hint: 'Ready straight away' }, { value: 'small', label: 'Small tab', hint: 'Stays out of the way' }]} />
          </Row>
          <Row label="Speed" icon="bolt" hint="Quick answers or careful ones.">
            <Select label="Speed" value={prefs.speed} onChange={(speed) => change({ speed })} options={[{ value: 'swift', label: 'Swift', hint: 'Fastest' }, { value: 'core', label: 'Core', hint: 'Everyday' }, { value: 'deep', label: 'Deep', hint: 'Careful, slower' }]} />
          </Row>
          <p className="tx cx-small">It uses your name, tone, answer length and standing instructions from the Chat tab, and your Coe tokens. Redos are free. Press <b>Ctrl+Shift+Y</b> (<b>Command+Shift+Y</b> on a Mac) on any page to show or hide it. &quot;Continue in Coe&quot; in the extension opens a new chat here with your question.</p>
        </>
      )}
      {!on && state === 'off' && <p className="tx cx-small">Already added it? Reload this page once.</p>}
    </div>
  );
}
