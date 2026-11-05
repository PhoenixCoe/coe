'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CoeStar, CoeWordmark } from '@/ui/Mark';
import { UiIcon } from '@/ui/icons';
import { downloadText } from '@/ui/copy';
import { CoeError, stream, type ChatMsg } from '@/lib/coe/client';
import { COE_MODELS, MAX_REPLY, canUse, modelByKey, type ModelKey } from '@/lib/coe/models';
import { applyCredits, counted, creditsNow, onStatus, planInfo, planNow, refreshStatus, status } from '@/lib/coe/account';
import { explain as describeErr, type ErrAct } from '@/lib/coe/errors';
import { ErrorBox } from './ErrorBox';
import { isOwner } from '@/lib/coe/owner';
import { modeOf, connection, loadSettings, saveSettings, type CoeSettings } from '@/lib/coe/settings';
import { toImg } from './images';
import { renderMarkdown } from './markdown';
import { Check } from './Check';
import { Account } from './Account';
import { cloudOn, put as cloudPut, remove as cloudRemove, removeAll as cloudRemoveAll, session, sync as cloudSync } from '@/lib/coe/cloud';
import { BASE_COE, REDO_NOTE, STARTERS, greeting } from './prompts';
import { Modal, SettingsPanel, Upgrade, type Tab } from './Panels';
import { bucket, countMessage, dataUrl, deleteAll, deleteConv, exportAll, importAll, loadConv, loadIndex, saveConv, titleFrom, toMarkdown, uid, usage, type Conv, type ConvMeta, type Img, type Msg } from './store';

const CONTEXT_LIMIT = 80000;           // characters sent with each message; older ones are left out
const PICTURE_COST = 1600;             // a picture counts as this many characters when trimming

const blank = (model: ModelKey): Conv => ({ id: uid(), title: 'New conversation', created: Date.now(), updated: Date.now(), model, messages: [] });

/** Turns saved messages into what is sent: no failed or empty replies, same-speaker runs joined, oldest dropped past the limit. */
function context(messages: Msg[]): { list: ChatMsg[]; trimmed: boolean } {
  const joined: ChatMsg[] = [];
  for (const m of messages) {
    if (m.role === 'assistant' && (m.error || !m.text.trim())) continue;
    const last = joined[joined.length - 1];
    const imgs = (m.images ?? []).map((i) => ({ type: i.type, data: i.data }));
    if (last && last.role === m.role) { last.text = `${last.text}\n\n${m.text}`; last.images = [...(last.images ?? []), ...imgs]; }
    else joined.push({ role: m.role, text: m.text, images: imgs.length ? imgs : undefined });
  }
  const size = (m: ChatMsg) => m.text.length + (m.images?.length ?? 0) * PICTURE_COST;
  let total = 0, from = joined.length;
  while (from > 0 && total + size(joined[from - 1]) <= CONTEXT_LIMIT) { total += size(joined[from - 1]); from--; }
  if (from === joined.length && joined.length) from = joined.length - 1;     // always send the last message
  let list = joined.slice(from);
  while (list.length && list[0].role !== 'user') list = list.slice(1);
  return { list, trimmed: from > 0 };
}

const Rich = memo(function Rich({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className="cx-md tx" dangerouslySetInnerHTML={{ __html: html }} />;
});

function Rename({ value, onDone, className }: { value: string; onDone: (v: string | null) => void; className?: string }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return <input ref={ref} className={`cx-rename ${className ?? ''}`} value={v} maxLength={80} aria-label="Conversation name" onChange={(e) => setV(e.target.value)} onBlur={() => onDone(v)}
    onKeyDown={(e) => { if (e.key === 'Enter') onDone(v); if (e.key === 'Escape') onDone(null); e.stopPropagation(); }} />;
}

export interface ChatProps { initialList: ConvMeta[]; initialConv: Conv | null }

export function Chat({ initialList, initialConv }: ChatProps) {
  const [settings, setSettingsState] = useState<CoeSettings>(() => loadSettings());
  const [list, setList] = useState<ConvMeta[]>(initialList);
  const [tool, setTool] = useState(() => { try { return new URLSearchParams(location.search).get('check') !== null; } catch { return false; } });   // Code check, over the chat
  const [conv, setConvState] = useState<Conv>(() => initialConv ?? blank('core'));
  const [hello] = useState(() => Math.random());
  const convRef = useRef(conv);
  const [use, setUse] = useState(() => usage());
  const [text, setText] = useState('');
  const [pics, setPics] = useState<Img[]>([]);
  const [busy, setBusy] = useState(false);
  const [side, setSide] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; sure?: boolean } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);   // a row in the list
  const [titling, setTitling] = useState(false);                     // the name in the header
  const [picker, setPicker] = useState(false);
  const [panel, setPanel] = useState<null | 'settings'>(() => { try { return new URLSearchParams(location.search).get('settings') !== null ? 'settings' : null; } catch { return null; } });   // ?settings opens Settings, so other tools can point here
  const [tab, setTab] = useState<Tab>('chat');
  const owner = isOwner();
  const openSetup = (why?: string) => { if (modeOf(loadSettings()) === 'key') { setTab('ai'); setPanel('settings'); if (why) say(why); } else if (owner) { setTab('connect'); setPanel('settings'); if (why) say(why); } else say('Coe is not switched on yet. Try again later.'); };
  const [upgrade, setUpgrade] = useState('');
  const [big, setBig] = useState<Img | null>(null);
  const [drop, setDrop] = useState(false);
  const [away, setAway] = useState(false);
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  const [toolSeen, setToolSeen] = useState(tool);   // once opened, Code check stays in place (hidden), so closing it does not lose the results
  useEffect(() => { if (tool) setToolSeen(true); }, [tool]);
  const [acct, setAcct] = useState(false);
  const [me, setMe] = useState<string | null>(() => (cloudOn ? session()?.email ?? null : null));

  const [, bump] = useState(0);
  useEffect(() => onStatus(() => bump((n) => n + 1)), []);

  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  const setConv = useCallback((c: Conv) => { convRef.current = c; setConvState(c); }, []);
  const setSettings = useCallback((s: CoeSettings) => { setSettingsState(s); saveSettings(s); }, []);
  const refreshList = useCallback(async () => setList(await loadIndex()), []);
  const say = useCallback((t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? '' : x)), 2600); }, []);
  const doSync = useCallback(async () => { try { if (await cloudSync()) await refreshList(); } catch { /* offline: this device keeps its own copy */ } }, [refreshList]);

  useEffect(() => { void refreshStatus(settings); }, [me, settings.serverUrl, settings.code]);   // eslint-disable-line react-hooks/exhaustive-deps
  const plan = planInfo(settings);
  const cr = creditsNow(settings);
  const usedNow = cr ? cr.used : use.today;
  const perDay = cr ? cr.limit : plan.perDay;
  const keyOn = modeOf(settings) === 'key';
  const planName = keyOn ? 'Own key' : plan.name;
  const conn = connection(settings);
  const model = modelByKey(conv.model);
  const left = Math.max(0, perDay - usedNow);
  const names = useCallback((k: ModelKey) => modelByKey(k).name, []);
  const streaming = busy;
  const assistant = 'Coe';

  // Another tab or the settings window may change the settings.
  useEffect(() => {
    const on = () => setSettingsState(loadSettings());
    window.addEventListener('pmc:coe-settings', on); return () => window.removeEventListener('pmc:coe-settings', on);
  }, []);

  useEffect(() => { try { if (conv.messages.length) sessionStorage.setItem('pmc:coe:last', conv.id); else sessionStorage.removeItem('pmc:coe:last'); } catch { /* storage blocked */ } }, [conv.id, conv.messages.length]);

  // ---------------------------------------------------------------- scrolling
  const toBottom = useCallback((smooth = false) => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }, []);
  useEffect(() => { if (!conv.messages.length) { const el = scroller.current; if (el) el.scrollTop = 0; } else if (stick.current) toBottom(); }, [conv.messages, toBottom]);
  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    stick.current = near; setAway(!near && el.scrollHeight > el.clientHeight + 240);
  };

  // ---------------------------------------------------------------- the box you type in
  useEffect(() => {
    const el = box.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text, conv.id]);
  useEffect(() => { box.current?.focus({ preventScroll: true }); }, [conv.id]);

  const addFiles = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) { if (files.length) say('Only pictures can be added.'); return; }
    const room = plan.images - pics.length;
    if (room <= 0) { say(`${plan.name} allows ${plan.images} pictures in one message.`); return; }
    const take = imgs.slice(0, room);
    const out: Img[] = [];
    for (const f of take) { try { out.push(await toImg(f)); } catch (e) { say((e as Error).message); } }
    if (out.length) setPics((p) => [...p, ...out].slice(0, plan.images));
    if (imgs.length > take.length) say(`Only ${plan.images} pictures fit in one message on ${plan.name}.`);
  }, [plan.images, plan.name, pics.length, say]);

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); void addFiles(files); }
  };

  // ---------------------------------------------------------------- saving
  const persist = useCallback(async (c: Conv) => { if (c.messages.length) { await saveConv(c); await refreshList(); if (cloudOn && session()) cloudPut(c).catch(() => say('Could not save to your account just now. It is kept on this device.')); } }, [refreshList, say]);

  // ---------------------------------------------------------------- asking
  const run = useCallback(async (base: Conv, opts: { free?: boolean; wrong?: string } = {}) => {
    const s = loadSettings();
    const pn = planNow(s), pl = planInfo(s);
    const c0 = connection(s);
    if (!c0.ok) { openSetup(c0.why); return; }
    if (!canUse(pn, base.model)) { setUpgrade(`${modelByKey(base.model).name} needs the Pro plan.`); return; }
    if (!opts.free && modeOf(s) !== 'key' && !counted(s) && usage().today >= pl.perDay) { setUpgrade(`You have used all ${pl.perDay} credits for today on ${pl.name}. They come back at midnight (UTC).`); return; }

    const { list: sent, trimmed } = context(base.messages);
    setNote(trimmed ? 'This chat is long, so the oldest messages were left out of this reply.' : '');
    const holder: Msg = { id: uid(), role: 'assistant', text: '', model: base.model, ts: Date.now() };
    let work: Conv = { ...base, messages: [...base.messages, holder], updated: Date.now() };
    if (convRef.current.id === base.id) setConv(work);
    const mine = base.id;
    const active = () => convRef.current.id === mine;
    const patch = (p: Partial<Msg>) => { work = { ...work, messages: work.messages.map((m) => (m.id === holder.id ? { ...m, ...p } : m)) }; if (active()) setConv(work); };

    const ctl = new AbortController(); abort.current = ctl; setBusy(true); stick.current = true;
    const now = new Date();
    const system = [
      BASE_COE,
      opts.wrong && `${REDO_NOTE}\n\nThe earlier answer was:\n${opts.wrong}`,
      s.system.trim() && `The person asked for these standing instructions:\n${s.system.trim()}`,
      `Today is ${now.toDateString()}.`,
    ].filter(Boolean).join('\n\n');

    let frame = 0, latest = '';
    const flush = () => { frame = 0; patch({ text: latest }); };
    try {
      const r = await stream(s, { model: base.model, system, messages: sent, maxTokens: MAX_REPLY[pn], signal: ctl.signal, redo: !!opts.free }, (t) => { latest = t; if (!frame) frame = requestAnimationFrame(flush); });
      if (frame) cancelAnimationFrame(frame);
      patch({ text: r.text, stopped: r.stopped || undefined, cut: r.cut || undefined, inTokens: r.inTokens, outTokens: r.outTokens });
      if (r.credits) applyCredits(r.credits); else if ((!r.stopped || r.text) && !opts.free && !counted(s)) setUse(countMessage());
      // A stopped reply with nothing in it is dropped.
      if (r.stopped && !r.text) work = { ...work, messages: work.messages.filter((m) => m.id !== holder.id) };
    } catch (e) {
      if (frame) cancelAnimationFrame(frame);
      const err = e as CoeError;
      let why = err.message || '';
      if (err.kind === 'bad' && base.messages.some((m) => m.images?.length)) why = (why ? why + ' ' : '') + 'If the model cannot read pictures, take the pictures out or pick another model.';
      patch({ text: latest, error: why || describeErr(err.kind, '').text, errKind: err.kind });
      if (err.kind === 'credits' || err.kind === 'plan' || err.kind === 'signin') void refreshStatus(s);
    } finally {
      work = { ...work, updated: Date.now() };
      if (active()) setConv(work);
      abort.current = null; setBusy(false);
      await persist(work);
    }
  }, [persist, say, setConv]);

  const stop = useCallback(() => abort.current?.abort(), []);

  const send = useCallback(() => {
    if (busy) return;
    const body = text.trim();
    if (!body && !pics.length) return;
    if (!connection(settings).ok) { openSetup(); return; }
    const c = convRef.current;
    const msg: Msg = { id: uid(), role: 'user', text: body, images: pics.length ? pics : undefined, ts: Date.now() };
    const title = c.messages.length ? c.title : titleFrom(body || (pics[0]?.name ?? 'Picture'));
    const next: Conv = { ...c, title, messages: [...c.messages, msg], updated: Date.now() };
    setConv(next); setText(''); setPics([]);
    void run(next);
  }, [busy, text, pics, settings, run, setConv]);

  const errAct = (a: ErrAct) => {
    if (a === 'retry') retry();
    else if (a === 'settings') openSetup();
    else if (a === 'plans') window.location.href = '/plans/';
    else setAcct(true);
  };
  const retry = useCallback(() => {
    if (busy) return;
    const c = convRef.current;
    const msgs = [...c.messages]; while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop();
    if (!msgs.length) return;
    const next = { ...c, messages: msgs }; setConv(next); void run(next);
  }, [busy, run, setConv]);

  const edit = useCallback((id: string) => {
    if (busy) return;
    const c = convRef.current; const i = c.messages.findIndex((m) => m.id === id); if (i < 0) return;
    const m = c.messages[i];
    setText(m.text); setPics(m.images ?? []);
    const next = { ...c, messages: c.messages.slice(0, i), updated: Date.now() }; setConv(next);
    void (next.messages.length ? persist(next) : deleteConv(c.id).then(refreshList));
    window.setTimeout(() => box.current?.focus(), 30);
  }, [busy, persist, refreshList, setConv]);

  // ---------------------------------------------------------------- conversations
  const fresh = useCallback(() => {
    abort.current?.abort();
    const c = convRef.current;
    if (!c.messages.length) { box.current?.focus(); return; }
    setConv(blank(c.model)); setText(''); setPics([]); setNote(''); stick.current = true;
    if (window.innerWidth < 900) setSide(false);
  }, [setConv]);

  const open = useCallback(async (id: string) => {
    if (id === convRef.current.id) { if (window.innerWidth < 900) setSide(false); return; }
    abort.current?.abort();
    const c = await loadConv(id); if (!c) { await refreshList(); return; }
    setConv(c); setText(''); setPics([]); setNote(''); stick.current = true;
    if (window.innerWidth < 900) setSide(false);
    window.setTimeout(() => toBottom(), 30);
  }, [refreshList, setConv, toBottom]);

  const remove = useCallback(async (id: string) => {
    if (id === convRef.current.id) { abort.current?.abort(); setConv(blank(convRef.current.model)); }
    await deleteConv(id); await refreshList(); setMenu(null);
    if (cloudOn && session()) cloudRemove(id).catch(() => say('Could not remove it from your account just now.'));
  }, [refreshList, setConv, say]);

  const rename = useCallback(async (id: string, v: string | null) => {
    setRenaming(null); setTitling(false);
    const t = (v ?? '').trim(); if (!t) return;
    const c = id === convRef.current.id ? convRef.current : await loadConv(id); if (!c) return;
    const next = { ...c, title: t.slice(0, 80) };
    if (id === convRef.current.id) setConv(next);
    await persist(next);
  }, [persist, setConv]);

  const pin = useCallback(async (id: string) => {
    const c = id === convRef.current.id ? convRef.current : await loadConv(id); if (!c) return;
    const next = { ...c, pinned: !c.pinned };
    if (id === convRef.current.id) setConv(next);
    await persist(next); setMenu(null);
  }, [persist, setConv]);

  const pickModel = (k: ModelKey) => {
    setPicker(false);
    if (!canUse(planNow(settings), k)) { setUpgrade(`${modelByKey(k).name} needs the Pro plan.`); return; }
    const next = { ...convRef.current, model: k }; setConv(next); void persist(next);
  };

  const redo = useCallback(() => {
    if (busy) return;
    const c = convRef.current; const msgs = [...c.messages]; const prev: string[] = [];
    while (msgs.length && msgs[msgs.length - 1].role === 'assistant') prev.push(msgs.pop()!.text);
    if (!msgs.length) return;
    const next = { ...c, messages: msgs }; setConv(next); void run(next, { free: true, wrong: prev.reverse().join('\n\n') });
  }, [busy, run, setConv]);

  // ---------------------------------------------------------------- keys
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && abort.current && !panel && !big) { abort.current.abort(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); fresh(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [fresh, panel, big]);

  // Menus close when you press anywhere else.
  useEffect(() => {
    if (!menu && !picker) return;
    const off = (e: PointerEvent) => { if (!(e.target as Element).closest('.cx-pop, .cx-more, .cx-model')) { setMenu(null); setPicker(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setPicker(false); } };
    window.addEventListener('pointerdown', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', off); window.removeEventListener('keydown', esc); };
  }, [menu, picker]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const sends = settings.enter === 'send' ? !e.shiftKey : (e.ctrlKey || e.metaKey);
    if (sends) { e.preventDefault(); send(); }
  };

  // Copy buttons inside code blocks.
  const onMessages = (e: React.MouseEvent) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-copy]'); if (!b) return;
    const code = b.closest('.cx-code')?.querySelector('code')?.textContent ?? '';
    navigator.clipboard?.writeText(code).then(() => { b.textContent = 'Copied'; window.setTimeout(() => { b.textContent = 'Copy'; }, 1300); }, () => say('Could not copy.'));
  };

  const copyMsg = (m: Msg) => navigator.clipboard?.writeText(m.text).then(() => say('Copied.'), () => say('Could not copy.'));

  // ---------------------------------------------------------------- data
  const exportOne = () => { if (conv.messages.length) downloadText(`${conv.title.replace(/[^\w -]+/g, '').trim().slice(0, 40) || 'conversation'}.md`, toMarkdown(conv, names), 'text/markdown'); };
  const exportEvery = async () => downloadText('coe-ai-conversations.json', JSON.stringify(await exportAll()), 'application/json');
  const importFile = async (f: File) => {
    try { const n = await importAll(JSON.parse(await f.text())); await refreshList(); say(n ? `Opened ${n} ${n === 1 ? 'conversation' : 'conversations'}.` : 'No conversations in that file.'); }
    catch { say('That file could not be read.'); }
  };
  const wipe = async () => { abort.current?.abort(); await deleteAll(); if (cloudOn && session()) cloudRemoveAll().catch(() => say('Could not clear your account just now.')); await refreshList(); setConv(blank(convRef.current.model)); say('All conversations deleted.'); };

  // ---------------------------------------------------------------- what is on screen
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const l = t ? list.filter((m) => m.title.toLowerCase().includes(t)) : list;
    const groups: { name: string; items: ConvMeta[] }[] = [];
    const add = (name: string, m: ConvMeta) => { let g = groups.find((x) => x.name === name); if (!g) groups.push((g = { name, items: [] })); g.items.push(m); };
    l.filter((m) => m.pinned).forEach((m) => add('Pinned', m));
    l.filter((m) => !m.pinned).forEach((m) => add(bucket(m.updated), m));
    return groups;
  }, [list, q]);

  const empty = conv.messages.length === 0;
  const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user')?.id;
  const full = !keyOn && left <= 0;
  const canSend = !busy && !full && (text.trim().length > 0 || pics.length > 0);

  return (
    <div className={`cx${side ? '' : ' shut'}${settings.size === 'large' ? ' large' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrop(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDrop(false); }}
      onDrop={(e) => { e.preventDefault(); setDrop(false); void addFiles(Array.from(e.dataTransfer.files)); }}>

      {side && <button type="button" className="cx-scrim" aria-label="Close the list" onClick={() => setSide(false)} />}

      {/* ------------------------------------------------ history */}
      <aside className="cx-side" aria-label="Conversations" aria-hidden={!side} {...(!side ? { inert: true } : {})}>
        <div className="cx-brand"><CoeWordmark height={30} /></div>
        <div className="cx-side-top">
          <button type="button" className="btn gold cx-new" onClick={fresh}><UiIcon name="plus" size={18} />New chat</button>
          <button type="button" className="btn cx-gocode" onClick={() => { setTool(true); if (window.innerWidth < 900) setSide(false); }}><UiIcon name="code" size={18} />Code check</button>
          <label className="cx-find"><UiIcon name="search" size={16} /><span className="sr">Search conversations</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" spellCheck={false} /></label>
        </div>
        <nav className="cx-list">
          {!shown.length && <p className="cx-none tx">{q ? 'Nothing found.' : 'Your chats will be listed here.'}</p>}
          {shown.map((g) => (
            <section key={g.name}>
              <h3 className="cx-group d">{g.name}</h3>
              {g.items.map((m) => (
                <div key={m.id} className={`cx-conv${m.id === conv.id ? ' on' : ''}`}>
                  {renaming === m.id
                    ? <Rename value={m.title} onDone={(v) => rename(m.id, v)} />
                    : <button type="button" className="cx-open tx" aria-current={m.id === conv.id ? 'true' : undefined} onClick={() => open(m.id)} onDoubleClick={() => setRenaming(m.id)} title={m.title}>
                      {m.pinned && <UiIcon name="pin" size={13} className="cx-pinned" />}<span>{m.title}</span></button>}
                  <button type="button" className="cx-more" aria-label={`Options for ${m.title}`} aria-haspopup="menu" aria-expanded={menu?.id === m.id}
                    onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.id === m.id ? null : { id: m.id, x: Math.min(r.right, window.innerWidth - 8), y: r.bottom + 4 }); }}><UiIcon name="more" size={18} /></button>
                </div>
              ))}
            </section>
          ))}
        </nav>
        <div className="cx-side-foot">
          <div className="cx-plan-row">
            <span className="d cx-plan-name">{planName}</span><span className="tx cx-small">{keyOn ? 'No daily limit' : `${usedNow} of ${perDay} credits today`}</span>
          </div>
          {!keyOn && <div className="cx-meter" role="img" aria-label={`${usedNow} of ${perDay} credits used today`}><i style={{ width: `${Math.min(100, (usedNow / perDay) * 100)}%` }} /></div>}
          <button type="button" className="cx-acct tx" onClick={() => setAcct(true)}>{me ? <>Saved to <b>{me}</b></> : <>Saved on this device. <u>Sign in</u> to keep them in an account.</>}</button>
          <div className="cx-foot-btns">
            <a className="btn small" href="/plans/"><UiIcon name="card" size={15} />Plans</a>
            <button type="button" className="btn small" onClick={() => { setTab('ai'); setPanel('settings'); }}><UiIcon name="gear" size={15} />Settings</button>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------ chat */}
      <section className="cx-main" aria-label="Chat">
        <header className="cx-head">
          <button type="button" className="cx-ib" aria-label={side ? 'Hide the list' : 'Show the list'} aria-pressed={side} onClick={() => setSide((s) => !s)}><UiIcon name="panel" size={22} /><span className="cx-ib-t">Chats</span></button>
          {titling && conv.messages.length
            ? <Rename className="cx-title-in" value={conv.title} onDone={(v) => rename(conv.id, v)} />
            : <button type="button" className="cx-title d" disabled={!conv.messages.length} onClick={() => setTitling(true)} title={conv.messages.length ? 'Rename' : undefined}>{conv.title}</button>}
          <span className="cx-grow" />
          <div className="cx-model">
            <button type="button" className={`btn small cx-model-btn${picker ? ' open' : ''}`} aria-haspopup="listbox" aria-expanded={picker} onClick={() => setPicker((p) => !p)}>{model.name}<UiIcon name="down" size={14} /></button>
            {picker && (
              <ul className="cx-pop cx-models" role="listbox" aria-label="Model">
                {COE_MODELS.map((m) => {
                  const ok = canUse(planNow(settings), m.key);
                  return (
                    <li key={m.key} role="option" aria-selected={m.key === conv.model}>
                      <button type="button" className={`cx-opt${m.key === conv.model ? ' on' : ''}`} onClick={() => pickModel(m.key)}>
                        <span className="d cx-opt-n">{m.name}<i>{m.tag}</i>{!ok && <b>Pro</b>}</span>
                        <span className="tx cx-small">{m.blurb}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button type="button" className="cx-ib" aria-label="Save this chat as a file" title="Save this chat as a file" disabled={empty} onClick={exportOne}><UiIcon name="copy" size={20} /></button>
          {owner && <button type="button" className={`cx-chip${conn.ok ? ' on' : ''}`} onClick={() => { setTab(keyOn ? 'ai' : 'connect'); setPanel('settings'); }}>{conn.ok ? 'Ready' : 'Not set up'}</button>}
          {me
            ? <button type="button" className="cx-me" aria-label={`Account: ${me}`} title={me} onClick={() => setAcct(true)}>{me.slice(0, 1).toUpperCase()}</button>
            : <button type="button" className="btn small gold cx-signin" onClick={() => setAcct(true)}>Sign in</button>}
        </header>

        <div className="cx-scroll" ref={scroller} onScroll={onScroll} onClick={onMessages}>
          {empty ? (
            <div className="cx-empty">
              <CoeWordmark height={72} live={busy} className="cx-hero" />
              <h2 className="d">{greeting(settings.name, new Date().getHours(), hello)}</h2>
              {!conn.ok && owner && (
                <div className="cx-connect">
                  <p className="tx"><b className="d">Not set up yet.</b> {conn.why}</p>
                  <button type="button" className="btn gold" onClick={() => { setTab(keyOn ? 'ai' : 'connect'); setPanel('settings'); }}>Set up Coe</button>
                </div>
              )}
              <div className="cx-starters">
                {STARTERS.map((s) => (
                  <button key={s.title} type="button" className="cx-start" onClick={() => { if (s.tool === 'code') { setTool(true); return; } setText(s.text ?? ''); box.current?.focus(); if (s.pic) fileIn.current?.click(); }}>
                    <span className="d">{s.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="cx-msgs">
              {conv.messages.map((m, i) => {
                const lastOne = i === conv.messages.length - 1;
                const live = streaming && lastOne && m.role === 'assistant';
                return (
                  <li key={m.id} className={`cx-msg ${m.role}`}>
                    <div className="cx-who d">{m.role === 'user' ? 'You' : <><CoeStar size={20} live={live} />Coe{m.model ? <i>{modelByKey(m.model).name.replace(/^Coe /, '')}</i> : null}</>}</div>
                    {m.images?.length ? (
                      <div className="cx-pics">{m.images.map((im, k) => (
                        <button type="button" key={k} className="cx-pic" onClick={() => setBig(im)} aria-label={`Open ${im.name}`}><img src={dataUrl(im)} alt={im.name} /></button>
                      ))}</div>
                    ) : null}
                    {m.role === 'user'
                      ? (m.text && <p className="cx-says tx">{m.text}</p>)
                      : (m.text ? <Rich text={m.text} /> : live && !m.error ? <p className="cx-think tx" role="status">Thinking<span className="cx-dots"><i /><i /><i /></span></p> : null)}
                    {live && m.text && <span className="cx-cursor" aria-hidden />}
                    {m.error && (
                      <ErrorBox own={keyOn} kind={m.errKind} text={m.error} canRetry={lastOne && !busy} onAct={errAct} />
                    )}
                    {m.role === 'assistant' && (m.stopped || m.cut) && !m.error && <p className="cx-flag tx">{m.stopped ? 'You stopped this reply.' : 'This reply reached its length limit. Say “continue” to carry on.'}</p>}
                    {!live && (
                      <div className="cx-acts">
                        {m.role === 'assistant' && m.text && <button type="button" className="cx-act" onClick={() => copyMsg(m)}><UiIcon name="copy" size={14} />Copy</button>}
                        {m.role === 'assistant' && lastOne && !m.error && !busy && <button type="button" className="cx-act" onClick={retry}><UiIcon name="refresh" size={14} />Again</button>}
                        {m.role === 'assistant' && lastOne && !m.error && !busy && m.text && <button type="button" className="cx-act free" onClick={redo} title="Wrong? Redo it free"><UiIcon name="wand" size={14} />Wrong? Redo free</button>}
                        {m.role === 'user' && m.id === lastUser && !busy && <button type="button" className="cx-act" onClick={() => edit(m.id)}><UiIcon name="edit" size={14} />Edit</button>}
                        {m.role === 'assistant' && m.outTokens ? <span className="cx-tok tx">{m.outTokens} tokens</span> : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <footer className="cx-compose">
          {away && <button type="button" className="cx-jump btn small" onClick={() => { stick.current = true; toBottom(true); setAway(false); }}><UiIcon name="down" size={15} />Latest</button>}
          {note && <p className="cx-flag tx">{note}</p>}
          {full && <p className="cx-limit tx" role="status">All {perDay} credits for today are used. <a className="cx-link" href="/plans/">See plans</a></p>}
          <div className="cx-box">
            {pics.length > 0 && (
              <div className="cx-chips">{pics.map((p, i) => (
                <span key={i} className="cx-chipic"><img src={dataUrl(p)} alt={p.name} />
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPics((x) => x.filter((_, k) => k !== i))}><UiIcon name="close" size={12} /></button></span>
              ))}</div>
            )}
            <textarea ref={box} className="cx-ta tx" rows={1} value={text} placeholder={empty ? 'Ask Coe anything, or add a picture' : 'Write a reply'} aria-label="Message" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onPaste={onPaste} />
            <div className="cx-bar">
              <button type="button" className="cx-ib" aria-label="Add pictures" title={`Add pictures (up to ${plan.images})`} disabled={pics.length >= plan.images} onClick={() => fileIn.current?.click()}><UiIcon name="attach" size={20} /></button>
              <button type="button" className="btn small cx-tool" onClick={() => setTool(true)} title="Find and fix errors in code"><UiIcon name="code" size={15} />Code check</button>
              <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(f); }} />
              <span className="cx-hint tx">{settings.enter === 'send' ? 'Enter sends, Shift+Enter adds a line' : 'Ctrl+Enter sends'}</span>
              <span className="cx-grow" />
              {busy
                ? <button type="button" className="cx-send stop" aria-label="Stop" title="Stop (Esc)" onClick={stop}><UiIcon name="stop" size={20} /></button>
                : <button type="button" className="cx-send" aria-label="Send" title="Send" disabled={!canSend} onClick={send}><UiIcon name="send" size={20} /></button>}
            </div>
          </div>
          <p className="cx-fine tx">{assistant} can be wrong. Check anything important.</p>
        </footer>

        {toolSeen && (
          <div className="cd-over" role="dialog" aria-label="Code check" hidden={!tool}>
            <header className="cd-over-head"><h2 className="d">Code check</h2><span className="cx-grow" /><button type="button" className="btn small" onClick={() => setTool(false)}><UiIcon name="close" size={15} />Close</button></header>
            <Check settings={settings} onUsed={() => setUse(usage())} onSettings={() => { setTool(false); openSetup(); }} onUpgrade={setUpgrade} say={say} />
          </div>
        )}
        {drop && <div className="cx-drop" aria-hidden><b className="d">Drop pictures to add them</b></div>}
        {toast && <div className="cx-toast tx" role="status">{toast}</div>}
      </section>

      {/* ------------------------------------------------ pop-ups */}
      {menu && (() => {
        const row = list.find((m) => m.id === menu.id); if (!row) return null;
        return (
          <div className="cx-pop cx-rowmenu" role="menu" style={{ left: Math.max(8, menu.x - 190), top: menu.y }}>
            {menu.sure ? (
              <>
                <p className="d cx-sure-t">Delete this chat?</p>
                <button type="button" role="menuitem" className="cx-opt danger" onClick={() => remove(menu.id)}><UiIcon name="trash" size={15} />Yes, delete it</button>
                <button type="button" role="menuitem" className="cx-opt" onClick={() => setMenu(null)}>Keep it</button>
              </>
            ) : (
              <>
                <button type="button" role="menuitem" className="cx-opt" onClick={() => { void pin(menu.id); }}><UiIcon name="pin" size={15} />{row.pinned ? 'Unpin' : 'Pin to the top'}</button>
                <button type="button" role="menuitem" className="cx-opt" onClick={() => { setRenaming(menu.id); setMenu(null); }}><UiIcon name="edit" size={15} />Rename</button>
                <button type="button" role="menuitem" className="cx-opt danger" onClick={() => setMenu({ ...menu, sure: true })}><UiIcon name="trash" size={15} />Delete</button>
              </>
            )}
          </div>
        );
      })()}

      {acct && <Account onClose={() => setAcct(false)} onChange={(inn) => { setMe(inn ? session()?.email ?? null : null); if (inn) { say('Signed in.'); void doSync(); } else void refreshList(); }} />}
      {upgrade && <Upgrade note={upgrade} onClose={() => setUpgrade('')} />}
      {panel === 'settings' && <SettingsPanel owner={owner} settings={settings} set={setSettings} tab={tab} setTab={setTab} convCount={list.length} onExport={exportEvery} onImport={importFile} onDeleteAll={wipe} onClose={() => setPanel(null)} />}
      {big && <Modal title={big.name} onClose={() => setBig(null)} wide><img className="cx-big" src={dataUrl(big)} alt={big.name} /></Modal>}
    </div>
  );
}

