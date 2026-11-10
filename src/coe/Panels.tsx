'use client';
import { Halftone } from '@/ui/Halftone';
import { useEffect, useRef, useState } from 'react';
import { Seg } from '@/ui/Seg';
import { useBackClose } from './back';
import { UiIcon } from '@/ui/icons';
import { ask, type CoeError } from '@/lib/coe/client';
import { COE_MODELS } from '@/lib/coe/models';
import { PROVIDERS, providerById } from '@/lib/coe/providers';
import { canOwnKey, onStatus, status } from '@/lib/coe/account';
import { connection, modeOf, own, type CoeSettings } from '@/lib/coe/settings';
import { You } from './You';
import { Select } from '@/ui/Controls';
import { AboutTab, ChatTab, ChromeTab, LearnTab, LookTab } from './SettingsTabs';
import { VoiceFields } from './VoiceFields';
import { AccountTab } from './Account';
import { UsageTab } from './UsageTab';

/** A window over the chat: a dark veil, a boxed card, Escape to close. */
export function Modal({ title, onClose, children, wide, flush }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; flush?: boolean }) {
  const card = useRef<HTMLDivElement>(null), close = useRef(onClose);
  close.current = onClose;
  useBackClose(onClose);
  // Focus the window once when it opens. (Doing it again on every change would pull the cursor out of a box you are typing in.)
  useEffect(() => { card.current?.focus(); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (document.activeElement?.getAttribute('aria-expanded') === 'true') return; e.stopPropagation(); close.current(); } };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  }, []);
  return (
    <div className="cx-veil" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className={`cx-modal${wide ? ' wide' : ''}${flush ? ' flush' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="cx-modal-top"><Halftone className="ht-bar" /><h2 className="d">{title}</h2><button type="button" className="cx-ib cx-closeb" aria-label="Close" onClick={onClose}><UiIcon name="close" size={20} /><span>Close</span></button></div>
        <div className="cx-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- a plan is needed
export function Upgrade({ note, onClose }: { note: string; onClose: () => void }) {
  return (
    <Modal title="Pro needed" onClose={onClose}>
      <p className="tx">{note}</p>
      <div className="cx-actions"><a className="btn gold" href="/plans/">See plans</a><button type="button" className="btn" onClick={onClose}>Not now</button></div>
    </Modal>
  );
}

// ---------------------------------------------------------------- settings
export type Tab = 'account' | 'usage' | 'connect' | 'ai' | 'chat' | 'look' | 'learn' | 'voice' | 'you' | 'data' | 'ext' | 'about';
type TabDef = { id: Tab; name: string; icon: Parameters<typeof UiIcon>[0]['name'] };
const GROUPS: { name: string; tabs: TabDef[] }[] = [
  { name: 'You', tabs: [{ id: 'account', name: 'Account', icon: 'user' }, { id: 'usage', name: 'Usage', icon: 'chart' }, { id: 'you', name: 'Memory', icon: 'sparkle' }] },
  { name: 'Coe', tabs: [{ id: 'chat', name: 'Chat', icon: 'chat' }, { id: 'learn', name: 'Learn', icon: 'graduate' }, { id: 'voice', name: 'Voice typing', icon: 'mic' }, { id: 'look', name: 'Look', icon: 'theme' }] },
  { name: 'More', tabs: [{ id: 'ext', name: 'Coe Mini', icon: 'globe' }, { id: 'ai', name: 'Your AI', icon: 'bolt' }, { id: 'data', name: 'Data', icon: 'backup' }, { id: 'about', name: 'About', icon: 'info' }] },
];
export function SettingsPanel({ owner, settings, set, tab: tabIn, setTab, convCount, used, limit, onSignIn, onAccountChange, onExport, onImport, onDeleteAll, onClose }: {
  owner: boolean; settings: CoeSettings; set: (s: CoeSettings) => void; tab: Tab; setTab: (t: Tab) => void; convCount: number;
  used: number; limit: number; onSignIn: () => void; onAccountChange: (signedIn: boolean) => void;
  onExport: () => void; onImport: (f: File) => void; onDeleteAll: () => void; onClose: () => void;
}) {
  const tab: Tab = owner || tabIn !== 'connect' ? tabIn : 'ai';
  const up = (patch: Partial<CoeSettings>) => set({ ...settings, ...patch });
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'bad'; text: string }>({ state: 'idle', text: '' });
  const [sure, setSure] = useState(false);
  const [show, setShow] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [, bump] = useState(0);
  useEffect(() => onStatus(() => bump((n) => n + 1)), []);
  const pro = canOwnKey();
  const st = status();
  const c = connection({ ...settings, mode: 'server' });
  const o = own(settings), who = o.p.id === 'custom' ? 'that service' : o.p.name, ck = connection({ ...settings, mode: 'key' });
  const setBase = (v: string) => up({ bases: { ...settings.bases, [o.p.id]: v } });
  const setKey = (v: string) => up({ keys: { ...settings.keys, [o.p.id]: v } });
  const setModel = (k: typeof COE_MODELS[number]['key'], v: string) => up({ models: { ...settings.models, [o.p.id]: { ...(settings.models[o.p.id] ?? {}), [k]: v } } });

  const run = async (mode: 'server' | 'key') => {
    setTest({ state: 'busy', text: 'Asking…' });
    try {
      const r = await ask({ ...settings, mode }, { model: 'swift', messages: [{ role: 'user', text: 'Reply with the single word: ready' }], maxTokens: 16 });
      setTest({ state: 'ok', text: r.text.trim() ? `Connected. It said: “${r.text.trim().slice(0, 40)}”.` : 'Connected.' });
    } catch (e) { setTest({ state: 'bad', text: (e as CoeError).message || 'That did not work.' }); }
  };

  return (
    <Modal title="Settings" onClose={onClose} wide flush>
      <div className="set-wrap">
      <nav className="set-nav" role="tablist" aria-label="Settings" aria-orientation="vertical">
        {[...GROUPS, ...(owner ? [{ name: 'Owner', tabs: [{ id: 'connect' as Tab, name: 'Server', icon: 'cloud' as const }] }] : [])].map((g) => (
          <div key={g.name} className="set-grp" role="presentation"><span className="set-gn d" aria-hidden>{g.name}</span>
            {g.tabs.map((t) => (
              <button key={t.id} type="button" role="tab" id={`set-t-${t.id}`} aria-selected={tab === t.id} aria-controls="set-panel" title={t.name} className="set-tab" onClick={() => setTab(t.id)}><UiIcon name={t.icon} size={18} /><span>{t.name}</span></button>
            ))}
          </div>
        ))}
      </nav>
      <div id="set-panel" role="tabpanel" aria-labelledby={`set-t-${tab}`} className="set-body">
      <h3 className="set-h d">{[...GROUPS.flatMap((g) => g.tabs), { id: 'connect', name: 'Server' }].find((t) => t.id === tab)?.name}</h3>
      {tab === 'account' && <AccountTab onSignIn={onSignIn} onChange={onAccountChange} />}
      {tab === 'usage' && <UsageTab usedLocal={used} limitLocal={limit} />}

      {tab === 'connect' && (
        <div className="cx-form">
          <p className="tx cx-small">This is Coe&apos;s own server, the one everyone uses by default. Only you see this tab.</p>
          <div className="cx-fr"><label className="label" htmlFor="cx-url">Server address</label>
            <input id="cx-url" className="cx-in" value={settings.serverUrl} placeholder="https://coe-ai.your-name.workers.dev" spellCheck={false} autoComplete="off" onChange={(e) => up({ serverUrl: e.target.value })} /></div>
          <div className="cx-fr"><label className="label" htmlFor="cx-code">Access code (if you set one)</label>
            <input id="cx-code" className="cx-in" type="password" value={settings.code} autoComplete="off" onChange={(e) => up({ code: e.target.value })} /></div>
          <div className="cx-actions">
            <button type="button" className="btn gold" disabled={!c.ok || test.state === 'busy'} onClick={() => run('server')}>{test.state === 'busy' ? 'Testing' : 'Test the server'}</button>
            <span className={`cx-test ${test.state}`} role="status">{c.ok ? test.text : c.why.replace(/ in Settings\.?$/, '.')}</span>
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <div className="cx-form">
          <div className="cx-fr"><span className="label" id="cx-use">Which AI does Coe use?</span>
            <Seg labelledBy="cx-use" value={pro ? settings.mode : 'server'} onChange={(mode) => { if (!pro && mode === 'key') return; up({ mode }); setTest({ state: 'idle', text: '' }); }} options={[{ value: 'server', label: 'Coe\u2019s AI' }, { value: 'key', label: pro ? 'My own key' : 'My own key (Pro)' }]} /></div>
          {!pro ? (
            <div className="cx-lock">
              <b className="d">Your own key is part of Pro.</b>
              <p className="tx">Everyone can chat with Coe&apos;s AI for free, with no key. On Pro you can also plug in your own key from OpenAI, Anthropic, Google and more, and pick the models behind Coe Swift, Core and Deep.</p>
              <div className="cx-actions">
                <a className="btn gold" href="/plans/">See plans</a>
                {st.billing && !st.signedIn && <span className="tx cx-small">Already Pro? Sign in first.</span>}
              </div>
            </div>
          ) : settings.mode !== 'key' ? (
            <p className="tx">Coe is using its own AI, so there is nothing to set up. Switch to <b>My own key</b> above to use a key of your own.</p>
          ) : (
            <>
              <div className="cx-fr"><label className="label" htmlFor="cx-prov">Company</label>
                <Select id="cx-prov" label="Company" value={settings.provider} onChange={(v) => { up({ provider: v }); setTest({ state: 'idle', text: '' }); }} options={PROVIDERS.map((p) => ({ value: p.id, label: p.name, badge: settings.keys[p.id] ? 'key saved' : undefined }))} /></div>
              {o.p.note && <p className="tx cx-small">{o.p.note}</p>}
              <div className="cx-fr"><label className="label" htmlFor="cx-key">{o.p.id === 'ollama' ? 'Key (not needed)' : o.p.id === 'custom' ? 'Your key' : `Your ${o.p.name} key`}</label>
                <span className="cx-pw"><input id="cx-key" className="cx-in" type={show ? 'text' : 'password'} value={o.key} spellCheck={false} autoComplete="off" onChange={(e) => setKey(e.target.value)} />
                  <button type="button" className="btn small" onClick={() => setShow((x) => !x)}>{show ? 'Hide' : 'Show'}</button></span>
                {o.p.keys && <span className="tx cx-small">Make one at {o.p.keys}</span>}</div>
              <details className="cx-how" open={o.p.id === 'custom'}>
                <summary>Address and model names</summary>
                <div className="cx-fr"><label className="label" htmlFor="cx-base">API address</label>
                  <input id="cx-base" className="cx-in" value={settings.bases[o.p.id] ?? ''} placeholder={o.p.base || 'https://api.example.com/v1'} spellCheck={false} autoComplete="off" onChange={(e) => setBase(e.target.value)} /></div>
                <p className="tx cx-small">Which model sits behind each Coe model. Leave empty for the usual ones.</p>
                {COE_MODELS.map((m) => (
                  <div key={m.key} className="cx-fr"><label className="label" htmlFor={`cx-m-${m.key}`}>{m.name}</label>
                    <input id={`cx-m-${m.key}`} className="cx-in" value={settings.models[o.p.id]?.[m.key] ?? ''} spellCheck={false} placeholder={o.p.models[m.key] || 'model name'} onChange={(e) => setModel(m.key, e.target.value)} /></div>
                ))}
              </details>
              <p className="cx-warn tx"><b className="d">Only on your own device.</b> The key is saved in this browser and sent straight to {who}, not through Coe. Anyone who can open this browser can use it, so never do this on a shared or school computer. Some companies do not allow this from a web page. If the test says it cannot reach them, that is why.</p>
              <div className="cx-actions">
                <button type="button" className="btn gold" disabled={!ck.ok || test.state === 'busy'} onClick={() => run('key')}>{test.state === 'busy' ? 'Testing' : 'Test my key'}</button>
                <button type="button" className="btn" disabled={!o.key} onClick={() => { setKey(''); setTest({ state: 'idle', text: '' }); }}>Forget this key</button>
                <span className={`cx-test ${test.state}`} role="status">{ck.ok ? test.text : ck.why.replace(/ in Settings\.?$/, '.')}</span>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'look' && <LookTab s={settings} up={up} />}
      {tab === 'chat' && <ChatTab s={settings} up={up} />}
      {tab === 'learn' && <LearnTab s={settings} up={up} />}
      {tab === 'voice' && <VoiceFields />}
      {tab === 'ext' && <ChromeTab />}
      {tab === 'about' && <AboutTab />}

      {tab === 'you' && <You pro={pro || st.plan === 'pro'} signedIn={st.signedIn} />}

      {tab === 'data' && (
        <div className="cx-form">
          <p className="tx">{convCount} {convCount === 1 ? 'conversation is' : 'conversations are'} kept in this browser. They are only sent anywhere when you send a message in them.</p>
          <div className="cx-actions">
            <button type="button" className="btn" onClick={onExport} disabled={!convCount}>Save everything as a file</button>
            <button type="button" className="btn" onClick={() => file.current?.click()}>Open a saved file</button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
          </div>
          <div className="cx-actions">
            <button type="button" className="btn" disabled={!Object.values(settings.keys).some(Boolean) && !(owner && settings.code)} onClick={() => up({ keys: {}, ...(owner ? { code: '' } : {}) })}>{owner ? 'Forget my keys and code' : 'Forget my saved keys'}</button>
            {!sure
              ? <button type="button" className="btn" disabled={!convCount} onClick={() => setSure(true)}>Delete all conversations</button>
              : <span className="cx-sure"><b className="d">Delete all {convCount}?</b><button type="button" className="btn small" onClick={() => { onDeleteAll(); setSure(false); }}>Yes, delete</button><button type="button" className="btn small" onClick={() => setSure(false)}>No</button></span>}
          </div>
        </div>
      )}
      </div>
      </div>
    </Modal>
  );
}
