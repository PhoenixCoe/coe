'use client';
import { useEffect, useRef, useState } from 'react';
import { CopyButton, downloadText } from '@/ui/copy';
import { Seg } from '@/ui/Seg';
import { UiIcon } from '@/ui/icons';
import { ask, type CoeError } from '@/lib/coe/client';
import { COE_MODELS, DEFAULT_MODEL_IDS } from '@/lib/coe/models';
import { connection, type CoeSettings } from '@/lib/coe/settings';
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
type Tab = 'connect' | 'chat' | 'data';
export function SettingsPanel({ settings, set, tab, setTab, convCount, onExport, onImport, onDeleteAll, onClose }: {
  settings: CoeSettings; set: (s: CoeSettings) => void; tab: Tab; setTab: (t: Tab) => void; convCount: number;
  onExport: () => void; onImport: (f: File) => void; onDeleteAll: () => void; onClose: () => void;
}) {
  const up = (patch: Partial<CoeSettings>) => set({ ...settings, ...patch });
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'bad'; text: string }>({ state: 'idle', text: '' });
  const [sure, setSure] = useState(false);
  const [show, setShow] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const c = connection(settings);

  const run = async () => {
    setTest({ state: 'busy', text: 'Asking…' });
    try {
      const r = await ask(settings, { model: 'swift', messages: [{ role: 'user', text: 'Reply with the single word: ready' }], maxTokens: 16 });
      setTest({ state: 'ok', text: r.text.trim() ? `Connected. It said: “${r.text.trim().slice(0, 40)}”.` : 'Connected.' });
    } catch (e) { setTest({ state: 'bad', text: (e as CoeError).message || 'That did not work.' }); }
  };

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <Seg label="Settings" value={tab} onChange={setTab} options={[{ value: 'connect', label: 'Connect' }, { value: 'chat', label: 'Chat' }, { value: 'data', label: 'Your data' }]} />

      {tab === 'connect' && (
        <div className="cx-form">
          <div className="cx-fr"><span className="label" id="cx-how">How to connect</span>
            <Seg labelledBy="cx-how" value={settings.mode} onChange={(mode) => up({ mode })} options={[{ value: 'server', label: 'My Coe server' }, { value: 'key', label: 'My own key' }]} /></div>

          {settings.mode === 'server' ? (
            <>
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
            </>
          ) : (
            <>
              <div className="cx-fr"><span className="label" id="cx-prov">Provider</span>
                <Seg labelledBy="cx-prov" value={settings.provider} onChange={(provider) => up({ provider })} options={[{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai', label: 'OpenAI style' }]} /></div>
              <div className="cx-fr"><label className="label" htmlFor="cx-base">API address{settings.provider === 'anthropic' ? ' (leave empty for the usual one)' : ''}</label>
                <input id="cx-base" className="cx-in" value={settings.baseUrl} placeholder={settings.provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'} spellCheck={false} autoComplete="off" onChange={(e) => up({ baseUrl: e.target.value })} /></div>
              <div className="cx-fr"><label className="label" htmlFor="cx-key">Your key</label>
                <span className="cx-pw"><input id="cx-key" className="cx-in" type={show ? 'text' : 'password'} value={settings.apiKey} spellCheck={false} autoComplete="off" onChange={(e) => up({ apiKey: e.target.value })} />
                  <button type="button" className="btn small" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button></span></div>
              <p className="cx-warn tx"><b className="d">Only on your own device.</b> The key is saved in this browser so it can be used from here. Anyone who can open this browser can use it, so never do this on a shared or school computer.</p>
            </>
          )}

          <details className="cx-how">
            <summary>Model names</summary>
            <p className="tx cx-small">Which model sits behind each Coe model. Change these if your provider uses other names.</p>
            {COE_MODELS.map((m) => (
              <div key={m.key} className="cx-fr"><label className="label" htmlFor={`cx-m-${m.key}`}>{m.name}</label>
                <input id={`cx-m-${m.key}`} className="cx-in" value={settings.models[m.key]} spellCheck={false} placeholder={DEFAULT_MODEL_IDS[m.key]} onChange={(e) => up({ models: { ...settings.models, [m.key]: e.target.value } })} /></div>
            ))}
          </details>

          <div className="cx-actions">
            <button type="button" className="btn gold" disabled={!c.ok || test.state === 'busy'} onClick={run}>{test.state === 'busy' ? 'Testing' : 'Test the connection'}</button>
            <span className={`cx-test ${test.state}`} role="status">{c.ok ? test.text : c.why.replace(/ in Settings\.?$/, '.')}</span>
          </div>
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
            <button type="button" className="btn" disabled={!settings.apiKey && !settings.code} onClick={() => up({ apiKey: '', code: '' })}>Forget my key and code</button>
            {!sure
              ? <button type="button" className="btn" disabled={!convCount} onClick={() => setSure(true)}>Delete all conversations</button>
              : <span className="cx-sure"><b className="d">Delete all {convCount}?</b><button type="button" className="btn small" onClick={() => { onDeleteAll(); setSure(false); }}>Yes, delete</button><button type="button" className="btn small" onClick={() => setSure(false)}>No</button></span>}
          </div>
        </div>
      )}
    </Modal>
  );
}
