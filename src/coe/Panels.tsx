'use client';
import { useEffect, useRef, useState } from 'react';
import { CopyButton, downloadText } from '@/ui/copy';
import { Seg } from '@/ui/Seg';
import { UiIcon } from '@/ui/icons';
import { ask, type CoeError } from '@/lib/coe/client';
import { COE_MODELS } from '@/lib/coe/models';
import { PROVIDERS, providerById } from '@/lib/coe/providers';
import { canOwnKey, onStatus, status } from '@/lib/coe/account';
import { connection, modeOf, own, type CoeSettings } from '@/lib/coe/settings';
import { WORKER_CODE } from '@/lib/coe/worker';

/** A window over the chat: a dark veil, a boxed card, Escape to close. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    card.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return (
    <div className="cx-veil" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className={`cx-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="cx-modal-top"><h2 className="d">{title}</h2><button type="button" className="cx-ib" aria-label="Close" onClick={onClose}><UiIcon name="close" size={22} /></button></div>
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
export type Tab = 'connect' | 'ai' | 'chat' | 'data';
export function SettingsPanel({ owner, settings, set, tab: tabIn, setTab, convCount, onExport, onImport, onDeleteAll, onClose }: {
  owner: boolean; settings: CoeSettings; set: (s: CoeSettings) => void; tab: Tab; setTab: (t: Tab) => void; convCount: number;
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
    <Modal title="Settings" onClose={onClose} wide>
      <Seg label="Settings" value={tab} onChange={setTab} options={[{ value: 'ai' as Tab, label: 'Your AI' }, { value: 'chat' as Tab, label: 'Chat' }, { value: 'data' as Tab, label: 'Your data' }, ...(owner ? [{ value: 'connect' as Tab, label: 'Server' }] : [])]} />

      {tab === 'connect' && (
        <div className="cx-form">
          <p className="tx cx-small">This is Coe&apos;s own server, the one everyone uses by default. Only you see this tab.</p>
          <div className="cx-fr"><label className="label" htmlFor="cx-url">Server address</label>
            <input id="cx-url" className="cx-in" value={settings.serverUrl} placeholder="https://coe-ai.your-name.workers.dev" spellCheck={false} autoComplete="off" onChange={(e) => up({ serverUrl: e.target.value })} /></div>
          <div className="cx-fr"><label className="label" htmlFor="cx-code">Access code (if you set one)</label>
            <input id="cx-code" className="cx-in" type="password" value={settings.code} autoComplete="off" onChange={(e) => up({ code: e.target.value })} /></div>
          <details className="cx-how">
            <summary>Set up the server (3 steps)</summary>
            <ol className="tx">
              <li>In Cloudflare, make a Worker and paste in the server code.</li>
              <li>Add your key to it as a secret called <code>API_KEY</code>, and your site address as <code>ALLOWED_ORIGINS</code>.</li>
              <li>Deploy it and paste its address above.</li>
            </ol>
            <div className="cx-actions"><CopyButton text={WORKER_CODE} label="Copy server code" /><button type="button" className="btn small" onClick={() => downloadText('coe-ai-worker.js', WORKER_CODE, 'text/javascript')}>Save as file</button></div>
            <p className="tx cx-small">The key stays in Cloudflare. This site never sees it, and it is never in this site&apos;s code.</p>
          </details>
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
                <select id="cx-prov" className="cx-in" value={settings.provider} onChange={(e) => { up({ provider: e.target.value }); setTest({ state: 'idle', text: '' }); }}>
                  {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}{settings.keys[p.id] ? '  \u2713 key saved' : ''}</option>)}
                </select></div>
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

      {tab === 'chat' && (
        <div className="cx-form">
          <div className="cx-fr"><label className="label" htmlFor="cx-name">What should Coe call you?</label>
            <input id="cx-name" className="cx-in" type="text" maxLength={30} value={settings.name} placeholder="Your first name" autoComplete="off" onChange={(e) => up({ name: e.target.value })} /></div>
          <div className="cx-fr"><label className="label" htmlFor="cx-sys">Standing instructions</label>
            <textarea id="cx-sys" className="cx-in tall" rows={5} value={settings.system} placeholder="For example: Keep answers short. I am learning to code." onChange={(e) => up({ system: e.target.value })} /></div>
          <div className="cx-fr"><span className="label" id="cx-cr">Creativity</span>
            <Seg labelledBy="cx-cr" value={settings.creativity} onChange={(creativity) => up({ creativity })} options={[{ value: 'default', label: 'Usual' }, { value: 'precise', label: 'Precise' }, { value: 'balanced', label: 'Balanced' }, { value: 'creative', label: 'Creative' }]} /></div>
          <div className="cx-fr"><span className="label" id="cx-en">Enter key</span>
            <Seg labelledBy="cx-en" value={settings.enter} onChange={(enter) => up({ enter })} options={[{ value: 'send', label: 'Sends' }, { value: 'newline', label: 'New line' }]} /></div>
          <div className="cx-fr"><span className="label" id="cx-sz">Text size</span>
            <Seg labelledBy="cx-sz" value={settings.size} onChange={(size) => up({ size })} options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }]} /></div>
        </div>
      )}

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
    </Modal>
  );
}
