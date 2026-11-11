'use client';
/** The look, chat, learn and about tabs of Settings. Every option here is wired to something real. */
import { COE_DATE, COE_VERSION, NEWEST } from '@/lib/coe/changelog';
import { SiteFooter } from '@/ui/SiteFooter';
import { useEffect, useState } from 'react';
import { Row, Select, Slider, Switch } from '@/ui/Controls';
import { UiIcon } from '@/ui/icons';
import { PmcPicker } from '@/ui/PmcPicker';
import { ACCENTS, LEADS, THEMES, fitAccent, loadAccent, loadLead, setAccent, setLead, setSfx, setTheme, sfxOn, pingOn, setPing, type Lead } from '@/lib/coe/look';
import { DEFAULTS, type CoeSettings } from '@/lib/coe/settings';
import { FEATURES, FEATURE_GROUPS, type FeaturePlan } from '@/lib/coe/features';
import { loadSettings } from '@/lib/coe/settings';
import { EXT_FILE, EXT_FILE_FIREFOX, connectMini, disconnectMini, onExtConnected, useExtension } from '@/lib/coe/extension';
import { session } from '@/lib/coe/cloud';
import { AGE_OPTIONS, ROLE_OPTIONS, levelWords } from '@/lib/coe/profile';
import { GoodRisk } from './GoodRisk';
import { Notice } from './ErrorBox';
import { mailtoFeedback, sendFeedback, type FeedbackKind } from '@/lib/coe/feedback';

type Up = (patch: Partial<CoeSettings>) => void;
type Icon = Parameters<typeof UiIcon>[0]['name'];

export function LookTab({ s, up }: { s: CoeSettings; up: Up }) {
  const [lead, setL] = useState<Lead>('cream'), [snd, setSnd] = useState(false), [ping, setPingState] = useState(true), [acc, setAcc] = useState('#337957'), [pk, setPk] = useState(false);
  useEffect(() => { const f = () => { setL(loadLead()); setSnd(sfxOn()); setPingState(pingOn()); setAcc(loadAccent()); }; f(); window.addEventListener('pmc:coe-look', f); return () => window.removeEventListener('pmc:coe-look', f); }, []);
  return (
    <div className="set-list">
      <div className="cx-fr"><span className="label">Themes</span>
        <div className="th-grid" role="group" aria-label="Themes">
          {THEMES.map((t) => {
            const L = LEADS.find((l) => l.id === t.lead)!, on = lead === t.lead && acc.toLowerCase() === fitAccent(t.accent);
            return <button key={t.id} type="button" className={`th-card${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setTheme(t)}>
              <span className="th-pv" style={{ background: L.page, borderColor: L.edge }} aria-hidden><i style={{ background: fitAccent(t.accent) }} /><b style={{ background: L.edge, opacity: 0.85 }} /><b style={{ background: L.edge, opacity: 0.4, width: '40%' }} /></span>
              <span className="th-n d">{t.name}</span></button>;
          })}
        </div></div>
      <div className="cx-fr"><span className="label">Accent colour <i className="tx th-sub">replaces the green everywhere</i></span>
        <div className="ac-row" role="group" aria-label="Accent colour">
          {ACCENTS.map((a) => <button key={a.id} type="button" className={`ac-dot${acc.toLowerCase() === a.hex.toLowerCase() ? ' on' : ''}`} style={{ background: a.hex }} aria-label={a.name} aria-pressed={acc.toLowerCase() === a.hex.toLowerCase()} title={a.name} onClick={() => setAccent(a.hex)}>{acc.toLowerCase() === a.hex.toLowerCase() && <UiIcon name="check" size={16} />}</button>)}
          <button type="button" className={`ac-own${pk ? ' on' : ''}`} aria-expanded={pk} aria-controls="ac-pk" title="Pick any colour" onClick={() => setPk((v) => !v)}><span className="ac-sw" style={{ background: acc }} aria-hidden /><span className="tx">Any colour</span></button>
          <button type="button" className="btn small" onClick={() => setAccent('#337957')}><UiIcon name="refresh" size={15} />Back to green</button>
        </div>
        {pk && <div id="ac-pk" className="ac-pk"><PmcPicker value={acc} onChange={(h) => setAccent(h)} /></div>}
        <p className="tx th-sub">Too-light colours are darkened a little so the white words on buttons stay easy to read.</p></div>
      <Row label="Page colour" icon="theme" hint="Light, dark, gold or your theme colour.">
        <Select label="Colour" value={lead} onChange={(v) => setLead(v)} options={LEADS.map((l) => ({ value: l.id, label: l.name, hint: l.blurb }))} />
      </Row>
      <Row label="Text size" icon="text" wide>
        <Slider hideLabel label="Text size" value={s.scale} min={75} max={150} step={5} onChange={(scale) => up({ scale })} format={(n) => `${n}%`}
          marks={[{ value: 75, label: 'Small' }, { value: 100, label: 'Normal' }, { value: 125, label: 'Large' }, { value: 150, label: 'Huge' }]} />
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
      <Switch icon="volume" label="Tell me when a reply is ready" hint="A soft chime and a dot in the tab title when Coe finishes while you are on another tab." on={ping} onChange={(v) => setPing(v)} />
      <Row label="Enter key" icon="keyboard" hint="What pressing Enter does in the message box.">
        <Select label="Enter key" value={s.enter} onChange={(enter) => up({ enter })} options={[{ value: 'send', label: 'Sends the message', hint: 'Shift+Enter adds a line' }, { value: 'newline', label: 'Adds a line', hint: 'Ctrl+Enter sends' }]} />
      </Row>
      <div className="cx-actions"><button type="button" className="btn small" onClick={() => { setAccent('#337957'); setLead('cream'); up({ scale: DEFAULTS.scale, motion: DEFAULTS.motion, compact: false, easy: false, contrast: false }); }}><UiIcon name="refresh" size={15} />Reset the look</button></div>
    </div>
  );
}

export function ChatTab({ s, up }: { s: CoeSettings; up: Up }) {
  return (
    <div className="set-list">
      <div className="cx-fr"><label className="label" htmlFor="cx-name">What should Coe call you?</label>
        <input id="cx-name" className="cx-in" type="text" maxLength={30} value={s.name} placeholder="Your first name" autoComplete="off" onChange={(e) => up({ name: e.target.value })} /></div>
      <Row label="Your age group" icon="user" hint="Only used to pick the right words. Never sold or used for ads. You can skip it.">
        <Select label="Your age group" value={s.ageBand} onChange={(ageBand) => up({ ageBand })} options={AGE_OPTIONS} />
      </Row>
      <Row label="What best fits you" icon="user" hint="Student, teacher, working, or something else.">
        <Select label="What best fits you" value={s.role} onChange={(role) => up({ role })} options={ROLE_OPTIONS} />
      </Row>
      <div className="cx-fr"><label className="label" htmlFor="cx-lvl">{levelWords(s.role)[0]}</label>
        <input id="cx-lvl" className="cx-in" type="text" maxLength={60} value={s.yearOrJob} placeholder={levelWords(s.role)[1]} autoComplete="off" onChange={(e) => up({ yearOrJob: e.target.value })} /></div>
      <div className="cx-fr"><label className="label" htmlFor="cx-subj">What you study or work on</label>
        <input id="cx-subj" className="cx-in" type="text" maxLength={100} value={s.subjects} placeholder="Maths, science, music" autoComplete="off" onChange={(e) => up({ subjects: e.target.value })} /></div>
      <div className="cx-fr"><label className="label" htmlFor="cx-about">About you <i className="tx th-sub">{s.about.length}/700</i></label>
        <textarea id="cx-about" className="cx-in tall" rows={3} maxLength={700} value={s.about} placeholder="For example: I am in Year 10 and doing GCSE maths, science and computing." onChange={(e) => up({ about: e.target.value })} />
        <div className="ci-chips">{['I am in Year 9', 'I am doing GCSEs', 'I am doing A levels', 'I am learning to code', 'English is my second language'].map((t) => <button key={t} type="button" className="ci-chip tx" onClick={() => !s.about.includes(t) && up({ about: (s.about ? s.about.replace(/\s*$/, '. ') : '') + t + '.' })}>+ {t}</button>)}</div></div>
      <div className="cx-fr"><label className="label" htmlFor="cx-sys">How Coe should answer <i className="tx th-sub">{s.system.length}/1500</i></label>
        <textarea id="cx-sys" className="cx-in tall" rows={4} maxLength={1500} value={s.system} placeholder="For example: Keep answers short. Show every step in maths. Ask me a question at the end to check I understood." onChange={(e) => up({ system: e.target.value })} />
        <div className="ci-chips">{['Show every step', 'Keep answers short', 'Check I understood with a question', 'Give an example first', 'Never just give the answer: guide me'].map((t) => <button key={t} type="button" className="ci-chip tx" onClick={() => !s.system.includes(t) && up({ system: (s.system ? s.system.replace(/\s*$/, '. ') : '') + t + '.' })}>+ {t}</button>)}</div></div>
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
      <Switch icon="timer" label="Timer" hint="Shows how long Coe has been working, and how long a reply took." on={s.timers} onChange={(timers) => up({ timers })} />
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
/** The version, what is new in it, and what it was like before. */
function Version() {
  const [more, setMore] = useState(false);
  const mine = NEWEST.items.filter((c) => c.where !== 'mini');
  return (
    <section className="ab-ver" aria-label="Version">
      <div className="ab-ver-t"><b className="d ab-ver-n">{COE_VERSION}</b><i className="beta">Beta</i><span className="tx cx-small">{COE_DATE}. The number reads year, day, month.</span></div>
      <b className="d">New in this version</b>
      <ul className="ab-ver-l">{mine.map((c) => <li key={c.text} className="tx">{c.text}</li>)}</ul>
      <button type="button" className="cx-link" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Hide' : 'What it was like before'}</button>
      {more && <ul className="ab-ver-l old">{NEWEST.before.map((t) => <li key={t} className="tx">{t}</li>)}</ul>}
    </section>
  );
}

export function AboutTab() {
  const [open, setOpen] = useState<string | null>(null), [q, setQ] = useState('');
  const find = q.trim().toLowerCase();
  const shown = FEATURES.filter((f) => !find || (f.title + ' ' + f.text).toLowerCase().includes(find));
  return (
    <div className="ab">
      <Version />
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
      <SiteFooter className="sf-in" />
    </div>
  );
}

/** Coe Mini: get it (Chrome, Edge, Brave, Opera, Vivaldi or Firefox), and set it up from here. The extension answers through the page, so the two stay in step. */
export function ChromeTab() {
  const { state, version, browser, prefs, change, linked } = useExtension(true);
  const [pairIn, setPairIn] = useState(''), [pairMsg, setPairMsg] = useState(''), [pairBusy, setPairBusy] = useState(false);
  const me = session()?.email ?? '';
  useEffect(() => { if (!pairBusy) return; const off = onExtConnected((yes, why) => { setPairBusy(false); setPairMsg(yes ? '' : why === 'account' ? 'Coe Mini is signed in as someone else. Sign in to both with the same account.' : why === 'signin' ? 'Sign in to Coe Mini first.' : 'That code is not the one Coe Mini is showing.'); if (yes) setPairIn(''); }); const t = window.setTimeout(() => { setPairBusy(false); setPairMsg('Coe Mini did not answer. Open it, press Connect with Coe in its Settings, and try again.'); }, 9000); return () => { off(); window.clearTimeout(t); }; }, [pairBusy]);
  const [which, setWhich] = useState<'chrome' | 'firefox'>(() => (typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent) ? 'firefox' : 'chrome'));
  const [copied, setCopied] = useState(false), [askOff, setAskOff] = useState(false);
  const on = state === 'on';
  const addr = which === 'firefox' ? 'about:debugging#/runtime/this-firefox' : 'chrome://extensions';
  const copy = async () => { try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ } };
  return (
    <div className="set-list ex">
      <div className={`ex-top${on ? ' on' : ''}`}>
        <span className="ex-dot" aria-hidden />
        <div><b className="d">{on ? 'Coe Mini is on' : state === 'checking' ? 'Looking for Coe Mini' : 'Coe Mini'}</b>
          <p className="tx">{on ? `Version ${version}${browser === 'firefox' ? ' in Firefox' : ''}. ${linked ? 'Connected: About you, these settings and its chats are shared with Coe.' : 'Not connected: Coe and Coe Mini stay separate. They still use the same account when you sign in to both.'}` : 'Coe in a side panel next to any page. It finds the questions, explains, checks your work and looks at your screen.'}</p></div>
      </div>
      {!on && (
        <>
          <div className="ex-which" role="radiogroup" aria-label="Your browser">
            <button type="button" role="radio" aria-checked={which === 'chrome'} className={which === 'chrome' ? 'on' : ''} onClick={() => setWhich('chrome')}>Chrome, Edge, Brave, Opera, Vivaldi</button>
            <button type="button" role="radio" aria-checked={which === 'firefox'} className={which === 'firefox' ? 'on' : ''} onClick={() => setWhich('firefox')}>Firefox</button>
          </div>
          <a className="btn primary ex-get" href={`/${which === 'firefox' ? EXT_FILE_FIREFOX : EXT_FILE}`} download><UiIcon name="download" size={18} />{which === 'firefox' ? 'Get Coe Mini for Firefox' : 'Get Coe Mini'}</a>
          {which === 'chrome' ? (
            <ol className="ex-steps">
              <li><span className="d">1</span><p className="tx">Open the file you got and choose <b>Extract all</b> (or double-click it on a Mac). You get a folder called <b>coe-mini</b>.</p></li>
              <li><span className="d">2</span><p className="tx">Open your browser&rsquo;s extensions page: <b>chrome://extensions</b> (Edge: <b>edge://extensions</b>, Brave: <b>brave://extensions</b>, Opera: <b>opera://extensions</b>, Vivaldi: <b>vivaldi://extensions</b>). <button type="button" className="ex-copy" onClick={copy}>{copied ? 'Copied' : 'Copy chrome://extensions'}</button></p></li>
              <li><span className="d">3</span><p className="tx">Turn on <b>Developer mode</b>.</p></li>
              <li><span className="d">4</span><p className="tx">Click <b>Load unpacked</b> and choose the <b>coe-mini</b> folder.</p></li>
              <li><span className="d">5</span><p className="tx">Click the puzzle piece and <b>pin</b> One click opens the side panel. If your browser has none, it opens as a small window.</p></li>
              <li><span className="d">6</span><p className="tx">Open Coe Mini and press <b>Sign in or sign up</b>. Use the same account as on this page. Nothing else to set up.</p></li>
            </ol>
          ) : (
            <ol className="ex-steps">
              <li><span className="d">1</span><p className="tx">Open the file you got and extract it (Windows: <b>Extract all</b>. Mac: double-click). You get a folder called <b>coe-extension-firefox</b>.</p></li>
              <li><span className="d">2</span><p className="tx">In Firefox, go to <b>about:debugging#/runtime/this-firefox</b>. <button type="button" className="ex-copy" onClick={copy}>{copied ? 'Copied' : 'Copy this address'}</button></p></li>
              <li><span className="d">3</span><p className="tx">Click <b>Load Temporary Add-on</b> and choose the file <b>manifest.json</b> inside the folder.</p></li>
              <li><span className="d">4</span><p className="tx">Click the Coe Mini button in the toolbar (or press <b>Alt+Shift+Y</b>). The sidebar opens. Press <b>Let Coe Mini see the Coe website</b> and say yes. Then press <b>Sign in or sign up</b>. Coe Mini already knows you, so there is nothing else to set up.</p></li>
              <li><span className="d">5</span><p className="tx">Firefox removes a temporary add-on when it closes. To keep it, sign it for free: go to <b>addons.mozilla.org/developers</b>, click <b>Submit a New Add-on</b>, choose <b>On your own</b> and upload the zip you got (do not unzip it). When it is signed, download the file it gives you. In Firefox open <b>Add-ons and themes</b>, click the cog, choose <b>Install Add-on From File</b> and pick that file.</p></li>
            </ol>
          )}
        </>
      )}
      {on && (
        <div className="ex-link">
          <Switch on={linked} onChange={(v) => { if (!v) disconnectMini(); }} label="Connect with Coe Mini" hint={linked ? 'On: About you, settings and Coe Mini chats are shared. Switch off to keep them separate.' : 'Off: kept separate. To connect, type the code Coe Mini shows. Find it in Coe Mini: Settings, Connect with Coe.'} icon="link" disabled={!linked} />
          {!linked && (
            <form className="ex-code" onSubmit={(e) => { e.preventDefault(); const c = pairIn.replace(/[^A-Za-z2-9]/g, '').toUpperCase(); if (c.length !== 6) { setPairMsg('The code has six letters and numbers.'); return; } if (!me) { setPairMsg('Sign in to Coe first. Use the same account as Coe Mini.'); return; } setPairMsg(''); setPairBusy(true); connectMini(c, me); }}>
              <label className="d" htmlFor="ex-pair">Code from Coe Mini</label>
              <div className="ex-code-row"><input id="ex-pair" className="cx-in ex-code-in" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={7} placeholder="K7Q-M4P" value={pairIn} onChange={(e) => setPairIn(e.target.value.toUpperCase())} /><button type="submit" className="btn primary" disabled={pairBusy}>{pairBusy ? 'Connecting' : 'Connect'}</button></div>
              {pairMsg && <p className="tx cx-small" role="alert">{pairMsg}</p>}
            </form>
          )}
        </div>
      )}
      {on && linked && prefs && (
        <>
          <Row label="What it reads" icon="panel" hint="Only when you ask. The whole page, or just what is on screen.">
            <Select label="What it reads" value={prefs.scope} onChange={(scope) => change({ scope })} options={[{ value: 'page', label: 'The whole page', hint: 'Articles, notes, long pages' }, { value: 'screen', label: 'Only what is on screen', hint: 'One question at a time' }]} />
          </Row>
          <Row label="Speed" icon="bolt" hint="Quick answers or careful ones.">
            <Select label="Speed" value={prefs.speed} onChange={(speed) => change({ speed })} options={[{ value: 'swift', label: 'Swift', hint: 'Fastest' }, { value: 'core', label: 'Core', hint: 'Everyday' }, { value: 'deep', label: 'Deep', hint: 'Careful, slower' }]} />
          </Row>
          <Switch on={prefs.askTabs !== 'allow'} onChange={(v) => change({ askTabs: v ? 'ask' : 'allow' })} label="Ask before opening a new tab" hint="On: Coe asks each time. Off: it opens the tab behind the one you are on." icon="globe" />
          <Switch on={prefs.askChg !== 'allow'} onChange={(v) => { if (v) change({ askChg: 'ask' }); else setAskOff(true); }} label="Ask before Coe uses the cursor" hint="On: Coe asks before it types, clicks or does a job on a page. Off: it goes ahead and you can still press Stop." icon="edit" />
          <p className="tx cx-small">On homework and quiz sites (Sparx, Seneca, GoCode, Blooket, Kahoot, school forms) Coe Mini explains, hints and checks your answer, and never types for you, whatever you pick here. It reads a page only when you send a message or press a button. It uses your About you answers and your Coe tokens.</p>
        </>
      )}
      {!on && state === 'off' && <p className="tx cx-small">Already added it? Reload this page once.</p>}
      {askOff && <GoodRisk title="Turn off asking?" lead="Coe will type, click and do jobs on pages as soon as you ask. It will not stop to check with you." good={['Quicker. No box to press each time.', 'You still see every step, and Stop or Esc ends it at once.', 'It never types passwords or card details, and never works on school sites.']} risks={['Coe can click the wrong thing, and it may not be undoable.', 'Publishing, sending, deleting and paying will go ahead without a second check.']} yes="Yes, turn it on" onYes={() => { setAskOff(false); change({ askChg: 'allow' }); }} onNo={() => setAskOff(false)} />}
    </div>
  );
}

/** Coe Mini on a phone or a tablet: a notice at the top, and the settings below it greyed out. Those devices cannot add browser extensions. */
export function MiniNotHere() {
  return (
    <div className="ex-box">
      <Notice title="Not on phones or tablets" text="Coe Mini is only for computers (Chrome, Edge and Firefox). Phones and tablets cannot add browser extensions." />
      <div className="mini-off" inert aria-hidden="true">
        <Row label="What it reads" icon="panel" hint="Only when you ask. The whole page, or just what is on screen.">
          <Select label="What it reads" value="page" onChange={() => {}} disabled options={[{ value: 'page', label: 'The whole page' }, { value: 'screen', label: 'Only what is on screen' }]} />
        </Row>
        <Row label="Speed" icon="bolt" hint="Quick answers or careful ones.">
          <Select label="Speed" value="core" onChange={() => {}} disabled options={[{ value: 'swift', label: 'Swift' }, { value: 'core', label: 'Core' }, { value: 'deep', label: 'Deep' }]} />
        </Row>
        <Switch on disabled onChange={() => {}} label="Ask before opening a new tab" hint="On: Coe asks each time. Off: it opens the tab behind the one you are on." icon="globe" />
        <Switch on disabled onChange={() => {}} label="Ask before Coe uses the cursor" hint="On: Coe asks before it types, clicks or does a job on a page. Off: it goes ahead and you can still press Stop." icon="edit" />
      </div>
    </div>
  );
}
