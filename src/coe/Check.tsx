'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { copyText } from '@/lib/copy';
import { COE_MODELS, canUse, modelByKey, type ModelKey } from '@/lib/coe/models';
import { applyCredits, counted, planInfo, planNow, refreshStatus } from '@/lib/coe/account';
import { ErrorBox } from './ErrorBox';
import { isOwner } from '@/lib/coe/owner';
import type { ErrAct } from '@/lib/coe/errors';
import { connection, modeOf, type CoeSettings } from '@/lib/coe/settings';
import type { CoeError } from '@/lib/coe/client';
import { countMessage, usage } from './store';
import { applyFix, check, detect, shift, LANGS, langName, type Finding, type Lang, type Severity } from '@/check';
import { askCoe } from '@/check/coe';
import { EXAMPLES, langFromName } from '@/check/examples';
import { starts } from '@/check/text';

const LH = 22, PAD = 10, MAX_LINES = 600, MAX_CHARS = 200000;
const KEY = 'coe:check';
type Pick = Lang | 'auto';
interface Saved { code: string; lang: Pick; notes: string }
const SEV: Record<Severity, string> = { error: 'Error', warning: 'Warning', tip: 'Tip' };
const rank: Record<Severity, number> = { error: 0, warning: 1, tip: 2 };

const readSaved = (): Saved => { try { const j = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (j && typeof j.code === 'string') return { code: j.code, lang: j.lang ?? 'auto', notes: j.notes ?? '' }; } catch { /* none */ } return { code: '', lang: 'auto', notes: '' }; };

export function Check({ settings, onUsed, onSettings, onUpgrade, say }: { settings: CoeSettings; onUsed: () => void; onSettings: () => void; onUpgrade: (s: string) => void; say: (s: string) => void }) {
  const [init] = useState(readSaved);
  const [code, setCode] = useState(init.code);
  const [pick, setPick] = useState<Pick>(init.lang);
  const [notes, setNotes] = useState(init.notes);
  const [local, setLocal] = useState<Finding[]>([]);
  const [pending, setPending] = useState(!!init.code.trim());
  const [coe, setCoe] = useState<Finding[]>([]);
  const [coeFor, setCoeFor] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErrRaw] = useState<{ kind?: string; text: string } | null>(null);
  const setErr = (t: string | { kind?: string; text: string }) => setErrRaw(!t ? null : typeof t === 'string' ? { text: t } : t);
  const [model, setModel] = useState<ModelKey>('core');
  const [show, setShow] = useState<Record<Severity, boolean>>({ error: true, warning: true, tip: true });
  const [active, setActive] = useState<string | null>(null);
  const [scroll, setScroll] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const tabFree = useRef(false);

  const eff: Lang = pick === 'auto' ? detect(code) : pick;
  const lines = useMemo(() => code.split('\n'), [code]);
  const conn = connection(settings);

  useEffect(() => { const t = setTimeout(() => { try { sessionStorage.setItem(KEY, JSON.stringify({ code, lang: pick, notes })); } catch { /* storage blocked */ } }, 300); return () => clearTimeout(t); }, [code, pick, notes]);

  // The local check runs as you type. It costs nothing and never leaves the device.
  useEffect(() => {
    if (!code.trim()) { setLocal([]); setPending(false); return; }
    let dead = false; setPending(true);
    const t = setTimeout(async () => { const r = await check(code, eff); if (!dead) { setLocal(r); setPending(false); } }, 320);
    return () => { dead = true; clearTimeout(t); };
  }, [code, eff]);

  const stale = coe.length > 0 && coeFor !== null && coeFor !== code;
  const all = useMemo(() => [...local, ...coe].sort((a, b) => a.line - b.line || rank[a.severity] - rank[b.severity]), [local, coe]);
  const counts = useMemo(() => ({ error: all.filter((f) => f.severity === 'error').length, warning: all.filter((f) => f.severity === 'warning').length, tip: all.filter((f) => f.severity === 'tip').length }), [all]);
  const shown = all.filter((f) => show[f.severity]);
  const byLine = useMemo(() => { const m = new Map<number, Severity>(); for (const f of all) for (let l = f.line; l <= (f.endLine ?? f.line); l++) { const p = m.get(l); if (!p || rank[f.severity] < rank[p]) m.set(l, f.severity); } return m; }, [all]);

  const jump = useCallback((f: Finding) => {
    setActive(f.id);
    const el = ta.current; if (!el) return;
    const st = starts(code), a = st[Math.min(f.line, st.length) - 1] ?? 0, b = st[f.line] !== undefined ? st[f.line] - 1 : code.length;
    el.focus({ preventScroll: true });
    el.setSelectionRange(f.col ? Math.min(a + f.col - 1, b) : a, f.col ? Math.min(a + f.col - 1, b) : b);
    el.scrollTop = Math.max(0, (f.line - 4) * LH);
    setScroll(el.scrollTop);
  }, [code]);

  const apply = (f: Finding) => {
    if (!f.fix) return;
    const fresh = coeFor === code;
    const next = applyFix(code, f.fix);
    setCode(next); setCoe((c) => shift(c, f.fix!, f.id)); if (fresh) setCoeFor(next);
    setActive(null); say(`Fixed line ${f.fix.from}.`);
  };
  const copyFix = async (f: Finding) => { if (f.fix) say((await copyText(f.fix.text)) ? 'Copied.' : 'Could not copy.'); };

  const load = (text: string, name: string) => {
    const t = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
    if (text.length > MAX_CHARS) say('That file is long, so only the first part was loaded.');
    setCode(t.replace(/\r\n?/g, '\n')); setCoe([]); setCoeFor(null); setSummary(''); setErr(''); setActive(null);
    const l = langFromName(name); setPick(l ?? 'auto');
  };
  const onFile = (f?: File | null) => { if (!f) return; if (f.size > 2_000_000) { say('That file is too big.'); return; } f.text().then((t) => load(t, f.name)).catch(() => say('Could not read that file.')); };

  const ask = async () => {
    if (busy) { abort.current?.abort(); return; }
    if (!code.trim()) { say('Paste some code first.'); ta.current?.focus(); return; }
    if (!conn.ok) { onSettings(); say(conn.why); return; }
    const pl = planInfo(settings);
    if (!canUse(planNow(settings), model)) { onUpgrade(`${modelByKey(model).name} needs the Pro plan.`); return; }
    if (modeOf(settings) !== 'key' && !counted(settings) && usage().today >= pl.perDay) { onUpgrade(`You have used all ${pl.perDay} credits for today on ${pl.name}. They come back at midnight (UTC).`); return; }
    if (lines.length > MAX_LINES) { setErr(`Coe can read ${MAX_LINES} lines at a time. Cut it down to the part that goes wrong.`); return; }
    const ctl = new AbortController(); abort.current = ctl; setBusy(true); setErr('');
    const snapshot = code;
    try {
      const r = await askCoe(settings, { code: snapshot, lang: eff, notes, known: local, model, signal: ctl.signal });
      setCoe(r.findings); setCoeFor(snapshot); setSummary(r.summary); if (r.credits) applyCredits(r.credits); else if (!counted(settings)) countMessage(); onUsed();
      if (!r.findings.length && !r.summary) setSummary('Coe found nothing to change.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { const k = (e as CoeError).kind; setErr({ kind: k, text: (e as CoeError).message || '' }); if (k === 'credits' || k === 'plan' || k === 'signin') void refreshStatus(settings); }
    } finally { abort.current = null; setBusy(false); }
  };
  useEffect(() => () => abort.current?.abort(), []);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { tabFree.current = true; return; }
    if (e.key === 'Tab' && !tabFree.current && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget, a = el.selectionStart, b = el.selectionEnd;
      const next = code.slice(0, a) + '  ' + code.slice(b);
      setCode(next); requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 2; });
      return;
    }
    if (e.key !== 'Shift' && e.key !== 'Tab') tabFree.current = false;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void ask(); }
  };

  const clear = () => { setCode(''); setCoe([]); setCoeFor(null); setSummary(''); setErr(''); setActive(null); ta.current?.focus(); };
  const empty = !code.trim();
  const topWord = (f: Finding) => (f.endLine && f.endLine > f.line ? `Lines ${f.line}–${f.endLine}` : `Line ${f.line}`);
  const old = (f: Finding) => (f.fix ? lines.slice(f.fix.from - 1, f.fix.to) : []);

  return (
    <div className="cd" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}>
      {/* ------------------------------------------------ the code */}
      <section className="cd-pane" aria-label="Your code">
        <div className="cd-bar">
          <label className="cd-lang"><span className="d">Language</span>
            <select className="cd-sel" value={pick} onChange={(e) => setPick(e.target.value as Pick)} aria-label="Language">
              <option value="auto">Auto{!empty ? ` (${langName(eff)})` : ''}</option>
              {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select></label>
          <span className="cx-grow" />
          <input ref={file} type="file" hidden accept=".js,.mjs,.cjs,.jsx,.ts,.tsx,.json,.html,.htm,.css,.py,.sql,.txt" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="btn small" onClick={() => file.current?.click()}><UiIcon name="attach" size={15} />Open file</button>
          <button type="button" className="btn small" onClick={clear} disabled={empty}><UiIcon name="close" size={15} />Clear</button>
        </div>
        <div className="cd-ed">
          <div className="cd-gut" aria-hidden="true">
            <div style={{ transform: `translateY(${PAD - scroll}px)` }}>
              {lines.map((_, i) => { const s = byLine.get(i + 1); return <i key={i} className={s ? `s-${s}` : undefined} onClick={() => { const f = all.find((x) => x.line === i + 1); if (f) jump(f); }}>{i + 1}</i>; })}
            </div>
          </div>
          <div className="cd-wrap">
            <div className="cd-bands" aria-hidden="true">
              <div style={{ transform: `translateY(${-scroll}px)` }}>
                {all.map((f) => { const end = f.endLine ?? f.line; return <b key={f.id} className={`s-${f.severity}${active === f.id ? ' on' : ''}`} style={{ top: PAD + (f.line - 1) * LH, height: (end - f.line + 1) * LH }} />; })}
              </div>
            </div>
            <textarea ref={ta} className="cd-ta" value={code} spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off" wrap="off" aria-label="Your code"
              onChange={(e) => setCode(e.target.value)} onScroll={(e) => setScroll(e.currentTarget.scrollTop)} onKeyDown={onKey} onBlur={() => { tabFree.current = false; }} />
            {empty && (
              <div className="cd-start">
                <b className="d">Paste code here</b>
                <span className="tx">or drop a file</span>
                <div className="cd-try"><span className="d">Try</span>{EXAMPLES.map((x) => <button key={x.lang} type="button" className="btn small" onClick={() => { load(x.code, ''); setPick(x.lang); }}>{x.label}</button>)}</div>
              </div>
            )}
          </div>
        </div>
        <input className="cx-in cd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What goes wrong? (optional)" maxLength={600} aria-label="What goes wrong" onKeyDown={(e) => { if (e.key === 'Enter') void ask(); }} />
        <div className="cd-actions">
          <button type="button" className={`btn gold${busy ? ' busy' : ''}`} onClick={ask}>{busy ? <><UiIcon name="stop" size={16} />Stop</> : <><UiIcon name="wand" size={18} />Ask Coe</>}</button>
          <select className="cd-sel cd-model" value={model} onChange={(e) => setModel(e.target.value as ModelKey)} aria-label="Model" disabled={busy}>
            {COE_MODELS.map((m) => <option key={m.key} value={m.key}>{m.name.replace(/^Coe /, '')}{canUse(planNow(settings), m.key) ? '' : ' (Pro)'}</option>)}
          </select>
          <span className="cx-grow" />
          {!conn.ok && <span className="tx cd-fine">{modeOf(settings) === 'key' ? conn.why.replace(/ in Settings\.?$/, '.') : 'Coe is not switched on yet.'} {(isOwner() || modeOf(settings) === 'key') && <button type="button" className="cx-link" onClick={onSettings}>Open Settings</button>}</span>}
        </div>
      </section>

      {/* ------------------------------------------------ the results */}
      <section className="cd-pane cd-res" aria-label="Results" aria-live="polite">
        <div className="cd-bar">
          <h2 className="d cd-h">Results</h2>
          <span className="cx-grow" />
          {(['error', 'warning', 'tip'] as Severity[]).map((s) => (
            <button key={s} type="button" className={`cd-count s-${s}`} aria-label={`${counts[s]} ${SEV[s].toLowerCase()}${counts[s] === 1 ? '' : 's'}`} aria-pressed={show[s]} onClick={() => setShow((o) => ({ ...o, [s]: !o[s] }))} disabled={!counts[s]} title={`${show[s] ? 'Hide' : 'Show'} ${SEV[s].toLowerCase()}s`}>
              <b className="d">{counts[s]}</b><span>{SEV[s]}{counts[s] === 1 ? '' : 's'}</span>
            </button>
          ))}
        </div>
        <div className="cd-list cx-scroll">
          {err && (err.kind ? <ErrorBox own={modeOf(settings) === 'key'} kind={err.kind} text={err.text} canRetry={false} onAct={(a: ErrAct) => { if (a === 'settings') onSettings(); else if (a === 'plans') window.location.href = '/plans/'; else if (a === 'signin') onUpgrade('Sign in from the sidebar, then try again.'); }} /> : <div className="cd-note bad tx" role="alert"><UiIcon name="alert" size={18} /><span>{err.text}</span></div>)}
          {stale && <div className="cd-note tx"><UiIcon name="info" size={18} /><span>You changed the code since Coe looked. Its notes may be out of date.</span><button type="button" className="btn small" onClick={ask}>Ask again</button></div>}
          {summary && !err && <div className="cd-note coe tx"><span className="cd-src d">Coe</span><span>{summary}</span></div>}
          {busy && <div className="cd-note tx"><span className="cx-dots" aria-hidden="true"><i /><i /><i /></span><span>Coe is reading your code…</span></div>}
          {empty ? <p className="cd-empty tx">Results show here. Your code is checked as you type, on this device.</p>
            : pending && !all.length ? <p className="cd-empty tx">Checking…</p>
            : !all.length && !busy ? <div className="cd-ok"><UiIcon name="check" size={26} /><b className="d">No problems found</b><span className="tx">Ask Coe for a deeper look.</span></div>
            : (
              <ol className="cd-items">
                {shown.map((f) => (
                  <li key={f.id} className={`cd-f s-${f.severity}${active === f.id ? ' on' : ''}`}>
                    <div className="cd-f-head">
                      <span className="cd-sev d">{SEV[f.severity]}</span>
                      <button type="button" className="cd-line d" onClick={() => jump(f)} aria-label={`Go to ${topWord(f).toLowerCase()}`}>{topWord(f)}</button>
                      {f.source === 'coe' && <span className="cd-src d">Coe</span>}
                    </div>
                    <p className="cd-title tx">{f.title}</p>
                    {f.why && <p className="cd-why tx">{f.why}</p>}
                    {f.idea && <p className="cd-idea tx"><b>Try:</b> {f.idea}</p>}
                    {f.fix && (
                      <>
                        <pre className="cd-diff" aria-label="Change">{old(f).slice(0, 6).map((l, i) => <code key={'o' + i} className="del">{l || ' '}</code>)}{f.fix.text === '' ? null : f.fix.text.split('\n').slice(0, 6).map((l, i) => <code key={'n' + i} className="add">{l || ' '}</code>)}</pre>
                        <div className="cd-f-btns">
                          {!(f.source === 'coe' && stale) && <button type="button" className="btn small gold" onClick={() => apply(f)}>Apply fix</button>}
                          <button type="button" className="btn small" onClick={() => copyFix(f)}><UiIcon name="copy" size={14} />Copy</button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          {!empty && all.length > 0 && shown.length === 0 && <p className="cd-empty tx">All of these are hidden. Press a count above to show them.</p>}
        </div>
      </section>
    </div>
  );
}
