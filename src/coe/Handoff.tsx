'use client';
/** When one Coe cannot do something the other can. On the website: "I can't do that here, but I can do it on Coe Mini", with the right install button for the person's browser. */
import { useEffect, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { MINI_STORE, sendToMini, useExtension } from '@/lib/coe/extension';
import { INFO_ICON } from './ErrorBox';

export type MiniBrowser = 'chrome' | 'edge' | 'firefox' | 'other';
/** Which browser this is, so the button shows its own logo and gives the file that browser needs. Chrome, Brave, Opera and Vivaldi share Chrome's. */
export function detectBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): MiniBrowser {
  if (/android|iphone|ipad|ipod|mobile/i.test(ua)) return 'other';   // phones and tablets cannot add browser extensions
  if (/firefox\//i.test(ua)) return 'firefox';
  if (/edg(e|a|ios)?\//i.test(ua)) return 'edge';
  if (/chrome\/|chromium\/|crios\//i.test(ua)) return 'chrome';
  return 'other';
}
const NAME: Record<Exclude<MiniBrowser, 'other'>, string> = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox' };
/** The install button: the person's own browser logo and the store page for that browser (Chrome's store also serves Brave, Opera and Vivaldi). The website carries no copy of Coe Mini, so until a store has approved it the button says so instead of pointing at nothing. Store addresses live in MINI_STORE. */
export function MiniGet({ browser }: { browser: MiniBrowser }) {
  if (browser === 'other') return <p className="tx cx-small">Coe Mini works in Chrome, Edge and Firefox on a computer. Phones and tablets cannot add browser extensions.</p>;
  const store = MINI_STORE[browser], name = NAME[browser];
  const inner = <><img className="ex-logo" src={`/browsers/${browser}.svg`} alt="" width={22} height={22} />{store ? `Add Coe Mini to ${name}` : `Coe Mini for ${name} is coming soon`}</>;
  return (
    <div className="mini-get">
      {store ? <a className="btn primary mini-add" href={store} target="_blank" rel="noopener noreferrer">{inner}</a> : <span className="btn mini-add off" aria-disabled="true">{inner}</span>}
      {store ? <p className="tx cx-small">It opens {browser === 'edge' ? 'Edge Add-ons' : browser === 'firefox' ? 'Firefox Add-ons' : 'the Chrome Web Store'}. Add it, pin it, then sign in with the same account.</p> : <p className="tx cx-small">It will be added from {browser === 'edge' ? 'Edge Add-ons' : browser === 'firefox' ? 'Firefox Add-ons' : 'the Chrome Web Store'}, as soon as the store has approved it.</p>}
    </div>
  );
}

function parse(code: string): { why?: string; ask?: string; text?: string } { try { const j = JSON.parse(code); return j && typeof j === 'object' ? j : {}; } catch { return {}; } }

/** ```coe-mini {"why":"..."} : Coe wrote it when asked for something only Coe Mini does (a job on the page they have open, reading or marking that page). */
export function MiniNeed({ code, closed }: { code: string; closed: boolean }) {
  const { state } = useExtension(closed);
  const [b, setB] = useState<MiniBrowser>('chrome'), [sent, setSent] = useState(false);
  useEffect(() => { setB(detectBrowser()); }, []);
  if (!closed) return null;
  const j = parse(code), why = String(j.why ?? '').slice(0, 200), ask = String(j.ask ?? '').slice(0, 600).trim();
  return (
    <div className="mini-need" role="group" aria-label="This is a job for Coe Mini">
      <b className="d">This is a job for Coe Mini</b>
      {why && <p className="tx">{why}</p>}
      {state === 'on' && (sent
        ? <p className="tx cx-small" role="status"><UiIcon name="info" size={14} />Sent. Open Coe Mini on the page you want (the Coe Mini button in your toolbar, or Ctrl+Shift+Y). It will ask before it uses this.</p>
        : <>
          <p className="tx cx-small"><UiIcon name="info" size={14} />Coe Mini is on. Open it on the page you want (the Coe Mini button in your toolbar, or Ctrl+Shift+Y).</p>
          {ask && <button type="button" className="btn small gold" onClick={() => { sendToMini(ask); setSent(true); }}>Send this to Coe Mini</button>}
        </>)}
      {state === 'off' && <MiniGet browser={b} />}
    </div>
  );
}

/** ```coe-switch {"text":"..."} : written in Coe Mini when the person asked for something only Coe can do. Opened here, the person is already in Coe, so it offers to do it now. */
export function SwitchNote({ code, closed, ask }: { code: string; closed: boolean; ask?: (t: string) => void }) {
  if (!closed) return null;
  const j = parse(code), text = String(j.text ?? '').slice(0, 2000).trim();
  return (
    <div className="mini-need" role="group" aria-label="This needs Coe">
      <b className="d">This one is for Coe</b>
      <p className="tx">Coe Mini could not do this, but Coe can. You are in Coe now.</p>
      {text && ask && <div className="cm-act"><button type="button" className="btn primary" onClick={() => ask(text)}>Do it here</button></div>}
    </div>
  );
}

/** Coe Mini sent a request here. Nothing happens until the person says so: it never replaces what they are doing by itself. */
export function Incoming({ text, chat, onUse, onNo }: { text: string; chat?: boolean; onUse: () => void; onNo: () => void }) {
  const short = text.length > 160 ? text.slice(0, 160).trimEnd() + '…' : text;
  return (
    <div className="cx-err grey open cx-in" role="group" aria-label="A request from Coe Mini">
      <span className="cx-err-i" aria-hidden>{INFO_ICON}</span>
      <h4 className="d"><span className="cx-err-t">From Coe Mini</span></h4>
      <p className="tx">&ldquo;{short}&rdquo;</p>
      <div className="cx-err-acts"><button type="button" className="btn small gold" onClick={onUse}>{chat ? 'Continue that chat' : 'Use it in a new chat'}</button><button type="button" className="btn small" onClick={onNo}>Not now</button></div>
    </div>
  );
}
