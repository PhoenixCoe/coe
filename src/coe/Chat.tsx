'use client';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CoeStar, CoeWordmark, type Phase } from '@/ui/Mark';
import { PHASES, Working, phaseOfTool } from './Working';
import { Activity, describeRun, turnSteps } from './Activity';
import { UiIcon } from '@/ui/icons';
import { downloadText } from '@/ui/copy';
import { CoeError, stream, type ChatMsg } from '@/lib/coe/client';
import { COE_MODELS, FILE_TEXT, MAX_REPLY, MAX_WORK, QUOTAS, canUse, fmtTok, modelByKey, type ModelKey } from '@/lib/coe/models';
import { applyCredits, bumpQuota, counted, creditsNow, onStatus, planInfo, planNow, quotaLeft, refreshStatus, status } from '@/lib/coe/account';
import { explain as describeErr, type ErrAct } from '@/lib/coe/errors';
import { ErrorBox } from './ErrorBox';
import { isOwner } from '@/lib/coe/owner';
import { modeOf, connection, loadSettings, saveSettings, type CoeSettings } from '@/lib/coe/settings';
import { toImg } from './images';
import { Rich, RichContext, followupsOf, wordsOf, type RichCtx } from './Blocks';
import { KINDS, isReadable, readAny } from './readers';
import { MEDIA_KINDS, isAudio, isVideo, readAudio, videoFrames } from './media';
import { STEPS, approve as approveTool, execute, findTool, memoryPrompt, needsApproval, SHOW_PROMPT, toolsPrompt, type Call } from '@/lib/coe/tools';
import { links, memory, onMemory } from '@/lib/coe/links';
import { APPS_ORIGIN } from '@/lib/coe/pmc';
import { Workspace } from './Workspace';
import { hasFiles, type Files } from '@/lib/coe/workspace';
const Check = lazy(() => import('./Check').then((m) => ({ default: m.Check })));   // the code checker is big, so it is fetched only when opened
import { Account } from './Account';
import { VoiceMode } from './VoiceMode';
import { SelectBar } from './SelectBar';
import { MathPad } from './MathPad';
import { Palette, type Cmd } from './Palette';
import { Capture, canCamera, canScreen } from './Capture';
import { Sketch } from './Sketch';
import { SoundLab } from './SoundLab';
import { runBlock } from './run';
import { Gallery, piecesOf } from './Gallery';
import { StudyHub } from './StudyHub';
import { LEADS, applyDisplay, loadLead, setLead, setSfx, sfx, sfxOn, type Lead } from '@/lib/coe/look';
import { dueCount, streak, subscribeStudy } from '@/lib/coe/study';
import { printChat, chatPage } from './export';
import { PERSONAS, SLASH, loadPersona, loadStyles, personaOf, savePersona, type Persona } from '@/lib/coe/personas';
import { StyleEditor } from './Styles';
import { ShareDialog } from './Share';
import { installCoe, isInstalled } from '@/lib/coe/pwa';
import { VOICE_PROMPT, browserListen, browserListens, canListen, listening, loadPrefs, serverVoice, speak, transcribe, voiceActive, type Speaking } from '@/lib/coe/voice';
import { pushProfile, cloudOn, put as cloudPut, remove as cloudRemove, removeAll as cloudRemoveAll, session, sync as cloudSync } from '@/lib/coe/cloud';
import { knowledgeFor } from './knowledge';
import { BASE_COE, CHECK_SYSTEM, REDO_NOTE, STARTERS, greeting, picsNote, preferencesPrompt, worthChecking } from './prompts';
import { Modal, SettingsPanel, Upgrade, type Tab } from './Panels';
import { Select } from '@/ui/Controls';
import { setFavicon } from '@/lib/coe/favicon';
import { redoLeft, redoUsed } from '@/lib/coe/redo';
import { Feedback } from './Feedback';
import { AnswerInfo } from './AnswerInfo';
import { feedbackDue, feedbackLater, feedbackShown, noteReply, sendFeedback } from '@/lib/coe/feedback';
import { bucket, countMessage, dataUrl, deleteAll, deleteConv, exportAll, importAll, loadConv, loadIndex, saveConv, titleFrom, toMarkdown, uid, usage, type Attach, type Conv, type ConvMeta, type Img, type Msg, type ToolRun } from './store';

const PICTURE_COST = 1600;             // a picture counts as this many characters when trimming
const CONTEXT = { free: 80000, pro: 600000 };   // characters sent with each message; older ones are left out

/** The chat up to and including the last message the person really wrote (not a tool's answer). */
const cutToUser = (msgs: Msg[]) => { let i = msgs.length - 1; while (i >= 0 && !(msgs[i].role === 'user' && !msgs[i].hidden)) i--; return msgs.slice(0, i + 1); };

const blank = (model: ModelKey): Conv => ({ id: uid(), title: 'New conversation', created: Date.now(), updated: Date.now(), model, messages: [] });

/** What a message says to the model: files that came with it are put in front of the words. */
const LATE = '\n\n[This was sent while you were still answering the earlier message above. Do not forget that earlier message: answer it too, unless this one replaces or cancels it.]';
const spoken = (m: Msg) => (m.attach?.length ? m.attach.map((a) => `[File: ${a.name}${a.cut ? ' (cut short)' : ''}]\n${a.text}`).join('\n\n') + (m.text ? `\n\n${m.text}` : '') : m.text) + (m.late ? LATE : '');

/** Turns saved messages into what is sent: no failed or empty replies, same-speaker runs joined, oldest dropped past the limit. */
function context(messages: Msg[], limit: number): { list: ChatMsg[]; trimmed: boolean } {
  const joined: ChatMsg[] = [];
  for (const m of messages) {
    if (m.role === 'assistant' && (m.error || !m.text.trim())) continue;
    const last = joined[joined.length - 1];
    const imgs = (m.images ?? []).map((i) => ({ type: i.type, data: i.data }));
    const text = spoken(m);
    if (last && last.role === m.role) { last.text = `${last.text}\n\n${text}`; last.images = [...(last.images ?? []), ...imgs]; }
    else joined.push({ role: m.role, text, images: imgs.length ? imgs : undefined });
  }
  const size = (m: ChatMsg) => m.text.length + (m.images?.length ?? 0) * PICTURE_COST;
  let total = 0, from = joined.length;
  while (from > 0 && total + size(joined[from - 1]) <= limit) { total += size(joined[from - 1]); from--; }
  if (from === joined.length && joined.length) from = joined.length - 1;     // always send the last message
  let list = joined.slice(from);
  while (list.length && list[0].role !== 'user') list = list.slice(1);
  return { list, trimmed: from > 0 };
}

function Rename({ value, onDone, className }: { value: string; onDone: (v: string | null) => void; className?: string }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return <input ref={ref} className={`cx-rename ${className ?? ''}`} value={v} maxLength={80} aria-label="Conversation name" onChange={(e) => setV(e.target.value)} onBlur={() => onDone(v)}
    onKeyDown={(e) => { if (e.key === 'Enter') onDone(v); if (e.key === 'Escape') onDone(null); e.stopPropagation(); }} />;
}

type Queued = { id: string; text: string; pics: Img[]; atts: Attach[]; work: boolean; late?: boolean };
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
  const [atts, setAtts] = useState<Attach[]>([]);
  const [work, setWork] = useState(false);                    // Deep Work for the next message
  const [web, setWeb] = useState(() => { try { return localStorage.getItem('pmc:coe:web') !== '0'; } catch { return true; } });
  const [shelf, setShelf] = useState(false);                   // the project folder
  const [mathOpen, setMathOpen] = useState(false);             // the maths keyboard
  const [palOpen, setPalOpen] = useState(false);               // Ctrl+K
  const [persona, setPersona] = useState('coe');               // how Coe works in this browser
  const [perPick, setPerPick] = useState(false);
  const [mine, setMine] = useState<Persona[]>([]);           // the person's own styles
  const [stylesOpen, setStylesOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [hdMore, setHdMore] = useState(false);                 // the header's menu on a phone
  const [slashAt, setSlashAt] = useState(0);
  useEffect(() => { setPersona(loadPersona()); }, []);
  const [reading, setReading] = useState('');                  // a file being read
  const [busy, setBusy] = useState(false);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [side, setSide] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; sure?: boolean } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);   // a row in the list
  const [titling, setTitling] = useState(false);                     // the name in the header
  const [picker, setPicker] = useState(false);
  const [panel, setPanel] = useState<null | 'settings'>(() => { try { return new URLSearchParams(location.search).get('settings') !== null ? 'settings' : null; } catch { return null; } });   // ?settings opens Settings, so other tools can point here
  const [tab, setTab] = useState<Tab>('chat');
  const owner = isOwner();
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onMemory(() => { clearTimeout(t); t = setTimeout(() => { if (session()) void pushProfile().catch(() => {}); }, 1500); });
    return () => { off(); clearTimeout(t); };
  }, []);
  useEffect(() => {
    const open = (e: Event) => { const d = (e as CustomEvent).detail; if (d === 'connections' || d === 'you') { setTab('you'); setPanel('settings'); } };
    window.addEventListener('pmc:coe-open', open); return () => window.removeEventListener('pmc:coe-open', open);
  }, []);
  const openSetup = (why?: string) => { if (modeOf(loadSettings()) === 'key') { setTab('ai'); setPanel('settings'); if (why) say(why); } else if (owner) { setTab('connect'); setPanel('settings'); if (why) say(why); } else say('Coe is not switched on yet. Try again later.'); };
  const [upgrade, setUpgrade] = useState('');
  const [big, setBig] = useState<Img | null>(null);
  const [drop, setDrop] = useState(false);
  const [away, setAway] = useState(false);
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  useEffect(() => {   // Esc and the phone's Back button close Code check, as people expect
    if (!tool) return;
    setToolSeen(true);
    try { window.history.pushState({ coeTool: 1 }, ''); } catch { /* no history */ }
    const pop = () => setTool(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.cx-modal, .cx-pal')) setTool(false); };
    window.addEventListener('popstate', pop); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('keydown', esc); try { if (window.history.state?.coeTool) window.history.back(); } catch { /* no history */ } };
  }, [tool]);
  const [toolSeen, setToolSeen] = useState(tool);   // once opened, Code check stays in place (hidden), so closing it does not lose the results
  useEffect(() => { if (tool) setToolSeen(true); }, [tool]);
  const [acct, setAcct] = useState(false);
  const [me, setMe] = useState<string | null>(() => (cloudOn ? session()?.email ?? null : null));
  const [studyOpen, setStudyOpen] = useState(false);
  useEffect(() => { try { const u = new URL(window.location.href); const g = u.searchParams.get('go'); if (g) { u.searchParams.delete('go'); u.searchParams.delete('source'); window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); if (g === 'study') setStudyOpen(true); } } catch { /* no address to read */ } }, []);
  const [sketchOpen, setSketchOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [capture, setCapture] = useState<null | 'camera' | 'screen'>(null);
  const [galOpen, setGalOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [moreStarters, setMoreStarters] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [lead, setLeadState] = useState<Lead>('cream');
  const [soundOn, setSoundOn] = useState(false);
  const [due, setDue] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fb, setFb] = useState(false);
  useEffect(() => { try { if (new URLSearchParams(location.search).get('fb') === '1') setFb(true); } catch { /* no address bar */ } }, []);
  const cameraIn = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const look = () => { setLeadState(loadLead()); setSoundOn(sfxOn()); }; look();
    window.addEventListener('pmc:coe-look', look);
    const d = () => setDue(dueCount()); d();
    const off = subscribeStudy(d);
    let t: ReturnType<typeof setTimeout> | undefined;
    const push = () => { clearTimeout(t); t = setTimeout(() => { if (session()) void pushProfile().catch(() => {}); }, 2000); };
    window.addEventListener('pmc:coe-study-changed', push);
    const sty = () => { setMine(loadStyles()); push(); }; setMine(loadStyles());
    window.addEventListener('pmc:coe-styles-changed', sty);
    return () => { window.removeEventListener('pmc:coe-look', look); window.removeEventListener('pmc:coe-study-changed', push); window.removeEventListener('pmc:coe-styles-changed', sty); off(); clearTimeout(t); };
  }, []);

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
  // A live guess while a reply is being written (about four letters to a token); the exact count replaces it when the reply ends.
  const streamed = busy ? Math.round((conv.messages[conv.messages.length - 1]?.text.length ?? 0) / 4) : 0;
  const livePct = perDay > 0 ? Math.min(100, Math.floor(((usedNow + streamed) / perDay) * 100)) : 0;
  const [usageOff, setUsageOff] = useState(false);
  useEffect(() => { if (livePct >= 100) setUsageOff(false); }, [livePct >= 100]);   // eslint-disable-line react-hooks/exhaustive-deps
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
    const rest = files.filter((f) => !f.type.startsWith('image/'));
    const docs = rest.filter((f) => isReadable(f));
    const auds = rest.filter((f) => !docs.includes(f) && isAudio(f));
    const vids = rest.filter((f) => !docs.includes(f) && !auds.includes(f) && isVideo(f));
    const other = files.length - imgs.length - docs.length - auds.length - vids.length;
    if (other > 0 && !imgs.length && !docs.length && !auds.length && !vids.length) { say('That kind of file cannot be read. Pictures, sound, video, PDF, Word, PowerPoint, Excel, zip and text files can.'); return; }
    if (imgs.length) {
      const room = plan.images - pics.length;
      if (room <= 0) say(`${plan.name} allows ${plan.images} pictures in one message.`);
      else {
        const take = imgs.slice(0, room), out: Img[] = [];
        for (const f of take) { try { out.push(await toImg(f)); } catch (e) { say((e as Error).message); } }
        if (out.length) setPics((p) => [...p, ...out].slice(0, plan.images));
        if (imgs.length > take.length) say(`Only ${plan.images} pictures fit in one message on ${plan.name}.`);
      }
    }
    if (docs.length) {
      const pn = planNow(loadSettings()), limit = FILE_TEXT[pn];
      for (const f of docs) {
        if (pn !== 'pro' && /\.(zip|pptx|xlsx)$/i.test(f.name)) { setUpgrade('Zip folders, PowerPoint and Excel files are part of Pro. PDF, Word and text files work on Free, up to a point.'); continue; }
        if (f.size > (pn === 'pro' ? 60 : 8) * 1024 * 1024) { say(`${f.name} is bigger than ${pn === 'pro' ? 60 : 8} MB.`); continue; }
        setReading(f.name);
        try {
          const a = await readAny(f, limit);
          setAtts((x) => [...x, a].slice(0, 8));
          if (a.cut) say(pn === 'pro' ? `${f.name} is very long, so only the first part was read.` : `${f.name} is long, so only the first ${Math.round(limit / 1000)}k characters were read. Pro reads much more.`);
        } catch (e) { say((e as Error).message || `${f.name} could not be read.`); }
      }
      setReading('');
    }
    if (auds.length || vids.length) {
      const st = loadSettings(), pn = planNow(st), limit = FILE_TEXT[pn];
      for (const f of auds) {
        try { const a = await readAudio(st, f, pn, limit, setReading); setAtts((x) => [...x, a].slice(0, 8)); if (a.cut) say(`${f.name} is long, so only the first part of what was said is included.`); }
        catch (e) { say((e as Error).message || `${f.name} could not be heard.`); }
      }
      let room = plan.images - pics.length;
      for (const f of vids) {
        setReading(`Opening ${f.name}…`);
        try {
          if (f.size > (pn === 'pro' ? 150 : 40) * 1e6) throw new Error(`${f.name} is bigger than ${pn === 'pro' ? 150 : 40} MB.`);
          const want = Math.max(0, Math.min(room, pn === 'pro' ? 8 : 4));
          const v = await videoFrames(f, want || 1);
          const out: Img[] = []; for (const fr of v.frames.slice(0, want)) { try { out.push(await toImg(fr)); } catch { /* skip a bad frame */ } }
          if (out.length) { room -= out.length; setPics((p) => [...p, ...out].slice(0, plan.images)); }
          let words = '', heard = '';
          try { const a = await readAudio(st, f, pn, limit, setReading); words = a.text; if (a.cut) heard = ' (cut short)'; } catch (e) { heard = ' (' + ((e as Error).message || 'no sound could be read') + ')'; }
          const when = out.map((o) => /at (\d\d:\d\d)/.exec(o.name)?.[1]).filter(Boolean).join(', ');
          const head = `Video "${f.name}"${v.seconds ? `, ${Math.floor(v.seconds / 60)}:${String(Math.floor(v.seconds % 60)).padStart(2, '0')} long` : ''}, ${v.width}x${v.height}. ${out.length ? `${out.length} frames from ${when} are attached as pictures, in order.` : 'No frames were attached (the picture limit was reached).'}`;
          const text = `${head}\n\nSoundtrack${heard}:\n${words || '(no speech heard)'}`;
          setAtts((x) => [...x, { name: f.name, kind: 'Video', chars: text.length, text, note: `${out.length} frames` }].slice(0, 8));
        } catch (e) { say((e as Error).message || `${f.name} could not be read.`); }
      }
      setReading('');
    }
  }, [plan.images, plan.name, pics.length, say]);

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) { e.preventDefault(); void addFiles(files); }
  };

  // ---------------------------------------------------------------- saving
  const persist = useCallback(async (c: Conv) => { if (c.messages.length) { await saveConv(c); await refreshList(); if (cloudOn && session()) cloudPut(c).catch(() => say('Could not save to your account just now. It is kept on this device.')); } }, [refreshList, say]);

  // ---------------------------------------------------------------- asking
  /** Every picture in the chat, oldest first: what was attached, and what tools made. */
  const imagesOf = (c: Conv): Img[] => c.messages.flatMap((m) => [...(m.images ?? []), ...(m.runs ?? []).flatMap((r) => (r.out?.kind === 'image' ? [r.out.img] : []))]);

  const run = useCallback(async (base: Conv, opts: { free?: boolean; wrong?: string; work?: boolean } = {}) => {
    const s = loadSettings();
    const pn = planNow(s), pl = planInfo(s);
    const c0 = connection(s);
    if (!c0.ok) { openSetup(c0.why); return; }
    const model: ModelKey = opts.work ? 'deep' : base.model;
    if (!opts.work && !canUse(pn, base.model)) { setUpgrade(`${modelByKey(base.model).name} needs the Pro plan.`); return; }
    if (opts.work && pn !== 'pro' && quotaLeft('work', s).left <= 0) { setUpgrade('Deep Work is part of Pro. Free includes one run a day, and today\'s is used.'); return; }
    if (!opts.free && modeOf(s) !== 'key' && !counted(s) && usage().today >= pl.perDay) { setUpgrade(`You have used all ${fmtTok(pl.perDay)} tokens for today on ${pl.name}. They come back at midnight (UTC).`); return; }

    const mine = base.id, active = () => convRef.current.id === mine;
    let work: Conv = base;
    const commit = (c: Conv) => { work = c; if (active()) setConv(c); };
    const ctl = new AbortController(); abort.current = ctl; setBusy(true); setFavicon('busy'); stick.current = true;
    const cap = opts.work ? STEPS.work : STEPS[pn];

    // One question to the model, and the tool it asks for, if any. Returns true when it should go round again with the tool's answer.
    const turn = async (step: number): Promise<boolean> => {
      setPhase('think');
      const { list: sent, trimmed } = context(work.messages, CONTEXT[pn]);
      setNote(trimmed ? 'This chat is long, so the oldest messages were left out of this reply.' : '');
      const holder: Msg = { id: uid(), role: 'assistant', text: '', model, ts: Date.now(), work: opts.work || undefined };
      commit({ ...work, messages: [...work.messages, holder], updated: Date.now() });
      const patch = (p: Partial<Msg>) => commit({ ...work, messages: work.messages.map((m) => (m.id === holder.id ? { ...m, ...p } : m)) });
      const now = new Date();
      const system = [
        BASE_COE, SHOW_PROMPT, personaOf(loadPersona()).prompt && `Working style the person chose (${personaOf(loadPersona()).name}): ${personaOf(loadPersona()).prompt}`, voiceActive() && VOICE_PROMPT,
        toolsPrompt({ plan: pn, work: !!opts.work, web, google: !!links().google, github: !!links().github, files: work.files ?? {}, stepsLeft: cap - step, hasApps: !!APPS_ORIGIN }),
        memoryPrompt(),
        knowledgeFor([...work.messages].reverse().find((m) => m.role === 'user' && !m.hidden)?.text ?? '', { hasApps: !!APPS_ORIGIN }),
        opts.wrong && `${REDO_NOTE}\n\nThe earlier answer was:\n${opts.wrong}`,
        preferencesPrompt(s),
        picsNote(imagesOf(work)),
        s.system.trim() && `The person asked for these standing instructions:\n${s.system.trim()}`,
        `Today is ${now.toDateString()}.`,
      ].filter(Boolean).join('\n\n');

      // The model is cut off the moment it finishes asking for a tool, so nothing it guesses after that is paid for.
      const tctl = new AbortController(); const link = () => tctl.abort(); ctl.signal.addEventListener('abort', link);
      let frame = 0, latest = '', hit = false, wrote = false;
      const flush = () => { frame = 0; patch({ text: latest }); };
      try {
        const r = await stream(s, { model, system, messages: sent, maxTokens: opts.work ? MAX_WORK : MAX_REPLY[pn], signal: tctl.signal, redo: !!opts.free && step === 0, work: opts.work, step: step > 0 },
          (t) => { latest = t; if (!wrote) { wrote = true; setPhase('write'); } if (!hit && findTool(t)) { hit = true; tctl.abort(); } else if (!hit && !frame) frame = requestAnimationFrame(flush); });
        if (frame) cancelAnimationFrame(frame);
        const userStopped = ctl.signal.aborted;
        const found = findTool(r.text);
        const text = found ? r.text.slice(0, found.end) : r.text;
        patch({ text, stopped: (userStopped && r.stopped) || undefined, cut: r.cut || undefined, inTokens: r.inTokens, outTokens: r.outTokens });
        if (r.credits) applyCredits(r.credits); else if ((!r.stopped || r.text) && !(opts.free && step === 0) && !counted(s)) setUse(countMessage((r.inTokens ?? Math.ceil(JSON.stringify(sent).length / 4) + 700) + (r.outTokens ?? Math.ceil(r.text.length / 4))));
        if (step === 0 && opts.work) bumpQuota('work');
        if (userStopped && !r.text) { commit({ ...work, messages: work.messages.filter((m) => m.id !== holder.id) }); return false; }
        if (userStopped) return false;
        if (!found) {
          // A second look at its own answer before finishing: if it finds a mistake, it writes the answer again.
          const lastAsk = [...work.messages].reverse().find((m) => m.role === 'user' && !m.hidden)?.text ?? '';
          if (!r.cut && !voiceActive() && worthChecking(s.check, text, lastAsk, { work: opts.work, steps: step })) {
            setPhase('check');
            let fr = 0, latestFix = '';
            const showFix = () => { fr = 0; const m = /^\s*FIX:[^\n]*\n+([\s\S]+)$/i.exec(latestFix); if (m) patch({ text: m[1] }); };
            try {
              const rm: ModelKey = model === 'deep' && pn !== 'pro' ? 'core' : model;
              const sys2 = [BASE_COE, SHOW_PROMPT, personaOf(loadPersona()).prompt && `Working style the person chose (${personaOf(loadPersona()).name}): ${personaOf(loadPersona()).prompt}`, preferencesPrompt(s), picsNote(imagesOf(work)), `Today is ${now.toDateString()}.`].filter(Boolean).join('\n\n');
              const msgs2: ChatMsg[] = [...sent, { role: 'assistant', text }, { role: 'user', text: '[Checking step. This is not from the person.]\n' + CHECK_SYSTEM }];
              const rv = await stream(s, { model: rm, system: sys2, messages: msgs2, maxTokens: opts.work ? MAX_WORK : MAX_REPLY[pn], signal: ctl.signal, check: true },
                (t) => { latestFix = t; if (/^\s*FIX:/i.test(t) && !fr) fr = requestAnimationFrame(showFix); });
              if (fr) cancelAnimationFrame(fr);
              if (rv.credits) applyCredits(rv.credits);
              const out = rv.text.trim(), fixM = /^FIX:\s*([^\n]*)\n+([\s\S]+)$/i.exec(out);
              if (/^OK\b/i.test(out)) patch({ checked: 'ok' });
              else if (fixM && !rv.cut && !findTool(fixM[2]) && fixM[2].trim().length >= 20) patch({ text: fixM[2].trim(), checked: 'fixed', fix: fixM[1].trim().slice(0, 240) || 'A mistake' });
              else patch({ text });
            } catch { if (fr) cancelAnimationFrame(fr); patch({ text }); }   // a failed check never costs the person their answer
          }
          return false;
        }
        if (step >= cap) { patch({ text: text.slice(0, found.start).trim() || 'I ran out of steps for this request.' }); return false; }

        // ---- the tool
        const call = found.call;
        const run0: ToolRun = { id: uid(), tool: call?.tool ?? 'unknown', args: (call ?? {}) as Record<string, unknown>, status: 'running', t0: Date.now() };
        const setRun = (p: Partial<ToolRun>) => commit({ ...work, messages: work.messages.map((m) => (m.id === holder.id ? { ...m, runs: [{ ...(m.runs?.[0] ?? run0), ...p }] } : m)) });
        setRun({}); setPhase(phaseOfTool(call?.tool ?? 'unknown'));
        const res = call
          ? await execute(call, { settings: s, signal: ctl.signal, plan: pn, convId: base.id, runId: run0.id, files: () => work.files ?? {}, setFiles: (f: Files) => commit({ ...work, files: f }), images: () => imagesOf(work), patch: setRun, say })
          : { status: 'error' as const, result: found.error ?? 'That tool block could not be read.', out: undefined, images: undefined };
        setRun({ t1: Date.now(), status: res.status, result: res.result, ...(res.shown ? { shown: res.shown } : {}), ...(res.out ? { out: res.out } : {}) });
        if (res.status === 'pending' || ctl.signal.aborted) return false;
        const hid: Msg = { id: uid(), role: 'user', text: `[Result of the ${run0.tool} tool]\n${res.result}`, images: res.images, hidden: true, ts: Date.now() };
        commit({ ...work, messages: [...work.messages, hid] });
        return true;
      } catch (e) {
        if (frame) cancelAnimationFrame(frame);
        const err = e as CoeError;
        let why = err.message || '';
        if (err.kind === 'bad' && base.messages.some((m) => m.images?.length)) why = (why ? why + ' ' : '') + 'If the model cannot read pictures, take the pictures out or pick another model.';
        patch({ text: latest, error: why || describeErr(err.kind, '').text, errKind: err.kind }); sfx.error();
        if (err.kind === 'credits' || err.kind === 'plan' || err.kind === 'signin') void refreshStatus(s);
        return false;
      } finally { ctl.signal.removeEventListener('abort', link); }
    };

    try {
      for (let step = 0; ; step++) { if (!(await turn(step))) break; }
    } finally {
      commit({ ...work, updated: Date.now() });
      abort.current = null; setBusy(false); setPhase('idle'); sfx.done();
      const lastM = work.messages[work.messages.length - 1];
      setFavicon(lastM?.role === 'assistant' && lastM.text && !lastM.error && !lastM.stopped ? 'done' : 'idle');
      if (lastM?.role === 'assistant' && lastM.text && !lastM.error && !lastM.stopped) { noteReply(); if (active() && feedbackDue()) { feedbackShown(); setFb(true); } }
      await persist(work);
    }
  }, [persist, say, setConv, web]);

  /** The person pressed the button on something Coe wanted to do outside the chat: a Google file, a commit. */
  const patchRun = useCallback((msgId: string, p: Partial<ToolRun>): Conv => {
    const c = convRef.current;
    const next = { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, runs: (m.runs ?? []).map((r, i) => (i === 0 ? { ...r, ...p } : r)) } : m)) };
    setConv(next); return next;
  }, [setConv]);
  const settle = useCallback(async (msgId: string, p: Partial<ToolRun>, told: string) => {
    let next = patchRun(msgId, p);
    next = { ...next, messages: [...next.messages, { id: uid(), role: 'user', hidden: true, text: told, ts: Date.now() }] };
    setConv(next); await persist(next);
  }, [patchRun, persist, setConv]);
  const approveRun = useCallback(async (msgId: string) => {
    const r = convRef.current.messages.find((x) => x.id === msgId)?.runs?.[0]; if (!r) return;
    patchRun(msgId, { status: 'running', note: undefined });
    try {
      const out = await approveTool(r.args as Call, { plan: planNow(loadSettings()), files: () => convRef.current.files ?? {} });
      await settle(msgId, { status: 'ok', result: out.result, out: out.url ? { kind: 'link', url: out.url, label: out.label ?? 'Open' } : undefined }, `[The person approved it, and it was done. ${out.result}]`);
    } catch (e) { patchRun(msgId, { status: 'pending', note: (e as Error).message }); }
  }, [patchRun, settle]);
  const skipRun = useCallback((msgId: string) => { void settle(msgId, { status: 'ok', result: 'Not done.', out: { kind: 'text', text: 'Not done.' } }, '[The person chose not to do it. Do not ask again unless they do.]'); }, [settle]);
  const askRef = useRef<(t: string) => void>(() => {});
  const richCtx = useMemo<RichCtx>(() => ({ plan: planNow(settings), files: conv.files ?? {}, convId: conv.id, approve: approveRun, skip: skipRun, ask: (t: string) => askRef.current(t), pics: imagesOf(conv), effects: settings.effects }), [settings, conv.files, conv.id, conv.messages.length, approveRun, skipRun, status()]);   // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => abort.current?.abort(), []);

  const sendBody = useCallback((raw: string, extra?: { pics?: Img[]; atts?: Attach[]; work?: boolean; late?: boolean }) => {
    if (busy || reading) return;
    const body = raw.trim(); const pp = extra?.pics ?? [], aa = extra?.atts ?? [];
    if (!body && !pp.length && !aa.length) return;
    if (!connection(settings).ok) { openSetup(); return; }
    const c = convRef.current;
    const msg: Msg = { id: uid(), role: 'user', text: body, images: pp.length ? pp : undefined, attach: aa.length ? aa : undefined, ts: Date.now(), late: extra?.late || undefined };
    const title = c.messages.length ? c.title : titleFrom(body || (aa[0]?.name ?? pp[0]?.name ?? 'Picture'));
    const next: Conv = { ...c, title, messages: [...c.messages, msg], updated: Date.now() };
    setConv(next); void run(next, { work: !!extra?.work });
  }, [busy, reading, settings, run, setConv]);   // eslint-disable-line react-hooks/exhaustive-deps

  askRef.current = sendBody;

  // Messages sent while Coe is still replying wait their turn here. None is ever dropped: either it goes next, or it goes now and the one before it is still answered.
  const [queue, setQueue] = useState<Queued[]>([]);
  const send = useCallback(() => {
    if (reading) return;
    if (!text.trim() && !pics.length && !atts.length) return;
    const w = work, t = text, pp = pics, aa = atts;
    setText(''); setPics([]); setAtts([]); setWork(false); sfx.send();
    if (!busy) { sendBody(t, { pics: pp, atts: aa, work: w }); return; }
    const item: Queued = { id: uid(), text: t.trim(), pics: pp, atts: aa, work: w };
    if (settings.whileBusy === 'interrupt') { setQueue((q) => [{ ...item, late: true }, ...q]); abort.current?.abort(); }
    else setQueue((q) => [...q, item]);
  }, [busy, reading, text, pics, atts, work, sendBody, settings.whileBusy]);
  useEffect(() => () => setFavicon('idle'), []);
  askRef.current = (t: string) => { if (busy || reading) setQueue((q) => [...q, { id: uid(), text: t, pics: [], atts: [], work: false }]); else sendBody(t); };
  const sendQueuedNow = useCallback((id: string) => { setQueue((q) => { const it = q.find((x) => x.id === id); return it ? [{ ...it, late: true }, ...q.filter((x) => x.id !== id)] : q; }); abort.current?.abort(); }, []);
  const dropQueued = useCallback((id: string) => setQueue((q) => q.filter((x) => x.id !== id)), []);
  useEffect(() => {
    if (busy || reading || !queue.length) return;
    const last = convRef.current.messages[convRef.current.messages.length - 1];
    if (last?.role === 'assistant' && last.error && !queue[0].late) return;    // a failed reply: wait for the person rather than failing again and again
    const [next, ...rest] = queue; setQueue(rest);
    sendBody(next.text, { pics: next.pics, atts: next.atts, work: next.work, late: next.late });
  }, [busy, reading, queue, sendBody]);

  // ---------------------------------------------------------------- voice: dictation, reading aloud, and voice mode
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [dict, setDict] = useState<'off' | 'rec' | 'work'>('off');
  const dictRef = useRef<{ stop: () => void } | null>(null);
  const [aloud, setAloud] = useState<string | null>(null);
  const aloudRef = useRef<Speaking | null>(null);
  const addText = (t: string) => { if (t.trim()) setText((x) => (x && !/\s$/.test(x) ? x + ' ' : x) + t.trim()); };
  const toggleDict = async () => {
    if (dict === 'rec') { dictRef.current?.stop(); return; }
    if (dict === 'work') return;
    try {
      if (serverVoice(settings) && canListen() && !loadPrefs().browser) {
        setDict('rec'); const l = listening({ manual: true, waitMs: 120000, maxMs: 180000 }); dictRef.current = l;
        const blob = await l.result; dictRef.current = null; setDict('work');
        if (blob) addText(await transcribe(settings, blob, loadPrefs().lang.slice(0, 2))); else say('I did not hear anything. Check the microphone and try again.');
      } else if (browserListens()) {
        setDict('rec'); const b = browserListen(loadPrefs().lang); dictRef.current = b; addText(await b.result); dictRef.current = null;
      } else say('This browser cannot listen. Try Chrome, Edge or Safari.');
    } catch (e) {
      const m = (e as Error).message || 'Voice did not work.'; say(/Permission|denied|NotAllowed/i.test(m) ? 'The microphone is blocked. Allow it in the address bar and try again.' : m);
      if ((e as { code?: string }).code === 'plan' && browserListens()) say(m + ' You can turn on your browser\'s own voice in Settings > Voice.');
    } finally { setDict('off'); }
  };
  const readAloud = (m: Msg) => {
    if (aloud === m.id) { aloudRef.current?.stop(); aloudRef.current = null; setAloud(null); return; }
    aloudRef.current?.stop();
    const sp = speak(settings, m.text, loadPrefs()); aloudRef.current = sp; setAloud(m.id);
    void sp.done.then((r) => { if (aloudRef.current === sp) { aloudRef.current = null; setAloud(null); } if (r.error && !r.fallback) say(r.error); });
  };
  useEffect(() => () => { aloudRef.current?.stop(); }, []);
  // With "Read answers aloud" on, a finished answer is spoken, unless voice mode is already doing that.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) { wasBusy.current = true; return; }
    if (!wasBusy.current) return; wasBusy.current = false;
    if (voiceOpen || !loadPrefs().auto) return;
    const m = conv.messages[conv.messages.length - 1];
    if (m && m.role === 'assistant' && !m.error && m.text.trim()) readAloud(m);
  }, [busy]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { applyDisplay(settings); }, [settings.scale, settings.motion, settings.compact, settings.easy]);   // eslint-disable-line react-hooks/exhaustive-deps
  const lastReply = useMemo(() => { const m = conv.messages[conv.messages.length - 1]; return m && m.role === 'assistant' ? { id: m.id, text: wordsOf(m.text), error: !!m.error } : null; }, [conv.messages]);

  const errAct = (a: ErrAct) => {
    if (a === 'retry') retry();
    else if (a === 'settings') openSetup();
    else if (a === 'plans') window.location.href = '/plans/';
    else setAcct(true);
  };
  const retry = useCallback(() => {
    if (busy) return;
    const c = convRef.current;
    const msgs = cutToUser(c.messages);
    if (!msgs.length) return;
    const w = !!c.messages[msgs.length]?.work;
    const next = { ...c, messages: msgs }; setConv(next); void run(next, { work: w });
  }, [busy, run, setConv]);

  const edit = useCallback((id: string) => {
    if (busy) return;
    const c = convRef.current; const i = c.messages.findIndex((m) => m.id === id); if (i < 0) return;
    const m = c.messages[i];
    setText(m.text); setPics(m.images ?? []); setAtts(m.attach ?? []);
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
    const c = convRef.current; const msgs = cutToUser(c.messages);
    if (!msgs.length) return;
    const prev = c.messages.slice(msgs.length).filter((m) => m.role === 'assistant').map((m) => wordsOf(m.text));
    // A few free redos a day, then it counts like any other message, so nobody's allowance (or Coe's bill) can be drained by pressing it.
    const free = redoLeft(planNow(loadSettings())) > 0; if (free) redoUsed();
    const next = { ...c, messages: msgs }; setConv(next); void run(next, { free, wrong: prev.join('\n\n'), work: !!c.messages[msgs.length]?.work });
  }, [busy, run, setConv]);

  // ---------------------------------------------------------------- keys
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && abort.current && !panel && !big) { abort.current.abort(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); fresh(); }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalOpen((o) => !o); }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === '/' || e.key === '?')) { e.preventDefault(); setKeysOpen((o) => !o); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [fresh, panel, big]);

  // Menus close when you press anywhere else.
  useEffect(() => {
    if (!menu && !picker && !perPick && !plusOpen) return;
    const off = (e: PointerEvent) => { if (!(e.target as Element).closest('.cx-pop, .cx-more, .cx-model, .cx-persona, .cx-plus, .hd-more')) { setHdMore(false); setMenu(null); setPicker(false); setPerPick(false); setPlusOpen(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setPicker(false); setPerPick(false); setPlusOpen(false); } };
    window.addEventListener('pointerdown', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', off); window.removeEventListener('keydown', esc); };
  }, [menu, picker, perPick, plusOpen]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash.length && !e.nativeEvent.isComposing) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashAt((a) => (a + 1) % slash.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashAt((a) => (a + slash.length - 1) % slash.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); useSlash(slash[Math.min(slashAt, slash.length - 1)]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setText(''); return; }
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const sends = settings.enter === 'send' ? !e.shiftKey : (e.ctrlKey || e.metaKey);
    if (sends) { e.preventDefault(); send(); }
  };

  // Copy buttons inside code blocks.
  const onMessages = (e: React.MouseEvent) => {
    const pic = (e.target as Element).closest<HTMLElement>('img.cx-img'); if (pic) { pic.classList.toggle('zoom'); return; }
    const eq = (e.target as Element).closest('.katex'); if (eq) { const t = eq.querySelector('annotation[encoding="application/x-tex"]')?.textContent; if (t) { navigator.clipboard?.writeText(t).then(() => say('LaTeX copied.'), () => say('Could not copy.')); return; } }
    const rn = (e.target as Element).closest<HTMLElement>('[data-run]'); if (rn) { const box = rn.closest<HTMLElement>('.cx-code'); if (box) runBlock(box, rn.dataset.run === 'py' ? 'py' : 'js'); return; }
    const b = (e.target as Element).closest<HTMLElement>('[data-copy]'); if (!b) return;
    const code = b.closest('.cx-code')?.querySelector('code')?.textContent ?? '';
    navigator.clipboard?.writeText(code).then(() => { b.textContent = 'Copied'; window.setTimeout(() => { b.textContent = 'Copy'; }, 1300); }, () => say('Could not copy.'));
  };

  const copyMsg = (m: Msg) => navigator.clipboard?.writeText(m.text).then(() => say('Copied.'), () => say('Could not copy.'));

  // ---------------------------------------------------------------- data
  const insertText = (s2: string) => { const el = box.current; const a = el?.selectionStart ?? text.length, b = el?.selectionEnd ?? text.length; setText(text.slice(0, a) + s2 + text.slice(b)); requestAnimationFrame(() => { el?.focus(); const p = a + s2.length; el?.setSelectionRange(p, p); }); };
  const slash = useMemo(() => { const m = /^\/(\w*)$/.exec(text); return m ? SLASH.filter((c) => c.cmd.startsWith(m[1].toLowerCase())).slice(0, 8) : []; }, [text]);
  useEffect(() => { setSlashAt(0); }, [slash.length]);
  const useSlash = (c: (typeof SLASH)[number]) => {
    if (c.go === 'maths') { setText(''); setMathOpen(true); return; }
    if (c.go === 'voice') { setText(''); setVoiceOpen(true); return; }
    if (c.go === 'code') { setText(''); setTool(true); return; }
    setText(c.text); requestAnimationFrame(() => { const el = box.current; el?.focus(); el?.setSelectionRange(c.text.length, c.text.length); });
  };
  const pickPersona = (id: string) => { setPersona(id); savePersona(id); setPerPick(false); say(id === 'coe' ? 'Back to the usual Coe.' : `Coe is now working as: ${personaOf(id).name}.`); };
  const chatName = (m: Msg) => (m.role === 'user' ? 'You' : 'Coe');
  const saveHtml = async () => { if (!conv.messages.length) { say('There is nothing to save yet.'); return; } downloadText(`${conv.title.replace(/[^\w -]+/g, '').trim().slice(0, 40) || 'conversation'}.html`, await chatPage(conv, chatName), 'text/html'); };
  const shareThis = () => { if (!conv.messages.length) { say('There is nothing to share yet.'); return; } if (!session()) { say('Sign in to share a chat as a link.'); setAcct(true); return; } setShareOpen(true); };
  const savePdf = () => { if (!conv.messages.length) { say('There is nothing to print yet.'); return; } void printChat(conv, chatName).catch(() => say('The print box could not open.')); };
  const exportOne = () => { if (conv.messages.length) downloadText(`${conv.title.replace(/[^\w -]+/g, '').trim().slice(0, 40) || 'conversation'}.md`, toMarkdown(conv, names), 'text/markdown'); };
  const pickLead = (l: Lead) => { setLead(l); setLeadState(l); sfx.on(); };
  const toggleSound = () => { const v = !sfxOn(); if (!v) sfx.off(); setSfx(v); setSoundOn(v); say(v ? 'Sounds on.' : 'Sounds off.'); };
  const goTo = (id: string) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`); if (!el) return;
    stick.current = false; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); window.setTimeout(() => el.classList.remove('flash'), 1700);
  };
  const askFor = (t: string) => { setText(t); requestAnimationFrame(() => { const el = box.current; el?.focus(); el?.setSelectionRange(t.length, t.length); }); };
  const cmds: Cmd[] = [
    { id: 'new', group: 'Chat', title: 'New chat', hint: 'Ctrl+Shift+O', run: fresh },
    { id: 'voice', group: 'Chat', title: 'Talk with Coe (voice mode)', run: () => setVoiceOpen(true) },
    { id: 'dict', group: 'Chat', title: 'Dictate a message', run: () => void toggleDict() },
    { id: 'aloud', group: 'Chat', title: 'Read the last reply aloud', run: () => { const m = [...conv.messages].reverse().find((x) => x.role === 'assistant' && x.text); if (m) readAloud(m); else say('There is no reply to read yet.'); } },
    { id: 'attach', group: 'Chat', title: 'Add a picture, sound, video or file', run: () => fileIn.current?.click() },
    { id: 'study', group: 'Study', title: 'Open Study', hint: due ? `${due} cards due` : 'decks and reviews', run: () => setStudyOpen(true) },
    { id: 'made', group: 'Chat', title: 'Made in this chat', hint: 'pages, pictures, quizzes', run: () => setGalOpen(true) },
    { id: 'sketch', group: 'Tools', title: 'Sketch for Coe', hint: 'draw and send', run: () => setSketchOpen(true) },
    { id: 'lab', group: 'Tools', title: 'Sound lab', hint: 'tempo, key, instruments, noises', run: () => setLabOpen(true) },
    { id: 'camera', group: 'Tools', title: 'Take a picture', run: () => (canCamera() ? setCapture('camera') : cameraIn.current?.click()) },
    ...(canScreen() ? [{ id: 'screen', group: 'Tools', title: 'Capture your screen', run: () => setCapture('screen') } as Cmd] : []),
    { id: 'math', group: 'Tools', title: 'Maths keyboard', hint: 'equations and chemistry', run: () => setMathOpen(true) },
    { id: 'code', group: 'Tools', title: 'Code check', run: () => setTool(true) },
    { id: 'files', group: 'Tools', title: 'Project folder', run: () => setShelf(true) },
    { id: 'web', group: 'Tools', title: web ? 'Turn web search off' : 'Turn web search on', on: web, run: () => { const v = !web; setWeb(v); try { localStorage.setItem('pmc:coe:web', v ? '1' : '0'); } catch { /* storage blocked */ } } },
    { id: 'work', group: 'Tools', title: 'Deep Work for the next message', on: work, run: () => setWork((w) => !w) },
    ...SLASH.filter((c) => !c.go).map((c): Cmd => ({ id: 'sl-' + c.cmd, group: 'Start with', title: c.title, hint: '/' + c.cmd, run: () => useSlash(c) })),
    { id: 'ex-chat-quiz', group: 'This chat', title: 'Quiz me on this chat', run: () => sendBody('Make me a quiz (a quiz block, 6 questions, with the reason for each answer) on what we have covered in this chat.') },
    { id: 'ex-chat-cards', group: 'This chat', title: 'Make flash cards from this chat', run: () => sendBody('Make flash cards (a flashcards block, about 12 cards) from what we have covered in this chat.') },
    { id: 'ex-chat-sum', group: 'This chat', title: 'Summarise this chat', run: () => sendBody('Summarise this chat in short bullet points, and list anything I still need to do.') },
    { id: 'md', group: 'Save', title: 'Save this chat as Markdown', run: exportOne },
    { id: 'pdf', group: 'Save', title: 'Save this chat as PDF', hint: 'opens the print box', run: savePdf },
    ...(cloudOn ? [{ id: 'share', group: 'Save', title: 'Share this chat as a link', hint: 'read-only', run: shareThis } as Cmd] : []),
    { id: 'html', group: 'Save', title: 'Save this chat as a web page', run: () => void saveHtml() },
    ...[...PERSONAS, ...mine].map((p): Cmd => ({ id: 'p-' + p.id, group: 'Coe works as', title: p.name, hint: p.blurb, on: persona === p.id, run: () => pickPersona(p.id) })),
    { id: 'mystyles', group: 'Coe works as', title: 'Write or edit my styles', run: () => setStylesOpen(true) },
    ...LEADS.map((l): Cmd => ({ id: 'lead-' + l.id, group: 'Look', title: `${l.name} colour`, hint: l.blurb, on: lead === l.id, run: () => pickLead(l.id) })),
    { id: 'sfx', group: 'Look', title: soundOn ? 'Turn click sounds off' : 'Turn click sounds on', on: soundOn, run: toggleSound },
    ...(isInstalled() ? [] : [{ id: 'install', group: 'Help', title: 'Install Coe as an app', hint: 'opens offline too', run: () => { void installCoe().then(say); } } as Cmd]),
    { id: 'keys', group: 'Help', title: 'Keyboard shortcuts', hint: 'Ctrl+/', run: () => setKeysOpen(true) },
    { id: 'acct', group: 'Account', title: me ? 'Account' : 'Sign in', run: () => setAcct(true) },
    { id: 'plans', group: 'Account', title: 'Plans and tokens', run: () => { window.location.href = '/plans/'; } },
    { id: 'set', group: 'Account', title: 'Settings', run: () => { setTab(keyOn ? 'ai' : 'connect'); setPanel('settings'); } },
  ];
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
  const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user' && !m.hidden)?.id;
  const full = !keyOn && left <= 0;
  const hasInput = text.trim().length > 0 || pics.length > 0 || atts.length > 0;
  const canSend = !reading && !full && hasInput;
  const wq = quotaLeft('work', settings), proNow = planNow(settings) === 'pro';
  const madeRef = useRef(0);
  const made = useMemo(() => { if (!busy) madeRef.current = piecesOf(conv).length; return madeRef.current; }, [conv, busy]);
  const days = streak().days;
  type IconName = Parameters<typeof UiIcon>[0]['name'];
  const plusItems: { id: string; icon: IconName; title: string; hint: string; run: () => void; hide?: boolean }[] = [
    { id: 'file', icon: 'attach', title: 'Add a file', hint: 'Pictures, PDF, Word, sound, video', run: () => fileIn.current?.click() },
    { id: 'camera', icon: 'camera', title: 'Take a picture', hint: 'Use the camera', run: () => (canCamera() ? setCapture('camera') : cameraIn.current?.click()) },
    { id: 'sketch', icon: 'sketch', title: 'Sketch', hint: 'Draw it for Coe', run: () => setSketchOpen(true) },
    { id: 'lab', icon: 'wave', title: 'Sound lab', hint: 'Tempo, key, instruments, noises', run: () => setLabOpen(true) },
    { id: 'screen', icon: 'screen', title: 'Capture your screen', hint: 'Show Coe a window', run: () => setCapture('screen'), hide: !canScreen() },
    { id: 'math', icon: 'sigma', title: 'Maths keyboard', hint: 'Equations and chemistry', run: () => setMathOpen(true) },
    { id: 'folder', icon: 'folder', title: 'Project folder', hint: hasFiles(conv.files) ? `${Object.keys(conv.files!).length} files in this chat` : 'Files for this chat', run: () => setShelf((v) => !v), hide: !(proNow || hasFiles(conv.files)) },
  ];

  const toggleWeb = () => { const v = !web; setWeb(v); try { localStorage.setItem('pmc:coe:web', v ? '1' : '0'); } catch { /* storage blocked */ } };
  const toggleWork = () => { if (!work && !proNow && wq.left <= 0) { setUpgrade('Deep Work is part of Pro. Free includes one run a day, and today\'s is used.'); return; } setWork((w) => !w); };
  const shownPhase: Phase = reading ? 'read' : phase;
  const quick: { id: string; icon: IconName; title: string; n?: number; off?: boolean; run: () => void }[] = [
    { id: 'study', icon: 'study', title: 'Study', n: due, run: () => setStudyOpen(true) },
    { id: 'code', icon: 'code', title: 'Code check', run: () => setTool(true) },
    { id: 'made', icon: 'layers', title: 'Made', n: made, off: !made, run: () => setGalOpen(true) },
    { id: 'voice', icon: 'wave', title: 'Voice', run: () => setVoiceOpen(true) },
  ];

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
          <div className="cx-quick" role="group" aria-label="Tools">
            {quick.map((q) => (
              <button key={q.id} type="button" className="cxk" disabled={q.off} onClick={() => { if (window.innerWidth < 900) setSide(false); q.run(); }}>
                <UiIcon name={q.icon} size={18} /><span className="d">{q.title}</span>{!!q.n && <i className="cxk-n">{q.n}</i>}
              </button>
            ))}
          </div>
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
            <span className="d cx-plan-name">{planName}</span><span className="tx cx-small">{keyOn ? 'No daily limit' : `${fmtTok(usedNow)} of ${fmtTok(perDay)} tokens today`}</span>
          </div>
          {!keyOn && <div className="cx-meter" role="img" aria-label={`${fmtTok(usedNow)} of ${fmtTok(perDay)} tokens used today`}><i style={{ width: `${Math.min(100, (usedNow / perDay) * 100)}%` }} /></div>}
          <button type="button" className="cx-acct tx" onClick={() => setAcct(true)}>{me ? <>Saved to <b>{me}</b></> : <>Saved on this device. <u>Sign in</u> to keep them in an account.</>}</button>
          <div className="cx-foot-btns">
            <a className="btn small" href="/plans/"><UiIcon name="card" size={15} />Plans</a>
            <button type="button" className="btn small" onClick={() => { setTab('ai'); setPanel('settings'); }}><UiIcon name="gear" size={15} />Settings</button>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------ chat */}
      <section className={`cx-main${shelf ? " ws-open" : ""}`} aria-label="Chat">
        <header className="cx-head hd">
          <button type="button" className="hd-b" aria-label={side ? 'Hide the list' : 'Show the list'} aria-pressed={side} onClick={() => setSide((s) => !s)}><UiIcon name="panel" size={22} /><span className="hd-t d">Chats</span></button>
          {titling && conv.messages.length
            ? <Rename className="cx-title-in" value={conv.title} onDone={(v) => rename(conv.id, v)} />
            : <button type="button" className="cx-title hd-title d" disabled={!conv.messages.length} onClick={() => setTitling(true)} title={conv.messages.length ? 'Rename' : undefined}>{conv.title}</button>}
          <span className="cx-grow" />
          <Select className="cx-model" small block={false} align="right" label="Model" value={conv.model}
            options={COE_MODELS.map((m) => ({ value: m.key, label: m.name, hint: m.blurb, badge: canUse(planNow(settings), m.key) ? m.tag : 'Pro' }))}
            onChange={(k) => pickModel(k as ModelKey)} />
          <div className="hd-more">
            <button type="button" className="hd-b hd-dots" aria-label="More" aria-haspopup="menu" aria-expanded={hdMore} onClick={() => setHdMore((o) => !o)}><UiIcon name="more" size={22} /></button>
            {hdMore && (
              <ul className="cx-pop hd-pop" role="menu" aria-label="More">
                {([
                  ['Save this chat as a file', 'download', exportOne, empty],
                  ...(cloudOn ? [['Share this chat as a link', 'share', shareThis, empty]] : []),
                  ['Commands', 'command', () => setPalOpen(true), false],
                  ['Settings', 'gear', () => { setTab('ai'); setPanel('settings'); }, false],
                  ...(isInstalled() ? [] : [['Install Coe as an app', 'install', () => { void installCoe().then(say); }, false]]),
                ] as [string, Parameters<typeof UiIcon>[0]['name'], () => void, boolean][]).map(([t, ic, run, off]) => (
                  <li key={t} role="none"><button type="button" role="menuitem" className="cx-opt hd-pop-i" disabled={off} onClick={() => { setHdMore(false); run(); }}><span className="d cx-opt-n"><UiIcon name={ic} size={17} />{t}</span></button></li>
                ))}
                {owner && <li role="none"><button type="button" role="menuitem" className={`cx-opt hd-pop-i${conn.ok ? '' : ' danger'}`} onClick={() => { setHdMore(false); setTab(keyOn ? 'ai' : 'connect'); setPanel('settings'); }}><span className="d cx-opt-n"><UiIcon name="shield" size={17} />{conn.ok ? 'Server ready' : 'Server not set up'}</span></button></li>}
              </ul>
            )}
          </div>
          {me
            ? <button type="button" className="hd-b hd-me" aria-label={`Account: ${me}`} title={me} onClick={() => setAcct(true)}><span className="d">{me.slice(0, 1).toUpperCase()}</span></button>
            : <button type="button" className="hd-b hd-in cx-signin" onClick={() => setAcct(true)}><span className="d">Sign in</span></button>}
        </header>

        {!keyOn && livePct >= 90 && !usageOff && (
          <div className={`cx-usage${livePct >= 100 ? ' out' : ''}`} role="alert">
            <span className="cx-usage-ic" aria-hidden><UiIcon name="alert" size={22} /></span>
            <div className="cx-usage-t">
              <b className="d">{livePct >= 100 ? 'All of today\'s tokens are used' : <>You have used <em className="cx-usage-n">{livePct}%</em> of today&apos;s tokens</>}</b>
              <span className="tx">{fmtTok(Math.max(0, perDay - usedNow - streamed))} of {fmtTok(perDay)} left. They come back at midnight (UTC).{plan.key === 'free' ? ' Pro has far more.' : ''}</span>
              <div className="cx-usage-bar" aria-hidden><i style={{ width: `${livePct}%` }} /></div>
            </div>
            {plan.key === 'free' && <a className="btn small gold" href="/plans/"><UiIcon name="card" size={15} />See plans</a>}
            <button type="button" className="cx-usage-x" aria-label="Hide this" onClick={() => setUsageOff(true)}><UiIcon name="close" size={16} /></button>
          </div>
        )}
        <div className="cx-scroll" ref={scroller} onScroll={onScroll} onClick={onMessages}>
          {empty ? (
            <div className="cx-empty home">
              <h2 className="home-h d">{greeting(settings.name, new Date().getHours(), hello)}</h2>
              <p className="home-lead tx">Ask anything, add a picture, or start from a block.</p>
              {!conn.ok && owner && (
                <div className="cx-connect">
                  <p className="tx"><b className="d">Not set up yet.</b> {conn.why}</p>
                  <button type="button" className="btn gold" onClick={() => { setTab(keyOn ? 'ai' : 'connect'); setPanel('settings'); }}>Set up Coe</button>
                </div>
              )}
              <div className="plates">
                {(moreStarters ? STARTERS : STARTERS.slice(0, 9)).map((s, i) => (
                  <button key={s.title} type="button" className={`plate c${i % 5}${i % 4 === 1 ? ' cut' : ''}`} style={{ animationDelay: `${i * 55}ms` }}
                    onClick={() => { if (s.tool === 'code') { setTool(true); return; } setText(s.text ?? ''); box.current?.focus(); if (s.pic) (canCamera() ? setCapture('camera') : fileIn.current?.click()); }}>
                    <UiIcon name={s.icon} size={30} />
                    <b className="plate-t d">{s.title}</b>
                    <span className="plate-h tx">{s.hint}</span>
                  </button>
                ))}
                {!moreStarters && STARTERS.length > 9 && <button type="button" className="plate more" onClick={() => setMoreStarters(true)}><b className="plate-t d">{STARTERS.length - 9} more</b><span className="plate-h tx">Show every block</span></button>}
              </div>
              <div className="home-strip">
                <button type="button" className="strip-b" onClick={() => setStudyOpen(true)}><UiIcon name="flame" size={22} /><b className="d">{days}</b><span className="tx">day streak</span></button>
                <button type="button" className="strip-b" onClick={() => setStudyOpen(true)}><UiIcon name="study" size={22} /><b className="d">{due}</b><span className="tx">cards due</span></button>
                <div className="strip-look" role="group" aria-label="Colour">
                  {LEADS.map((l) => <button key={l.id} type="button" className={`sw sw-${l.id}`} aria-label={`${l.name} colour`} aria-pressed={lead === l.id} title={l.name} onClick={() => pickLead(l.id)} />)}
                </div>
                <span className="strip-cr tx">{keyOn ? 'No daily limit' : `${fmtTok(Math.max(0, left))} tokens left today`}</span>
              </div>
            </div>
          ) : (
            <RichContext.Provider value={richCtx}><ol className="cx-msgs">
              {conv.messages.map((m, i) => {
                if (m.hidden) return null;
                const lastOne = i === conv.messages.length - 1 || conv.messages.slice(i + 1).every((x) => x.hidden);
                const live = streaming && lastOne && m.role === 'assistant';
                const nextVis = conv.messages.slice(i + 1).find((x) => !x.hidden), turnEnd = m.role === 'assistant' && (!nextVis || nextVis.role === 'user');
                const rr = m.runs?.[0], liveRun = live && rr?.status === 'running' ? describeRun(rr) : null;
                return (
                  <li key={m.id} data-mid={m.id} className={`cx-msg ${m.role}${Date.now() - m.ts < 2500 ? ' new' : ''}`}>
                    <div className="cx-who d">{m.role === 'user' ? 'You' : <><CoeStar size={20} mode={live ? shownPhase : undefined} />Coe{m.work ? <i>Deep Work</i> : m.model ? <i>{modelByKey(m.model).name.replace(/^Coe /, '')}</i> : null}</>}</div>
                    {m.images?.length ? (
                      <div className="cx-pics">{m.images.map((im, k) => (
                        <button type="button" key={k} className="cx-pic" onClick={() => setBig(im)} aria-label={`Open ${im.name}`}><img src={dataUrl(im)} alt={im.name} /></button>
                      ))}</div>
                    ) : null}
                    {m.attach?.length ? <div className="cx-atts">{m.attach.map((a, k) => <span key={k} className="cx-att tx"><UiIcon name="file" size={15} /><b>{a.name}</b><i>{a.kind}{a.cut ? ', cut short' : ''}</i></span>)}</div> : null}
                    {m.role === 'user'
                      ? (m.text && <p className="cx-says tx">{m.text}</p>)
                      : (m.text ? <Rich text={m.text} msg={m} live={live} /> : live && !m.error ? <Working phase={shownPhase} label={liveRun?.now} detail={liveRun?.detail} /> : null)}
                    {m.role === 'assistant' && m.checked && !live && <p className={`cx-checked tx ${m.checked}`}><UiIcon name={m.checked === 'ok' ? 'shield' : 'wand'} size={14} />{m.checked === 'ok' ? 'Double-checked' : <>Fixed before sending: {m.fix}</>}</p>}
                    {live && m.text && shownPhase === 'write' && <span className="cx-cursor" aria-hidden />}
                    {live && m.text && shownPhase !== 'write' && !(m.runs?.length) && <Working phase={shownPhase} size={24} />}
                    {m.role === 'assistant' && turnEnd && !m.error && <Activity steps={turnSteps(conv.messages, i)} live={live} phaseNote={PHASES[shownPhase === 'rest' ? 'idle' : shownPhase].label} />}
                    {m.error && (
                      <ErrorBox own={keyOn} kind={m.errKind} text={m.error} canRetry={lastOne && !busy} onAct={errAct} />
                    )}
                    {m.role === 'assistant' && (m.stopped || m.cut) && !m.error && <p className="cx-flag tx">{m.stopped ? 'You stopped this reply.' : 'This reply reached its length limit. Say “continue” to carry on.'}</p>}
                    {!live && (
                      <div className="cx-acts">
                        {m.role === 'assistant' && m.text && <button type="button" className="cx-act" onClick={() => copyMsg(m)}><UiIcon name="copy" size={14} />Copy</button>}
                        {m.role === 'assistant' && m.text && !m.error && <button type="button" className="cx-act" aria-pressed={aloud === m.id} onClick={() => readAloud(m)}><UiIcon name={aloud === m.id ? 'stop' : 'volume'} size={14} />{aloud === m.id ? 'Stop' : 'Read aloud'}</button>}
                        {m.role === 'assistant' && lastOne && !m.error && !busy && <button type="button" className="cx-act" onClick={retry}><UiIcon name="refresh" size={14} />Again</button>}
                        {m.role === 'assistant' && lastOne && !m.error && !busy && m.text && (() => { const left = redoLeft(planNow(settings)); return <button type="button" className={`cx-act${left > 0 ? ' free' : ''}`} onClick={redo} title={left > 0 ? `Wrong? Redo it free. ${left} free ${left === 1 ? 'redo' : 'redos'} left today; after that a redo counts like a normal message.` : 'Redo it. Today\'s free redos are used, so this counts like a normal message.'}><UiIcon name="wand" size={14} />{left > 0 ? `Redo free (${left})` : 'Redo'}</button>; })()}
                        {m.role === 'assistant' && m.text && !m.error && <button type="button" className="cx-act" onClick={() => setInfoFor(m.id)} title="Details about this answer"><UiIcon name="info" size={14} />Info</button>}
                        {m.role === 'user' && m.id === lastUser && !busy && <button type="button" className="cx-act" onClick={() => edit(m.id)}><UiIcon name="edit" size={14} />Edit</button>}
                        {m.role === 'assistant' && m.outTokens ? <span className="cx-tok tx">{m.outTokens} tokens</span> : null}
                      </div>
                    )}
                    {m.role === 'assistant' && lastOne && !live && !busy && !m.error && (() => {
                      const f = followupsOf(m.text);
                      return f.length ? <div className="cx-fu" role="group" aria-label="Ask next">{f.map((x) => <button key={x} type="button" className="fu" onClick={() => sendBody(x)}>{x}</button>)}</div> : null;
                    })()}
                  </li>
                );
              })}
            </ol></RichContext.Provider>
          )}
        </div>

        <footer className="cx-compose">
          {away && <button type="button" className="cx-jump btn small" onClick={() => { stick.current = true; toBottom(true); setAway(false); }}><UiIcon name="down" size={15} />Latest</button>}
          {note && <p className="cx-flag tx">{note}</p>}
          {full && <p className="cx-limit tx" role="status">All {fmtTok(perDay)} tokens for today are used. <a className="cx-link" href="/plans/">See plans</a></p>}
          {fb && !busy && !empty && <Feedback onRate={(r) => void sendFeedback(loadSettings(), r)} onLater={() => { feedbackLater(); setFb(false); }} onDone={() => setFb(false)} />}
          {queue.length > 0 && (
            <ul className="cx-queue" aria-label="Messages waiting to be sent">
              {queue.map((q) => (
                <li key={q.id} className={`cx-qi${q.late ? ' now' : ''}`}>
                  <UiIcon name={q.late ? 'bolt' : 'timer'} size={15} /><b className="d">{q.late ? 'Sending next' : 'Waiting'}</b>
                  <span className="tx cx-qi-t">{q.text || (q.pics.length ? 'A picture' : 'A file')}</span>
                  {busy && !q.late && <button type="button" className="cx-qi-b" onClick={() => sendQueuedNow(q.id)} title="Stop this reply, keep it, and send this now"><UiIcon name="bolt" size={13} />Send now</button>}
                  <button type="button" className="cx-qi-x" aria-label="Take this message back" title="Take it back" onClick={() => { dropQueued(q.id); setText((t) => (t ? t : q.text)); }}><UiIcon name="close" size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="cx-box">
            {pics.length > 0 && (
              <div className="cx-chips">{pics.map((p, i) => (
                <span key={i} className="cx-chipic"><img src={dataUrl(p)} alt={p.name} />
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPics((x) => x.filter((_, k) => k !== i))}><UiIcon name="close" size={12} /></button></span>
              ))}</div>
            )}
            {(atts.length > 0 || reading) && (
              <div className="cx-chips">
                {atts.map((a, i) => <span key={i} className="cx-att tx"><UiIcon name="file" size={15} /><b>{a.name}</b><i>{a.kind}{a.cut ? ', cut short' : ''}</i>
                  <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAtts((x) => x.filter((_, k) => k !== i))}><UiIcon name="close" size={12} /></button></span>)}
                {reading && <span className="cx-att tx"><CoeStar size={18} mode="read" /><b>{reading.endsWith('…') ? reading : `Reading ${reading}`}</b></span>}
              </div>
            )}
            {slash.length > 0 && (
              <ul className="cx-slash" role="listbox" aria-label="Commands">
                {slash.map((c, i) => <li key={c.cmd} role="option" aria-selected={i === slashAt}><button type="button" className={i === slashAt ? 'on' : ''} onMouseMove={() => setSlashAt(i)} onPointerDown={(e) => { e.preventDefault(); useSlash(c); }}><b className="d">/{c.cmd}</b><span className="tx">{c.title}</span></button></li>)}
              </ul>
            )}
            {mathOpen && <MathPad onInsert={(t) => { insertText(t); setMathOpen(false); }} onClose={() => { setMathOpen(false); box.current?.focus(); }} />}
            {(work || web || persona !== 'coe') && (
              <div className="cx-modes" role="group" aria-label="Switched on">
                {work && <button type="button" className="cx-mode" aria-label="Turn off Deep Work" onClick={() => setWork(false)}><UiIcon name="bolt" size={14} /><span className="d">Deep Work</span><UiIcon name="close" size={12} /></button>}
                {web && <button type="button" className="cx-mode" aria-label="Turn off web search" onClick={() => toggleWeb()}><UiIcon name="globe" size={14} /><span className="d">Web</span><UiIcon name="close" size={12} /></button>}
                {persona !== 'coe' && <button type="button" className="cx-mode" aria-label="Go back to the usual style" onClick={() => pickPersona('coe')}><UiIcon name="graduate" size={14} /><span className="d">{personaOf(persona).name}</span><UiIcon name="close" size={12} /></button>}
              </div>
            )}
            <textarea ref={box} className="cx-ta tx" rows={1} value={text} placeholder={work ? 'Describe the big job. Coe will plan it and work through it' : empty ? 'Ask Coe anything, or add a picture or a file' : 'Write a reply'} aria-label="Message" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onPaste={onPaste} />
            <div className="cx-bar">
              <div className="cx-plus">
                <button type="button" className={`tb tb-plus${plusOpen ? ' on' : ''}`} aria-label="Add or open" aria-haspopup="menu" aria-expanded={plusOpen} title="Add a file, switch on Deep Work or web search, pick a style" onClick={() => setPlusOpen((o) => !o)}><UiIcon name="plus" size={20} /></button>
                {plusOpen && (
                  <ul className="cx-pop cx-plusmenu" role="menu" aria-label="Add or open">
                    <li role="presentation" className="cx-pop-h d">Add</li>
                    {plusItems.filter((i) => !i.hide).map((i) => (
                      <li key={i.id} role="none"><button type="button" role="menuitem" className="cx-opt" onClick={() => { setPlusOpen(false); i.run(); }}><span className="d cx-opt-n"><UiIcon name={i.icon} size={18} />{i.title}</span><span className="tx cx-small">{i.hint}</span></button></li>
                    ))}
                    <li role="presentation" className="cx-pop-h d">Ways to work</li>
                    <li role="none"><button type="button" role="menuitemcheckbox" aria-checked={work} className={`cx-opt cx-tgl${work ? ' on' : ''}`} onClick={() => { setPlusOpen(false); toggleWork(); }}><span className="d cx-opt-n"><UiIcon name="bolt" size={18} />Deep Work<em className="cx-tg">{work ? 'On' : proNow ? 'Off' : `${wq.left} left`}</em></span><span className="tx cx-small">Plans a big job, uses tools, checks its work</span></button></li>
                    <li role="none"><button type="button" role="menuitemcheckbox" aria-checked={web} className={`cx-opt cx-tgl${web ? ' on' : ''}`} onClick={() => { setPlusOpen(false); toggleWeb(); }}><span className="d cx-opt-n"><UiIcon name="globe" size={18} />Web search<em className="cx-tg">{web ? 'On' : 'Off'}</em></span><span className="tx cx-small">Let Coe look things up online</span></button></li>
                    <li role="none"><button type="button" role="menuitem" className={`cx-opt cx-tgl${persona !== 'coe' ? ' on' : ''}`} onClick={() => { setPlusOpen(false); setPerPick(true); }}><span className="d cx-opt-n"><UiIcon name="graduate" size={18} />Style<em className="cx-tg">{persona === 'coe' ? 'Coe' : personaOf(persona).name}</em></span><span className="tx cx-small">Tutor, maths mentor, examiner and more</span></button></li>
                  </ul>
                )}
              </div>
              <div className="cx-persona">
                {perPick && (
                  <ul className="cx-pop cx-pers" role="listbox" aria-label="How Coe works">
                    {[PERSONAS[0], ...mine, ...PERSONAS.slice(1)].map((p) => <li key={p.id} role="option" aria-selected={p.id === persona}><button type="button" className={`cx-opt${p.id === persona ? ' on' : ''}`} onClick={() => pickPersona(p.id)}><span className="d cx-opt-n">{p.name}{p.mine && <b>Mine</b>}</span><span className="tx cx-small">{p.blurb}</span></button></li>)}
                    <li role="presentation"><button type="button" className="cx-opt cx-opt-new" onClick={() => { setPerPick(false); setStylesOpen(true); }}><span className="d cx-opt-n"><UiIcon name="plus" size={15} />{mine.length ? 'My styles' : 'Write your own style'}</span><span className="tx cx-small">Tell Coe exactly how you want it to work.</span></button></li>
                  </ul>
                )}
              </div>
              <input ref={fileIn} type="file" accept={`image/*,${KINDS},${MEDIA_KINDS}`} multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(f); }} />
              <input ref={cameraIn} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(f); }} />
              <span className="cx-grow" />
              <button type="button" className={`tb${dict === 'rec' ? ' rec' : ''}`} aria-label={dict === 'rec' ? 'Stop dictating' : 'Dictate with your voice'} aria-pressed={dict === 'rec'} title={dict === 'rec' ? 'Stop' : dict === 'work' ? 'Reading…' : 'Dictate: speak and it types'} disabled={dict === 'work'} onClick={() => void toggleDict()}><UiIcon name={dict === 'rec' ? 'stop' : 'mic'} size={20} /></button>
              <button type="button" className="tb" aria-label="Talk with Coe out loud" title="Voice: talk with Coe out loud" onClick={() => setVoiceOpen(true)}><UiIcon name="wave" size={20} /></button>
              {busy && <button type="button" className="cx-send stop" aria-label="Stop" title="Stop (Esc)" onClick={stop}><UiIcon name="stop" size={20} /></button>}
              {(!busy || hasInput) && <button type="button" className={`cx-send${busy ? ' later' : ''}`} aria-label={busy ? (settings.whileBusy === 'interrupt' ? 'Send now' : 'Send next') : 'Send'} title={busy ? (settings.whileBusy === 'interrupt' ? 'Send now: Coe stops this reply, keeps it, and answers both' : 'Send next: it goes after this reply') : 'Send'} disabled={!canSend} onClick={send}><UiIcon name="send" size={20} /></button>}
            </div>
          </div>
          <p className="cx-fine tx">{settings.enter === 'send' ? 'Enter sends, Shift+Enter adds a line.' : 'Ctrl+Enter sends.'} {assistant} can be wrong. Check anything important.</p>
        </footer>

        {infoFor && (() => { const m = conv.messages.find((x) => x.id === infoFor); return m ? <AnswerInfo msg={m} onClose={() => setInfoFor(null)} /> : null; })()}
        {studyOpen && <StudyHub onClose={() => setStudyOpen(false)} onAsk={askFor} say={say} />}
        {labOpen && <SoundLab settings={settings} onClose={() => setLabOpen(false)} onAttach={(a) => setAtts((x) => [...x, a].slice(0, 8))} />}
        {sketchOpen && <Sketch onDone={(f) => void addFiles([f])} onClose={() => setSketchOpen(false)} />}
        {capture && <Capture mode={capture} onShot={(f) => void addFiles([f])} onClose={() => setCapture(null)} />}
        {galOpen && <Gallery conv={conv} onGo={goTo} onClose={() => setGalOpen(false)} />}
        {shareOpen && <ShareDialog conv={conv} say={say} onClose={() => setShareOpen(false)} />}
        {stylesOpen && <StyleEditor current={persona} onUse={pickPersona} onClose={() => setStylesOpen(false)} />}
        {keysOpen && (
          <Modal title="Keyboard shortcuts" onClose={() => setKeysOpen(false)}>
            <dl className="keys">
              {[['Ctrl+K', 'Commands: find anything Coe can do'], ['Ctrl+Shift+O', 'New chat'], ['Ctrl+/', 'This list'], ['Enter', settings.enter === 'send' ? 'Send' : 'New line'], ['Shift+Enter', settings.enter === 'send' ? 'New line' : 'Send with Ctrl'], ['Esc', 'Stop a reply, or close a window'], ['/', 'At the start of a message: commands like /quiz and /cards'], ['Space', 'In Study: show the answer'], ['1 2 3 4', 'In Study: Again, Hard, Good, Easy']].map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd className="tx">{v}</dd></div>)}
            </dl>
          </Modal>
        )}
        {palOpen && <Palette cmds={cmds} onClose={() => { setPalOpen(false); box.current?.focus(); }} />}
        <SelectBar onAsk={(t) => askRef.current(t)} onQuote={(q) => { setText((x) => `${x ? x.replace(/\s*$/, '\n') : ''}> ${q}\n\n`); window.setTimeout(() => box.current?.focus(), 30); }} />
        {voiceOpen && <VoiceMode settings={settings} busy={busy} reply={lastReply} onSay={(t) => sendBody(t)} onStopChat={stop} onSettings={() => { setVoiceOpen(false); setTab('voice'); setPanel('settings'); }} onClose={() => { setVoiceOpen(false); }} />}

        {toolSeen && (
          <div className="cd-over" role="dialog" aria-modal="true" aria-label="Code check" hidden={!tool}>
            <header className="cd-over-head">
              <button type="button" className="btn gold cd-back" onClick={() => setTool(false)}><UiIcon name="left" size={18} />Back to chat</button>
              <h2 className="d"><UiIcon name="code" size={22} />Code check</h2>
              <span className="cx-grow" />
              <button type="button" className="btn small cd-x" aria-label="Close Code check" onClick={() => setTool(false)}><UiIcon name="close" size={18} />Close</button>
            </header>
            <p className="cd-explain tx">Paste or type some code and Coe finds the mistakes and shows how to fix them. Nothing is sent anywhere until you ask Coe. Press <b>Back to chat</b> (or Esc, or your phone's Back button) when you are done. Your code is kept.</p>
            <Suspense fallback={<p className="tx" role="status">Opening Code check…</p>}><Check settings={settings} onUsed={() => setUse(usage())} onSettings={() => { setTool(false); openSetup(); }} onUpgrade={setUpgrade} say={say} /></Suspense>
            <div className="cd-foot"><button type="button" className="btn gold" onClick={() => setTool(false)}><UiIcon name="left" size={18} />Back to chat</button></div>
          </div>
        )}
        {shelf && <Workspace files={conv.files ?? {}} convTitle={conv.title} onChange={(f) => { const next = { ...convRef.current, files: f }; setConv(next); void persist(next); }} onClose={() => setShelf(false)} say={say} plan={planNow(settings)} />}
        {drop && <div className="cx-drop" aria-hidden><b className="d">Drop pictures or files to add them</b></div>}
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

