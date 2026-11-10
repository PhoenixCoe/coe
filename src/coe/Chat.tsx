'use client';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CoeStar, CoeWordmark, type Phase } from '@/ui/Mark';
import { PHASES, Generating, phaseOfTool } from './Working';
import { Activity, describeRun, turnSteps } from './Activity';
import { UiIcon } from '@/ui/icons';
import { downloadText } from '@/ui/copy';
import { CoeError, ask as askModel, stream, type ChatMsg } from '@/lib/coe/client';
import { couldNot, honest } from '@/lib/coe/honest';
import { addSidebarRefunds, giveBack, type Spent } from '@/lib/coe/refunds';
import { COE_MODELS, FILE_TEXT, MAX_REPLY, MAX_WORK, QUOTAS, canUse, fmtTok, modelByKey, type ModelKey } from '@/lib/coe/models';
import { applyCredits, bumpQuota, countReply, counted, creditsNow, limitNow, onStatus, planInfo, planNow, quotaLeft, refreshStatus, status } from '@/lib/coe/account';
import { explain as describeErr, type ErrAct } from '@/lib/coe/errors';
import { ErrorBox } from './ErrorBox';
import { isOwner } from '@/lib/coe/owner';
import { modeOf, connection, loadSettings, saveSettings, type CoeSettings } from '@/lib/coe/settings';
import { toImg } from './images';
import { Dock, Rich, RichContext, dockTarget, followupsOf, wordsOf, type RichCtx } from './Blocks';
import { KINDS, isReadable, readAny } from './readers';
import { MEDIA_KINDS, isAudio, isVideo, readAudio, videoFrames } from './media';
import { STEPS, execute, findTool, memoryPrompt, SHOW_PROMPT, toolsPrompt, type Call, type ChatOps } from '@/lib/coe/tools';
import { memory, onMemory } from '@/lib/coe/links';
import { onExtChats, onExtHandoff, onExtProfile, onExtRefunds, type ExtChat } from '@/lib/coe/extension';
import { MeetCoe, MET } from './MeetCoe';
import { APPS_ORIGIN } from '@/lib/coe/pmc';
import { Workspace } from './Workspace';
import { hasFiles, type Files } from '@/lib/coe/workspace';
const Check = lazy(() => import('./Check').then((m) => ({ default: m.Check })));   // the code checker is big, so it is fetched only when opened
import { SignIn as Account } from './SignIn';
import { toneOf } from './Usage';
import { VoiceMode } from './VoiceMode';
import { SelectBar } from './SelectBar';
import { MathPad } from './MathPad';
import { Palette, type Cmd } from './Palette';
import { AttCard, AttPeek } from './Peek';
import { Capture, canCamera, canScreen } from './Capture';
import { Sketch } from './Sketch';
import { SoundLab } from './SoundLab';
import { runBlock } from './run';
import { Gallery, piecesOf } from './Gallery';
import { StudyHub } from './StudyHub';
import { LEADS, applyAccent, applyDisplay, loadAccent, loadLead, setLead, setSfx, sfx, sfxOn, type Lead } from '@/lib/coe/look';
import { dueCount, streak, subscribeStudy } from '@/lib/coe/study';
import { printChat, chatPage } from './export';
import { PERSONAS, SLASH, loadPersona, loadStyles, personaOf, savePersona, type Persona } from '@/lib/coe/personas';
import { StyleEditor } from './Styles';
import { ShareDialog } from './Share';
import { installCoe, isInstalled } from '@/lib/coe/pwa';
import { VOICE_PROMPT, browserListen, browserListens, canListen, listening, loadPrefs, serverVoice, speak, transcribe, unlockAudio, voiceActive, type Speaking } from '@/lib/coe/voice';
import { pushProfile, cloudOn, put as cloudPut, remove as cloudRemove, removeAll as cloudRemoveAll, session, sync as cloudSync } from '@/lib/coe/cloud';
import { knowledgeFor } from './knowledge';
import { BASE_COE, CHECK_SYSTEM, REDO_NOTE, STARTERS, greeting, picsNote, preferencesPrompt, worthChecking } from './prompts';
import { Halftone } from '@/ui/Halftone';
import { Modal, SettingsPanel, Upgrade, type Tab } from './Panels';
import { Select } from '@/ui/Controls';
import { setFavicon } from '@/lib/coe/favicon';
import { redoLeft, redoUsed } from '@/lib/coe/redo';
import { Clamp } from './Clamp';
import { filesOf, madeCount } from './Workspace';
import { putLive as cloudLive, peek as cloudPeek } from '@/lib/coe/cloud';
import { compactConv, tooLong } from '@/lib/coe/compact';
import { Feedback } from './Feedback';
import { CodePane } from './CodePane';
import type { EDoc } from '@/lib/coe/editors';
const Editor = lazy(() => import('./Editor'));
import { Progress } from './Progress';
import { madePictures, stepInfo } from '@/lib/coe/progress';   // the editor is big, so it is fetched only when opened
import { LANG_NAME, codeIn, codeItems, extractCode } from '@/lib/coe/codesplit';
import { AnswerInfo } from './AnswerInfo';
import { feedbackDue, feedbackLater, feedbackShown, noteReply, sendFeedback } from '@/lib/coe/feedback';
import { bucket, dataUrl, deleteAll, fillToday, deleteConv, exportAll, importAll, loadConv, loadIndex, saveConv, titleFrom, toMarkdown, uid, usage, type Attach, type Conv, type ConvMeta, type Img, type Msg, type Perm, type ToolRun } from './store';

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

/** Redo is for the long answers: an essay, a worked problem, code. A short reply is quicker to ask again. */
const worthRedo = (t: string) => t.length > 1200 || /```/.test(t) || /\$\$|\\\[/.test(t) || (t.match(/^#{1,3} /gm)?.length ?? 0) >= 2;
type Queued = { cid?: string; id: string; text: string; pics: Img[]; atts: Attach[]; work: boolean; late?: boolean };
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
  const web = true;                                           // web search is always on: Coe decides when to use it
  const [shelf, setShelf] = useState(false);                   // the Files window
  const [shelfTab, setShelfTab] = useState<'sent' | 'made' | 'project' | undefined>(undefined);
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
  // Each chat runs on its own: opening another chat leaves a reply going, and it is all there when you come back.
  const [runIds, setRunIds] = useState<string[]>([]);
  const busy = runIds.includes(conv.id);
  const aborts = useRef(new Map<string, AbortController>());
  const liveWork = useRef(new Map<string, Conv>());
  const persistRef = useRef<(c: Conv) => Promise<void>>(async () => {});
  const edOpenRef = useRef(false), cpOpenRef = useRef(false), edIdRef = useRef<string | null>(null), edOverRef = useRef(false), openEditorRef = useRef<(id?: string) => void>(() => {});
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [side, setSide] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  // A phone or a narrow window: the list folds away by itself, and stays folded when the screen is turned.
  useEffect(() => {
    const q = window.matchMedia('(max-width: 899px)');
    const fold = () => { if (q.matches) setSide(false); };
    fold(); q.addEventListener?.('change', fold);
    return () => q.removeEventListener?.('change', fold);
  }, []);
  // What you were typing stays with the chat it was for, so switching chats or closing the tab never loses it.
  const draftFor = useRef('');
  useEffect(() => {
    draftFor.current = conv.id;
    try { const d = localStorage.getItem(`pmc:coe:draft:${conv.id}`); if (d) setText(d); } catch { /* storage blocked */ }
  }, [conv.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (draftFor.current !== conv.id) return;
    const t = window.setTimeout(() => { try { const k = `pmc:coe:draft:${conv.id}`; if (text) localStorage.setItem(k, text.slice(0, 20000)); else localStorage.removeItem(k); } catch { /* storage blocked */ } }, 400);
    return () => window.clearTimeout(t);
  }, [text, conv.id]);
  // Start typing anywhere and the words go into the box.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const t = e.target as HTMLElement | null; if (t && (t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], button, a'))) return;
      if (document.querySelector('[role="dialog"]')) return;
      box.current?.focus();
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  // The on-screen keyboard shrinks the visible screen: follow it, so the box you type in is never hidden and the page never jumps.
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return;
    const fit = () => { document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`); if (vv.offsetTop > 0) window.scrollTo(0, 0); };
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); document.documentElement.style.removeProperty('--vvh'); };
  }, []);
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
  const [peek, setPeek] = useState<Attach | null>(null);
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
  const [keysOpen, setKeysOpen] = useState(false);
  const [lead, setLeadState] = useState<Lead>('cream');
  const [soundOn, setSoundOn] = useState(false);
  const [due, setDue] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fb, setFb] = useState(false);
  useEffect(() => { try { if (new URLSearchParams(location.search).get('fb') === '1') setFb(true); } catch { /* no address bar */ } }, []);
  const cameraIn = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const look = () => { setLeadState(loadLead()); setSoundOn(sfxOn()); applyAccent(loadAccent()); }; look();
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
  useEffect(() => onStatus(() => { setUse(usage()); bump((n) => n + 1); }), []);

  const nameRef = useRef<(c: Conv) => Promise<void>>(async () => {});
  const chatBits = useRef<{ patch: (id: string, p: Partial<Conv>) => Promise<void>; remove: (id: string) => Promise<void> }>({ patch: async () => {}, remove: async () => {} });
  const abort = useMemo(() => ({ get current(): AbortController | null { return aborts.current.get(convRef.current.id) ?? null; } }), []);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  const setConv = useCallback((c: Conv) => { convRef.current = c; setConvState(c); }, []);
  const setSettings = useCallback((s: CoeSettings) => { setSettingsState(s); saveSettings(s); }, []);
  const refreshList = useCallback(async () => setList(await loadIndex()), []);
  const say = useCallback((t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? '' : x)), 2600); }, []);

  // ---------------------------------------------------------------- code beside the chat
  // Send some code and it moves to the left, Coe's answer stays on the right, and the chat list folds away to make room.
  const [cpOpen, setCpOpen] = useState(false), [cpSel, setCpSel] = useState(''), [cpChanges, setCpChanges] = useState(false), [cpNew, setCpNew] = useState(false), [checkKey, setCheckKey] = useState(0);
  const [cpFrac, setCpFrac] = useState(() => { try { const v = Number(localStorage.getItem('coe:cp-w')); return v >= 0.25 && v <= 0.65 ? v : 0.46; } catch { return 0.46; } });
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.innerWidth >= 700);
  const [mainW, setMainW] = useState(0);
  const mainRef = useRef<HTMLElement>(null), sideWas = useRef(false), sideNow = useRef(side), seenCoe = useRef('');
  sideNow.current = side;
  const cItems = useMemo(() => codeItems(conv.messages), [conv.messages]);
  useEffect(() => { const q = window.matchMedia('(min-width: 700px)'); const f = () => setWide(q.matches); f(); q.addEventListener?.('change', f); return () => q.removeEventListener?.('change', f); }, []);
  useEffect(() => {
    const el = mainRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setMainW(el.clientWidth)); ro.observe(el); setMainW(el.clientWidth); return () => ro.disconnect();
  }, []);
  const openCode = useCallback((id: string, o?: { auto?: boolean; changes?: boolean }) => {
    setCpSel(id); setCpChanges(!!o?.changes); setCpNew(false);
    if (o?.auto && window.innerWidth < 700) return;   // on a phone the answer stays in view; the code opens from its chip
    setCpOpen(true); setShelf(false); setHdMore(false); setEdOpen(false);
    if (sideNow.current) { if (window.innerWidth >= 900) sideWas.current = true; setSide(false); }
  }, []);
  const closeCode = useCallback(() => { setCpOpen(false); if (sideWas.current) { sideWas.current = false; if (window.innerWidth >= 900) setSide(true); } }, []);
  const selectCode = useCallback((id: string) => { setCpSel(id); const it = cItems.find((x) => x.id === id); setCpChanges(!!it && it.from === 'coe' && !!it.base); }, [cItems]);
  const sizeCode = useCallback((f: number | null) => { const v = f == null ? 0.46 : Math.min(0.65, Math.max(0.25, f)); setCpFrac(v); try { localStorage.setItem('coe:cp-w', String(v)); } catch { /* not saved */ } }, []);
  const composeAbout = useCallback((t: string) => { setText((x) => (x ? x.replace(/\s*$/, ' ') : '') + t); if (window.innerWidth < 700) setCpOpen(false); window.setTimeout(() => { const el = box.current; el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); }, 60); }, []);
  const checkCode = useCallback((code: string) => { try { sessionStorage.setItem('coe:check', JSON.stringify({ code, lang: 'auto', notes: '' })); } catch { /* the page opens empty */ } setCheckKey((k) => k + 1); setTool(true); }, []);
  // A different chat starts with the code put away.
  useEffect(() => { seenCoe.current = [...cItems].reverse().find((i) => i.from === 'coe')?.id ?? ''; closeCode(); setCpSel(''); setCpNew(false); }, [conv.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  // When Coe finishes an answer with code in it, the code beside the chat switches to that, with what changed marked.
  useEffect(() => {
    if (busy) return;
    const last = [...cItems].reverse().find((i) => i.from === 'coe'); if (!last || last.id === seenCoe.current) return;
    seenCoe.current = last.id;
    if (cpOpen) { setCpSel(last.id); setCpChanges(!!last.base); } else setCpNew(true);
  }, [busy, cItems]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Opening the Files window puts the code away, so the two never fight for room.
  useEffect(() => { if (shelf && cpOpen && window.innerWidth >= 700) closeCode(); }, [shelf]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // on a phone the code covers the screen: Back and Esc close it
    if (!cpOpen || wide) return;
    try { window.history.pushState({ coeCode: 1 }, ''); } catch { /* no history */ }
    const pop = () => setCpOpen(false);
    window.addEventListener('popstate', pop);
    return () => { window.removeEventListener('popstate', pop); try { if (window.history.state?.coeCode) window.history.back(); } catch { /* no history */ } };
  }, [cpOpen, wide]);
  const split = cpOpen && wide && cItems.length > 0;

  // ---------------------------------------------------------------- the editor: documents, code, web pages and tables, on the right (the chat list stays)
  const [edOpen, setEdOpen] = useState(false), [edId, setEdId] = useState<string | null>(null);
  const [edW, setEdW] = useState(() => { try { const v = Number(localStorage.getItem('coe:ed-w')); return v >= 360 && v <= 1100 ? v : 600; } catch { return 600; } });
  const docs = conv.docs ?? [];
  const [progOpen, setProgOpen] = useState(false);
  const prog = useMemo(() => stepInfo(conv.messages, busy), [conv.messages, busy]);
  const nOut = docs.length + (Object.keys(conv.files ?? {}).length ? 1 : 0) + madePictures(conv).length;   // what the panel on the right can show
  const pill = prog ? { label: prog.label, short: prog.short } : nOut ? { label: nOut === 1 ? '1 output' : `${nOut} outputs`, short: String(nOut) } : null;
  edOpenRef.current = edOpen; cpOpenRef.current = cpOpen; edIdRef.current = edId;
  const edOver = mainW > 0 ? mainW < 900 : !wide;               // too narrow to sit beside the chat: it covers the chat, with a big Back button
  edOverRef.current = edOver;
  const edShow = edOpen ? Math.max(360, Math.min(edW, (mainW || 1200) - 380)) : 0;
  const docSave = useRef<number | undefined>(undefined);
  const flushDocs = useCallback(() => { if (docSave.current === undefined) return; window.clearTimeout(docSave.current); docSave.current = undefined; const c = convRef.current; if (c.messages.length || c.docs?.length) void persistRef.current(c); }, []);
  const setDocs = useCallback((d: EDoc[], forId?: string) => {
    const c = convRef.current; if (forId && forId !== c.id) return;   // a save from a chat that was just left must not land in the next one
    const next: Conv = { ...c, docs: d, updated: Date.now(), ...(!c.messages.length && !c.named ? { title: d[0]?.title || 'New conversation' } : {}) };
    setConv(next);
    window.clearTimeout(docSave.current); docSave.current = window.setTimeout(flushDocs, 700);
  }, [setConv, flushDocs]);
  const setPerm = useCallback((p: Perm) => { const next: Conv = { ...convRef.current, perm: p }; setConv(next); window.clearTimeout(docSave.current); docSave.current = window.setTimeout(flushDocs, 300); }, [setConv, flushDocs]);
  const openEditor = useCallback((id?: string) => {
    const c = convRef.current, pick = (id && c.docs?.find((d) => d.id === id)?.id) || null;
    setEdId((cur) => pick ?? (cur && c.docs?.some((d) => d.id === cur) ? cur : c.docs?.[c.docs.length - 1]?.id ?? null));
    setEdOpen(true); setShelf(false); setHdMore(false);
    if (cpOpenRef.current) closeCode();
  }, [closeCode]);   // eslint-disable-line react-hooks/exhaustive-deps
  const closeEditor = useCallback(() => { flushDocs(); setEdOpen(false); window.setTimeout(() => box.current?.focus({ preventScroll: true }), 40); }, [flushDocs]);
  const sizeEditor = useCallback((w: number) => { const v = w <= 0 ? 600 : Math.max(360, Math.min(1100, Math.round(w))); setEdW(v); try { localStorage.setItem('coe:ed-w', String(v)); } catch { /* not saved */ } }, []);
  openEditorRef.current = openEditor;
  // A different chat starts with the editor put away; opening Files puts it away too, so the two never fight for room.
  useEffect(() => { setEdOpen(false); setEdId(null); setProgOpen(false); }, [conv.id]);
  useEffect(() => { if (shelf && edOpenRef.current) setEdOpen(false); }, [shelf]);
  useEffect(() => { const on = (e: Event) => { const id = (e as CustomEvent<{ id?: string }>).detail?.id; if (id) openEditor(id); }; window.addEventListener('coe:open-doc', on); return () => window.removeEventListener('coe:open-doc', on); }, [openEditor]);
  // If the document that is open is deleted (by you, or by Coe), the next one shows; with none left the editor goes away.
  useEffect(() => { if (edOpen && !docs.length) setEdOpen(false); }, [docs.length, edOpen]);
  useEffect(() => { if (edOpen && edId && !docs.some((d) => d.id === edId)) setEdId(docs[docs.length - 1]?.id ?? null); }, [docs, edOpen, edId]);
  const edSend = useCallback((t: string) => { askRef.current(t); if (edOverRef.current) setEdOpen(false); }, []);
  const edCompose = useCallback((t: string) => { if (edOverRef.current) setEdOpen(false); composeAbout(t); }, [composeAbout]);
  const doSync = useCallback(async () => { try { if (await cloudSync()) await refreshList(); } catch { /* offline: this device keeps its own copy */ } }, [refreshList]);

  useEffect(() => { void refreshStatus(settings); }, [me, settings.serverUrl, settings.code]);   // eslint-disable-line react-hooks/exhaustive-deps
  const plan = planInfo(settings);
  const cr = creditsNow(settings);
  const usedNow = cr ? cr.used : use.today;
  const perDay = limitNow(settings);
  const keyOn = modeOf(settings) === 'key';
  const planName = keyOn ? 'Own key' : plan.name;
  const conn = connection(settings);
  const model = modelByKey(conv.model);
  const left = Math.max(0, perDay - usedNow);
  // A live guess while a reply is being written (about four letters to a token); the exact count replaces it when the reply ends.
  const [settled, setSettled] = useState<{ id: string; n: number }>({ id: '', n: 0 });
  const lastMsg = conv.messages[conv.messages.length - 1], liveChars = busy ? (lastMsg?.text.length ?? 0) : 0;
  const streamed = busy ? Math.round(Math.max(0, liveChars - (settled.id === lastMsg?.id && liveChars >= settled.n ? settled.n : 0)) / 4) : 0;   // text already counted is not counted twice
  const livePct = perDay > 0 ? Math.min(100, Math.floor(((usedNow + streamed) / perDay) * 100)) : 0;
  const [usageOff, setUsageOff] = useState(false);
  useEffect(() => { if (livePct >= 100) setUsageOff(false); }, [livePct >= 100]);   // eslint-disable-line react-hooks/exhaustive-deps
  const names = useCallback((k: ModelKey) => modelByKey(k).name, []);
  const streaming = busy;
  const assistant = 'Coe';

  // ---------------------------------------------------------------- the same chat on two devices, live
  // The device that is writing a reply saves the chat-so-far to the account about every second and a half; a device that has the same chat open looks for it every two seconds.
  const [remoteLive, setRemoteLive] = useState(false);
  const seenLive = useRef(0), liveAt = useRef(0);
  useEffect(() => {
    if (!busy || !cloudOn || !session()) return;
    const t = window.setInterval(() => { const c = convRef.current; if (c.messages.length) void cloudLive(c).catch(() => {}); }, 1500);
    return () => window.clearInterval(t);
  }, [busy]);
  useEffect(() => {
    if (busy || !cloudOn || !session() || !conv.messages.length) { setRemoteLive(false); return; }
    let off = false; const id = conv.id;
    const t = window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await cloudPeek(id); if (!r || off || convRef.current.id !== id) return;
        const d = r.data, mine = convRef.current, fresh = !!d.live && d.live !== seenLive.current;
        if (fresh) { seenLive.current = d.live!; liveAt.current = Date.now(); }
        setRemoteLive(Date.now() - liveAt.current < 5000);
        if (!fresh && !(r.updated > mine.updated)) return;
        if (d.messages.length === mine.messages.length && d.messages[d.messages.length - 1]?.text === mine.messages[mine.messages.length - 1]?.text && d.title === mine.title) return;
        const keep = (m: Msg) => { const o = mine.messages.find((x) => x.id === m.id); return o ? { ...m, ...(o.images?.length ? { images: o.images } : {}), ...(o.attach?.length ? { attach: o.attach } : {}), ...(o.runs?.length ? { runs: o.runs } : {}) } : m; };
        const next: Conv = { ...mine, ...d, live: undefined, files: mine.files ?? d.files, docs: mine.docs ?? d.docs, perm: mine.perm ?? d.perm, messages: d.messages.map(keep) };
        setConv(next); stick.current = true; if (!d.live) await saveConv(next);
      } catch { /* the next look tries again */ }
    }, 2000);
    return () => { off = true; window.clearInterval(t); };
  }, [busy, conv.id, conv.messages.length > 0]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { unlockAudio(); }, []);   // Safari only plays sound after one tap on the page

  // Another tab or the settings window may change the settings.
  useEffect(() => {
    const on = () => setSettingsState(loadSettings());
    window.addEventListener('pmc:coe-settings', on); return () => window.removeEventListener('pmc:coe-settings', on);
  }, []);

  useEffect(() => { try { if (conv.messages.length) sessionStorage.setItem('pmc:coe:last', conv.id); else sessionStorage.removeItem('pmc:coe:last'); } catch { /* storage blocked */ } }, [conv.id, conv.messages.length]);

  // ---------------------------------------------------------------- scrolling
  const toBottom = useCallback((smooth = false) => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }, []);
  useEffect(() => { if (!conv.messages.length) { const el = scroller.current; if (el) el.scrollTop = 0; } else if (stick.current) toBottom(); }, [conv.messages, toBottom]);
  // While a reply is being made, keep following it even when a preview or picture grows without a new message arriving.
  useEffect(() => { if (!busy) return; const t = window.setInterval(() => { if (stick.current) toBottom(); }, 140); return () => window.clearInterval(t); }, [busy, toBottom]);
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
  const persist = useCallback(async (c: Conv) => { if (c.messages.length || c.docs?.length) { await saveConv(c); await refreshList(); if (cloudOn && session()) cloudPut(c).catch(() => say('Could not save to your account just now. It is kept on this device.')); } }, [refreshList, say]);
  persistRef.current = persist;

  // ---------------------------------------------------------------- asking
  /** Every picture in the chat, oldest first: what was attached, and what tools made. */
  const imagesOf = (c: Conv): Img[] => c.messages.flatMap((m) => [...(m.images ?? []), ...(m.runs ?? []).flatMap((r) => (r.out?.kind === 'image' ? [r.out.img] : []))]);

  // When Coe finishes a request that made two or more files, the Files window opens on the right (on a wide screen) so nothing gets lost.
  const madeAt = useRef(-1);
  useEffect(() => {
    if (busy) { madeAt.current = madeCount(convRef.current.messages, convRef.current.files); return; }
    const now = madeCount(convRef.current.messages, convRef.current.files);
    if (madeAt.current >= 0 && now - madeAt.current >= 2 && window.innerWidth >= 900) { setShelfTab(Object.keys(convRef.current.files ?? {}).length >= 2 ? 'project' : 'made'); setShelf(true); }
    madeAt.current = -1;
  }, [busy]);

  /** After the first reply Coe gives the chat a short name of its own, unless a name was already chosen. The check call is free. */
  const nameIt = useCallback(async (c: Conv) => {
    const s = loadSettings(); const first = c.messages.find((m) => m.role === 'user' && !m.hidden && m.text), reply = c.messages.find((m) => m.role === 'assistant' && m.text);
    if (!first || !reply || !connection(s).ok) return;
    try {
      const r = await askModel(s, { model: 'swift', check: true, maxTokens: 24, system: 'You name chats. Reply with only a title of 2 to 5 words. No quotes, no full stop. Use the language the person wrote in.', messages: [{ role: 'user', text: `Person: ${first.text.slice(0, 400)}\nCoe: ${wordsOf(reply.text).slice(0, 500)}\n\nTitle:` }] });
      const t = r.text.replace(/["'`*#]+/g, '').replace(/[.!]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!t || t.split(' ').length > 9) return;
      const cur = c.id === convRef.current.id ? convRef.current : await loadConv(c.id); if (!cur || cur.named || !cur.messages.length) return;
      const next = { ...cur, title: t, named: true }; if (c.id === convRef.current.id) setConv(next); await persist(next);
    } catch { /* the first words stay as the name */ }
  }, [persist, setConv]);

  const run = useCallback(async (base: Conv, opts: { free?: boolean; wrong?: string; work?: boolean } = {}) => {
    const s = loadSettings();
    const pn = planNow(s), pl = planInfo(s);
    const c0 = connection(s);
    if (!c0.ok) { openSetup(c0.why); return; }
    if (tooLong(base)) {   // a very long chat is squeezed into a summary first, so it stays quick
      setNote('This chat is getting long, so the older messages are being summarised…');
      const c2 = await compactConv(s, base).catch(() => null);
      if (c2) { base = c2; setConv(c2); await persist(c2); }
      setNote('');
    }
    const model: ModelKey = opts.work ? 'deep' : base.model;
    if (!opts.work && !canUse(pn, base.model)) { setUpgrade(`${modelByKey(base.model).name} needs the Pro plan.`); return; }
    if (opts.work && pn !== 'pro' && quotaLeft('work', s).left <= 0) { setUpgrade('Deep Work is part of Pro. Free includes one run a day, and today\'s is used.'); return; }
    if (!opts.free && modeOf(s) !== 'key' && !counted(s) && usage().today >= limitNow(s)) return;   // the one "out of tokens" line above the message box already says so

    const mine = base.id, active = () => convRef.current.id === mine;
    let work: Conv = base;
    // What the person typed in the editor, or answered on a card, while Coe was working is kept: the live chat is the truth for documents and permissions.
    const commit = (c: Conv, mine2 = false) => { if (!mine2 && active()) c = { ...c, docs: convRef.current.docs, perm: convRef.current.perm }; work = c; liveWork.current.set(mine, c); if (active()) setConv(c); };
    const here = () => (active() ? convRef.current : work);
    const phaseA = (p: Phase) => { if (active()) setPhase(p); };
    const noteA = (t: string) => { if (active()) setNote(t); };
    let killed = false;   // the person asked Coe to delete this very chat
    // What each call in this reply cost. If the reply goes wrong, all of it is given back at the end.
    const spent: Spent[] = []; let failWhy = '', lastHolder = '';
    let lastFail = null as { run: { tool: string; args: Record<string, unknown> }; why: string; gate: boolean } | null;
    const ops: ChatOps = {
      list: async () => (await loadIndex()).map((m) => ({ id: m.id, title: m.title, pinned: !!m.pinned, current: m.id === base.id })),
      rename: async (id, t) => { if (id === base.id) commit({ ...work, title: t.slice(0, 80), named: true }); else await chatBits.current.patch(id, { title: t.slice(0, 80), named: true }); },
      pin: async (id, on) => { if (id === base.id) commit({ ...work, pinned: on }); else await chatBits.current.patch(id, { pinned: on }); },
      remove: async (id) => { if (id === base.id) killed = true; else await chatBits.current.remove(id); },
      compact: async () => { const c2 = await compactConv(s, work).catch(() => null); if (!c2) return false; commit(c2); return true; },
    };
    const ctl = new AbortController(); aborts.current.set(mine, ctl); liveWork.current.set(mine, base); setRunIds((r) => [...r.filter((x) => x !== mine), mine]); setFavicon('busy'); stick.current = true;
    void persist(base);   // the chat is in the list from the first word, so you can leave it and come back
    const cap = opts.work ? STEPS.work : STEPS[pn];

    // One question to the model, and the tool it asks for, if any. Returns true when it should go round again with the tool's answer.
    const turn = async (step: number): Promise<boolean> => {
      phaseA('think');
      const { list: sent, trimmed } = context(work.messages, CONTEXT[pn]);
      noteA(trimmed ? 'This chat is long, so the oldest messages were left out of this reply.' : '');
      const holder: Msg = { id: uid(), role: 'assistant', text: '', model, ts: Date.now(), work: opts.work || undefined };
      lastHolder = holder.id;
      commit({ ...work, messages: [...work.messages, holder], updated: Date.now() });
      const patch = (p: Partial<Msg>) => commit({ ...work, messages: work.messages.map((m) => (m.id === holder.id ? { ...m, ...p } : m)) });
      const now = new Date();
      const system = [
        BASE_COE, SHOW_PROMPT, personaOf(loadPersona()).prompt && `Working style the person chose (${personaOf(loadPersona()).name}): ${personaOf(loadPersona()).prompt}`, voiceActive() && VOICE_PROMPT,
        toolsPrompt({ plan: pn, work: !!opts.work, web, files: work.files ?? {}, stepsLeft: cap - step, hasApps: !!APPS_ORIGIN, docs: here().docs ?? [], activeId: edOpenRef.current && active() ? edIdRef.current : null, perm: here().perm ?? {} }),
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
      const callId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);   // names this call, so the server can pay it back even though we stop listening early
      let frame = 0, latest = '', hit = false, wrote = false;
      const flush = () => { frame = 0; patch({ text: latest }); };
      try {
        const r = await stream(s, { model, system, messages: sent, maxTokens: opts.work ? MAX_WORK : MAX_REPLY[pn], signal: tctl.signal, redo: !!opts.free && step === 0, work: opts.work, step: step > 0, call: callId },
          (t) => { latest = t; if (!wrote) { wrote = true; phaseA('write'); } if (!hit && findTool(t)) { hit = true; tctl.abort(); } else if (!hit && !frame) frame = requestAnimationFrame(flush); });
        if (frame) cancelAnimationFrame(frame);
        const userStopped = ctl.signal.aborted;
        const found = findTool(r.text);
        let text = found ? r.text.slice(0, found.end) : r.text;
        patch({ text, stopped: (userStopped && r.stopped) || undefined, cut: r.cut || undefined, inTokens: r.inTokens, outTokens: r.outTokens });
        const todayBefore = usage().today;
        countReply(s, r.credits, () => (r.inTokens ?? Math.ceil(JSON.stringify(sent).length / 4) + 700) + (r.outTokens ?? Math.ceil(r.text.length / 4)), !r.credits && ((r.stopped && !r.text) || (!!opts.free && step === 0)));
        spent.push({ tokens: r.credits?.tokens ?? 0, receipt: r.credits?.receipt, call: callId, local: Math.max(0, usage().today - todayBefore) });
        setUse(usage()); setSettled({ id: holder.id, n: text.length });
        if (step === 0 && opts.work) bumpQuota('work');
        if (userStopped && !r.text) { commit({ ...work, messages: work.messages.filter((m) => m.id !== holder.id) }); return false; }
        if (userStopped) return false;
        if (!found) {
          // Honest about a tool that did not work: the reply must say so, and says it first if it did not.
          if (lastFail) { const said = honest(text, lastFail.run, lastFail.why); if (said !== text) { text = said; patch({ text }); } }
          // Code that was cut off halfway, or a reply that never came, did not do its job: its tokens come back.
          if (r.cut && (text.match(/```/g) ?? []).length % 2 === 1) failWhy = 'The code was cut off before it finished';
          else if (!text.trim() && !lastFail) { failWhy = 'Coe sent nothing back'; patch({ error: 'Coe did not write anything back. Try again.', errKind: 'server' }); }
          // A second look at its own answer before finishing: if it finds a mistake, it writes the answer again.
          const lastAsk = [...work.messages].reverse().find((m) => m.role === 'user' && !m.hidden)?.text ?? '';
          if (!r.cut && !lastFail && text.trim() && !voiceActive() && worthChecking(s.check, text, lastAsk, { work: opts.work, steps: step })) {
            phaseA('check');
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
        setRun({}); phaseA(phaseOfTool(call?.tool ?? 'unknown'));
        const res = call
          ? await execute(call, { settings: s, signal: ctl.signal, plan: pn, convId: base.id, runId: run0.id, files: () => work.files ?? {}, setFiles: (f: Files) => commit({ ...work, files: f }), images: () => imagesOf(work), docs: () => here().docs ?? [], setDocs: (d: EDoc[]) => commit({ ...work, docs: d, perm: here().perm }, true), attachments: () => work.messages.flatMap((m) => m.attach ?? []), perm: () => here().perm ?? {}, patch: setRun, say, chats: ops })
          : { status: 'error' as const, result: found.error ?? 'That tool block could not be read.', out: undefined, images: undefined };
        setRun({ t1: Date.now(), status: res.status, result: res.result, ...(res.shown ? { shown: res.shown } : {}), ...(res.out ? { out: res.out } : {}) });
        if (res.status === 'error' && !ctl.signal.aborted) lastFail = { run: { tool: run0.tool, args: run0.args }, why: res.shown ?? res.result, gate: !!res.gate };
        else if (res.status === 'ok') lastFail = null;
        if (res.out?.kind === 'doc' && res.out.act !== 'edit' && active() && (here().perm?.editor === 'always' || edOpenRef.current)) openEditorRef.current(res.out.id);   // allowed once and for all, or already open: it just shows
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
        if ((err.kind === 'network' || err.kind === 'server') && spent.length) failWhy = err.kind === 'network' ? 'The connection dropped before the reply finished' : 'The model stopped with an error';
        if (err.kind === 'credits' && modeOf(s) === 'server' && !counted(s)) { fillToday(limitNow(s)); setUse(usage()); }   // turned away for tokens: this device's count agrees
        if (err.kind === 'credits' || err.kind === 'plan' || err.kind === 'signin') void refreshStatus(s);
        return false;
      } finally { ctl.signal.removeEventListener('abort', link); }
    };

    try {
      for (let step = 0; ; step++) { if (!(await turn(step))) break; }
    } finally {
      // A reply that went wrong is paid back. A tool that failed because of a limit (Pro only, used up) is not "wrong", and a reply the person stopped is theirs.
      if (!failWhy && lastFail && !lastFail.gate) failWhy = `${couldNot(lastFail.run)}: ${lastFail.why}`.slice(0, 160);
      if (failWhy && !ctl.signal.aborted && !killed && modeOf(s) === 'server') {
        const back = await giveBack(s, spent, failWhy, work.title).catch(() => 0);
        if (back > 0) { work = { ...work, messages: work.messages.map((m) => (m.id === lastHolder ? { ...m, refund: back } : m)) }; sfx.done(); }
      }
      commit({ ...work, updated: Date.now() });
      aborts.current.delete(mine); liveWork.current.delete(mine); setRunIds((r) => r.filter((x) => x !== mine)); phaseA('idle'); sfx.done();
      const lastM = work.messages[work.messages.length - 1];
      setFavicon(lastM?.role === 'assistant' && lastM.text && !lastM.error && !lastM.stopped ? 'done' : 'idle');
      if (lastM?.role === 'assistant' && lastM.text && !lastM.error && !lastM.stopped) { noteReply(); if (active() && feedbackDue()) { feedbackShown(); setFb(true); } }
      if (killed) await chatBits.current.remove(base.id); else { await persist(work); if (!work.named && lastM?.role === 'assistant' && lastM.text && !lastM.error && !lastM.stopped) void nameRef.current(work); }
    }
  }, [persist, say, setConv, web]);

  const askRef = useRef<(t: string) => void>(() => {});
  // A checklist that is rewritten later in the same turn shows once, as it stands now. This only changes when a message with a checklist comes or goes.
  const planSig = conv.messages.map((m) => (m.role === 'assistant' ? (m.text.includes('```coe-plan') ? m.id : '') : m.hidden ? '' : '|')).filter(Boolean).join(',');
  const oldPlans = useMemo(() => { const o = new Set<string>(); let prev = ''; for (const t of planSig.split(',')) { if (t === '|') { prev = ''; continue; } if (t) { if (prev) o.add(prev); prev = t; } } return o; }, [planSig]);
  // The question cards: "Open the editor?" and "Open this app?" each have Yes, Always open in this chat, and Don't open. A click answers at once.
  const decide = useCallback((what: 'editor' | 'app', choice: 'yes' | 'always' | 'never', arg?: string) => {
    const pm: Perm = convRef.current.perm ?? {};
    if (what === 'editor') {
      if (choice === 'never') return;
      if (choice === 'always') setPerm({ ...pm, editor: 'always' });
      openEditor(arg); return;
    }
    if (choice === 'never') { askRef.current('Don’t open it. Carry on another way.'); return; }
    if (choice === 'always') { setPerm({ ...pm, app: 'always' }); askRef.current('Always open apps in this chat. Go ahead.'); return; }
    setPerm({ ...pm, ok: Array.from(new Set([...(pm.ok ?? []), arg ?? ''])).filter(Boolean) }); askRef.current('Yes, open it.');
  }, [setPerm, openEditor]);
  const richCtx = useMemo<RichCtx>(() => ({ plan: planNow(settings), files: conv.files ?? {}, convId: conv.id, ask: (t: string) => askRef.current(t), pics: imagesOf(conv), effects: settings.effects, oldPlans, docs: conv.docs, perm: conv.perm, edOpen, openDoc: (id: string) => openEditor(id), decide }), [settings, oldPlans, conv.files, conv.docs, conv.perm, edOpen, conv.id, conv.messages.length, status(), openEditor, decide]);   // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => abort.current?.abort(), []);

  const sendBody = useCallback((raw: string, extra?: { pics?: Img[]; atts?: Attach[]; work?: boolean; late?: boolean }) => {
    if (busy || reading) return;
    const body = raw.trim(); const pp = extra?.pics ?? [], aa = extra?.atts ?? [];
    if (!body && !pp.length && !aa.length) return;
    if (!connection(settings).ok) { openSetup(); return; }
    const c = convRef.current;
    const msg: Msg = { id: uid(), role: 'user', text: body, images: pp.length ? pp : undefined, attach: aa.length ? aa : undefined, ts: Date.now(), late: extra?.late || undefined };
    const cx = extractCode(body), title = c.messages.length ? c.title : titleFrom((cx ? cx.rest || `${LANG_NAME[cx.blocks[0].lang] ?? 'Code'} code` : body) || (aa[0]?.name ?? pp[0]?.name ?? 'Picture'));
    const next: Conv = { ...c, title, messages: [...c.messages, msg], updated: Date.now() };
    const sentCode = codeItems([msg])[0]; if (sentCode) openCode(sentCode.id, { auto: true });
    setConv(next); void run(next, { work: !!extra?.work });
  }, [busy, reading, settings, run, setConv, openCode]);   // eslint-disable-line react-hooks/exhaustive-deps

  askRef.current = sendBody;

  // Messages sent while Coe is still replying wait their turn here. None is ever dropped: either it goes next, or it goes now and the one before it is still answered.
  const [queue, setQueue] = useState<Queued[]>([]);
  const send = useCallback(() => {
    if (reading) return;
    if (!text.trim() && !pics.length && !atts.length) return;
    const w = work, t = text, pp = pics, aa = atts;
    setText(''); setPics([]); setAtts([]); setWork(false); sfx.send();
    if (!busy) { sendBody(t, { pics: pp, atts: aa, work: w }); return; }
    const item: Queued = { cid: convRef.current.id, id: uid(), text: t.trim(), pics: pp, atts: aa, work: w };
    if (settings.whileBusy === 'interrupt') { setQueue((q) => [{ ...item, late: true }, ...q]); abort.current?.abort(); }
    else setQueue((q) => [...q, item]);
  }, [busy, reading, text, pics, atts, work, sendBody, settings.whileBusy]);
  useEffect(() => () => setFavicon('idle'), []);
  askRef.current = (t: string) => { if (busy || reading) setQueue((q) => [...q, { cid: convRef.current.id, id: uid(), text: t, pics: [], atts: [], work: false }]); else sendBody(t); };
  const sendQueuedNow = useCallback((id: string) => { setQueue((q) => { const it = q.find((x) => x.id === id); return it ? [{ ...it, late: true }, ...q.filter((x) => x.id !== id)] : q; }); abort.current?.abort(); }, []);
  const dropQueued = useCallback((id: string) => setQueue((q) => q.filter((x) => x.id !== id)), []);
  useEffect(() => {
    if (busy || reading || !queue.length) return;
    const at = queue.findIndex((x) => !x.cid || x.cid === convRef.current.id); if (at < 0) return;   // waiting for its own chat
    const last = convRef.current.messages[convRef.current.messages.length - 1];
    if (last?.role === 'assistant' && last.error && !queue[at].late) return;    // a failed reply: wait for the person rather than failing again and again
    const next = queue[at], rest = queue.filter((_, k) => k !== at); setQueue(rest);
    sendBody(next.text, { pics: next.pics, atts: next.atts, work: next.work, late: next.late });
  }, [busy, reading, queue, sendBody, conv.id]);

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
  useEffect(() => { applyDisplay(settings); }, [settings.scale, settings.motion, settings.compact, settings.easy, settings.contrast]);   // eslint-disable-line react-hooks/exhaustive-deps
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
    const c = convRef.current;
    if (!c.messages.length && !c.docs?.length) { box.current?.focus(); return; }
    flushDocs(); setConv(blank(c.model)); setText(''); setPics([]); setNote(''); stick.current = true;
    if (window.innerWidth < 900) setSide(false);
  }, [setConv, flushDocs]);

  // The Coe extension can send a question and its answer into a new chat, and its Settings button opens the Chrome tab.
  useEffect(() => {
    if (location.hash === '#chrome') { setTab('ext'); setPanel('settings'); history.replaceState(null, '', location.pathname + location.search); }
    return onExtHandoff((t) => { fresh(); setText(t); setPanel(null); window.setTimeout(() => box.current?.focus(), 60); });
  }, [fresh]);
  useEffect(() => onExtRefunds((items) => addSidebarRefunds(items)), []);
  // Chats made in the Coe Mini sidebar are added to the list here, each one once, and updated if it grows.
  useEffect(() => onExtChats((items) => {
    void (async () => {
      for (const c of items as ExtChat[]) {
        const id = 'x' + String(c.id).slice(0, 40), t = Number(c.t) || Date.now(), have = await loadConv(id);
        if (have && have.updated >= t) continue;
        const rows = c.msgs.filter((m) => m && typeof m.t === 'string' && m.t.trim()).slice(-60);
        if (!rows.length) continue;
        const msgs: Msg[] = rows.map((m, i) => ({ id: id + '-' + i, role: m.r === 'u' ? 'user' : 'assistant', text: String(m.t).slice(0, 6000), ts: Number(m.at) || t - (rows.length - i) * 1000 }));
        await persistRef.current({ id, title: ('Mini: ' + String(c.title || 'Chat')).slice(0, 60), created: have?.created ?? msgs[0].ts, updated: t, model: 'core', named: true, pinned: have?.pinned, messages: msgs });
      }
    })();
  }), []);
  // About you answers changed in the sidebar: the newer copy wins.
  useEffect(() => onExtProfile((me) => {
    const cur = loadSettings(), at = Number(me.at) || 0; if (at <= (cur.profileAt || 0)) return;
    const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
    const one = <T extends string>(v: unknown, ok: readonly T[], fall: T): T => (ok.includes(String(v) as T) ? (String(v) as T) : fall);
    setSettings({ ...cur, name: str(me.name, 30), ageBand: one(me.ageBand, ['', 'under11', '11-13', '14-16', '17-18', '19-24', '25+'] as const, ''), role: one(me.role, ['', 'student', 'teacher', 'parent', 'working', 'other'] as const, ''), yearOrJob: str(me.yearOrJob, 60), subjects: str(me.subjects, 100), length: one(me.length, ['short', 'balanced', 'detailed'] as const, cur.length), easy: !!me.easy, profileAt: at });
  }), [setSettings]);
  // The very first time: a few short, optional questions about you.
  const [meet, setMeet] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(MET)) return; if (loadSettings().name) { localStorage.setItem(MET, '1'); return; } } catch { return; }
    const t = window.setTimeout(() => setMeet(true), 1400); return () => window.clearTimeout(t);
  }, []);   // what the Chrome sidebar gave back is listed in Settings > Usage > Refunds

  const open = useCallback(async (id: string) => {
    if (id === convRef.current.id) { if (window.innerWidth < 900) setSide(false); return; }
    flushDocs();
    const c = liveWork.current.get(id) ?? await loadConv(id); if (!c) { await refreshList(); return; }
    setConv(c); setText(''); setPics([]); setNote(''); stick.current = true; setPhase(aborts.current.has(id) ? 'write' : 'idle');
    if (window.innerWidth < 900) setSide(false);
    window.setTimeout(() => toBottom(), 30);
  }, [refreshList, setConv, toBottom, flushDocs]);

  const remove = useCallback(async (id: string) => {
    aborts.current.get(id)?.abort();
    if (id === convRef.current.id) { setConv(blank(convRef.current.model)); }
    await deleteConv(id); await refreshList(); setMenu(null);
    if (cloudOn && session()) cloudRemove(id).catch(() => say('Could not remove it from your account just now.'));
  }, [refreshList, setConv, say]);

  const rename = useCallback(async (id: string, v: string | null) => {
    setRenaming(null); setTitling(false);
    const t = (v ?? '').trim(); if (!t) return;
    const c = id === convRef.current.id ? convRef.current : await loadConv(id); if (!c) return;
    const next = { ...c, title: t.slice(0, 80), named: true };
    if (id === convRef.current.id) setConv(next);
    await persist(next);
  }, [persist, setConv]);

  /** A new chat that starts as a copy of this one up to the chosen message. The old chat is left alone. */
  const branchFrom = useCallback(async (msgId: string) => {
    const c = convRef.current, i = c.messages.findIndex((m) => m.id === msgId); if (i < 0) return;
    const copy: Conv = { ...c, id: uid(), title: `${c.title} (branch)`.slice(0, 80), named: true, created: Date.now(), updated: Date.now(), pinned: false, live: undefined, messages: c.messages.slice(0, i + 1).map((m) => ({ ...m })) };
    await persist(copy); await open(copy.id); say('Branched. You are in the new chat. The first one is unchanged.');
  }, [persist, open, say]);
  const mark = useCallback((msgId: string) => {
    const c = convRef.current; const next = { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, marked: !m.marked } : m)) }; setConv(next); void persist(next);
  }, [persist, setConv]);
  // Find in this chat
  const [find, setFind] = useState<{ q: string; i: number; marks: boolean } | null>(null);
  const hits = useMemo(() => {
    if (!find) return [] as string[];
    const q = find.q.trim().toLowerCase();
    return conv.messages.filter((m) => !m.hidden && !m.compact && (find.marks ? m.marked : true) && (!q ? find.marks : m.text.toLowerCase().includes(q))).map((m) => m.id);
  }, [find, conv.messages]);
  const findGo = useCallback((i: number) => {
    if (!hits.length) return; const k = (i + hits.length) % hits.length; setFind((f) => (f ? { ...f, i: k } : f));
    const el = document.querySelector(`[data-mid="${hits[k]}"]`); if (el) { stick.current = false; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); window.setTimeout(() => el.classList.remove('flash'), 1400); }
  }, [hits]);

  const pin = useCallback(async (id: string) => {
    const c = id === convRef.current.id ? convRef.current : await loadConv(id); if (!c) return;
    const next = { ...c, pinned: !c.pinned };
    if (id === convRef.current.id) setConv(next);
    await persist(next); setMenu(null);
  }, [persist, setConv]);

  nameRef.current = nameIt;
  chatBits.current = {
    patch: async (id, p) => { const c = id === convRef.current.id ? convRef.current : await loadConv(id); if (!c) return; const next = { ...c, ...p }; if (id === convRef.current.id) setConv(next); await persist(next); },
    remove,
  };
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
    const bs = (e.target as Element).closest<HTMLElement>('[data-beside]');
    if (bs) { const mid = bs.closest<HTMLElement>('[data-mid]')?.dataset.mid; const code = (bs.closest('.cx-code')?.querySelector('code')?.textContent ?? '').replace(/\s+$/, ''); const it = cItems.find((x) => x.msgId === mid && x.code === code); if (it) openCode(it.id, { changes: !!it.base }); else say('That bit is too short to open on the side.'); return; }
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
    { id: 'find', group: 'Chat', title: 'Find in this chat', hint: 'search the messages, or your bookmarks', run: () => setFind({ q: '', i: 0, marks: false }) },
    { id: 'compact', group: 'Chat', title: 'Summarise the older messages', hint: 'keeps a long chat quick', run: () => { void (async () => { const c2 = await compactConv(loadSettings(), convRef.current).catch(() => null); if (!c2) { say('There is not enough chat to summarise yet.'); return; } setConv(c2); await persist(c2); say('The older messages are now a short summary.'); })(); } },
    { id: 'files', group: 'Tools', title: 'Files', run: () => { setShelfTab(undefined); setShelf(true); } },
    { id: 'prog', group: 'Chat', title: 'Show progress and outputs', hint: 'steps, documents, what was used', run: () => setProgOpen(true) },
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
    { id: 'set', group: 'Account', title: 'Settings', run: () => { setTab('account'); setPanel('settings'); } },
  ];
  const exportEvery = async () => downloadText('coe-ai-conversations.json', JSON.stringify(await exportAll()), 'application/json');
  const importFile = async (f: File) => {
    try { const n = await importAll(JSON.parse(await f.text())); await refreshList(); say(n ? `Opened ${n} ${n === 1 ? 'conversation' : 'conversations'}.` : 'No conversations in that file.'); }
    catch { say('That file could not be read.'); }
  };
  const wipe = async () => { aborts.current.forEach((c) => c.abort()); await deleteAll(); if (cloudOn && session()) cloudRemoveAll().catch(() => say('Could not clear your account just now.')); await refreshList(); setConv(blank(convRef.current.model)); say('All conversations deleted.'); };

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
  const dk = useMemo(() => dockTarget(conv.messages), [conv.messages]);
  const turnFrom = (i: number) => { let j = i; while (j > 0 && !(conv.messages[j - 1].role === 'user' && !conv.messages[j - 1].hidden)) j--; return j; };
  const groups = useMemo(() => {
    const g: number[][] = [];
    conv.messages.forEach((x, i) => {
      if (x.hidden) return;
      const prev = g[g.length - 1], pm = prev ? conv.messages[prev[0]] : null;
      if (x.role === 'assistant' && !x.compact && pm && pm.role === 'assistant' && !pm.compact) prev.push(i); else g.push([i]);
    });
    return g;
  }, [conv.messages]);
  const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user' && !m.hidden && !m.compact)?.id;
  const full = !keyOn && left <= 0;
  const lastVis = [...conv.messages].reverse().find((x) => !x.hidden);
  const lastErr = lastVis && lastVis.role === 'assistant' && lastVis.error && !busy ? lastVis : null;
  const outBox = (full && !busy) || lastErr?.errKind === 'credits';   // "out of tokens" is said once, in one place
  const hasInput = text.trim().length > 0 || pics.length > 0 || atts.length > 0;
  const canSend = !reading && !full && hasInput;
  const wq = quotaLeft('work', settings), proNow = planNow(settings) === 'pro';
  const madeRef = useRef(0);
  const nFiles = useMemo(() => { const f = filesOf(conv.messages); return f.sent.length + f.made.length + Object.keys(conv.files ?? {}).filter((k) => !k.endsWith('/.keep')).length; }, [conv.messages, conv.files]);
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
    { id: 'folder', icon: 'folder', title: 'Files', hint: 'Sent to Coe and sent back', run: () => setShelf((v) => !v), hide: !(proNow || hasFiles(conv.files)) },
  ];

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
        <div className="cx-brand"><CoeWordmark height={30} spin /></div>
        <div className="cx-side-top">
          <button type="button" className="btn gold cx-new" onClick={fresh}><UiIcon name="plus" size={18} />New chat</button>
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
                      {m.pinned && <UiIcon name="pin" size={13} className="cx-pinned" />}<span>{m.title}</span>{runIds.includes(m.id) && <i className="cx-run" role="img" aria-label="Writing a reply" />}</button>}
                  <button type="button" className="cx-more" aria-label={`Options for ${m.title}`} aria-haspopup="menu" aria-expanded={menu?.id === m.id}
                    onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.id === m.id ? null : { id: m.id, x: Math.min(r.right, window.innerWidth - 8), y: r.bottom + 4 }); }}><UiIcon name="more" size={18} /></button>
                </div>
              ))}
            </section>
          ))}
        </nav>
        <div className="cx-side-foot">
          <div className="cx-me-row">
            <button type="button" className="cx-me" title={me ? 'Your account' : 'Sign in'} onClick={() => { if (me) { setTab('account'); setPanel('settings'); } else setAcct(true); }}>
              <span className="cx-av d" aria-hidden>{me ? me.slice(0, 1).toUpperCase() : <UiIcon name="user" size={18} />}</span>
              <span className="cx-me-t"><b className="d">{me ? me.split('@')[0] : 'Sign in'}</b><small className="tx">{keyOn ? 'No daily limit' : `${fmtTok(Math.max(0, perDay - usedNow))} left today`}</small></span>
            </button>
            <button type="button" className="cx-fb" title="Settings" aria-label="Settings" onClick={() => { setTab('look'); setPanel('settings'); }}><UiIcon name="gear" size={20} /></button>
          </div>
          {!keyOn && <div className={`cx-meter ${toneOf(usedNow, perDay)}`} role="img" aria-label={`${fmtTok(usedNow)} of ${fmtTok(perDay)} tokens used today`}><i style={{ width: `${Math.min(100, (usedNow / perDay) * 100)}%` }} /></div>}
        </div>
      </aside>

      {/* ------------------------------------------------ chat */}
      <section ref={mainRef} className={`cx-main${shelf ? " ws-open" : ""}${split ? " cp" : ""}${edOpen && !edOver ? " ed-open" : ""}`} style={split && mainW ? ({ '--cpw': `${Math.round(cpFrac * mainW)}px` } as React.CSSProperties) : edOpen && !edOver ? ({ '--edw': `${edShow}px` } as React.CSSProperties) : undefined} aria-label="Chat">
        <header className="cx-isl" aria-label="Chat controls">
          <button type="button" className="isl-b" title="Chats" aria-label={side ? 'Hide the list' : 'Show the list'} aria-pressed={side} onClick={() => { sideWas.current = false; setSide((s) => !s); }}><UiIcon name="panel" size={22} /></button>
          {titling && conv.messages.length
            ? <Rename className="cx-title-in" value={conv.title} onDone={(v) => rename(conv.id, v)} />
            : <button type="button" className="isl-title d" disabled={!conv.messages.length} onClick={() => setTitling(true)} title={conv.messages.length ? 'Rename' : undefined}>{conv.messages.length ? conv.title : 'New chat'}</button>}
          {cItems.length > 0 && <button type="button" className={`isl-b${cpOpen ? ' on' : ''}`} aria-label={cpOpen ? 'Hide the code' : 'Show the code'} title={cpOpen ? 'Hide the code' : 'Show the code'} aria-pressed={cpOpen} onClick={() => { if (cpOpen) { closeCode(); return; } const it = cItems.find((x) => x.id === cpSel) ?? cItems[cItems.length - 1]; openCode(it.id, { changes: it.from === 'coe' && !!it.base }); }}><UiIcon name="code" size={20} />{cpNew && <i className="isl-n dot" aria-label="New code from Coe" />}</button>}
          {pill && <button type="button" className={`isl-step${progOpen ? ' on' : ''}${busy ? ' live' : ''}`} aria-pressed={progOpen} aria-label={`${pill.label}. Show progress`} title="Progress" onClick={() => setProgOpen((v) => !v)}><UiIcon name="list" size={16} /><span className="s-long">{pill.label}</span><span className="s-short">{pill.short}</span></button>}
          <button type="button" className={`isl-b${shelf ? ' on' : ''}`} aria-label="Files" title="Files" aria-pressed={shelf} onClick={() => { setShelfTab(undefined); setShelf((v) => !v); }}><UiIcon name="folder" size={20} />{nFiles > 0 && <i className="isl-n">{nFiles}</i>}</button>
          <div className="hd-more">
            <button type="button" className="isl-b" title="More" aria-label="More" aria-haspopup="menu" aria-expanded={hdMore} onClick={() => setHdMore((o) => !o)}><UiIcon name="more" size={22} /></button>
            {hdMore && (
              <ul className="cx-pop hd-pop" role="menu" aria-label="More">
                {([
                  ['Study', 'study', () => setStudyOpen(true), false],
                  ['Code check', 'code', () => setTool(true), false],
                  ['Made in Coe', 'layers', () => setGalOpen(true), !made],
                  ['Talk out loud', 'wave', () => setVoiceOpen(true), false],
                  ['Save this chat as a file', 'download', exportOne, empty],
                  ...(cloudOn ? [['Share this chat as a link', 'share', shareThis, empty]] : []),
                  ['Commands', 'command', () => setPalOpen(true), false],
                  ['Settings', 'gear', () => { setTab('look'); setPanel('settings'); }, false],
                  ...(isInstalled() ? [] : [['Install Coe as an app', 'install', () => { void installCoe().then(say); }, false]]),
                ] as [string, Parameters<typeof UiIcon>[0]['name'], () => void, boolean][]).map(([t, ic, run, off]) => (
                  <li key={t} role="none"><button type="button" role="menuitem" className="cx-opt hd-pop-i" disabled={off} onClick={() => { setHdMore(false); run(); }}><span className="d cx-opt-n"><UiIcon name={ic} size={17} />{t}</span></button></li>
                ))}
                {owner && <li role="none"><button type="button" role="menuitem" className={`cx-opt hd-pop-i${conn.ok ? '' : ' danger'}`} onClick={() => { setHdMore(false); setTab('account'); setPanel('settings'); }}><span className="d cx-opt-n"><UiIcon name="shield" size={17} />{conn.ok ? 'Server ready' : 'Server not set up'}</span></button></li>}
              </ul>
            )}
          </div>
        </header>

        {!keyOn && livePct >= 90 && livePct < 100 && !usageOff && (
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
        {find && (
          <div className="cx-find" role="search">
            <input autoFocus className="cx-in" value={find.q} placeholder={find.marks ? 'Bookmarked answers' : 'Find in this chat'} aria-label="Find in this chat" onChange={(e) => setFind({ q: e.target.value, i: 0, marks: find.marks })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findGo(find.i + (e.shiftKey ? -1 : 1)); } else if (e.key === 'Escape') setFind(null); }} />
            <span className="tx cx-small">{hits.length ? `${Math.min(find.i + 1, hits.length)} of ${hits.length}` : (find.q || find.marks) ? 'None' : ''}</span>
            <button type="button" className="cx-act" aria-label="Previous" onClick={() => findGo(find.i - 1)} disabled={!hits.length}><UiIcon name="up" size={14} /></button>
            <button type="button" className="cx-act" aria-label="Next" onClick={() => findGo(find.i + 1)} disabled={!hits.length}><UiIcon name="down" size={14} /></button>
            <button type="button" className="cx-act" aria-pressed={find.marks} onClick={() => setFind({ q: find.q, i: 0, marks: !find.marks })}><UiIcon name="bookmark" size={14} />Bookmarks</button>
            <button type="button" className="cx-closeb" onClick={() => setFind(null)}><UiIcon name="close" size={16} /><span>Close</span></button>
          </div>
        )}
        <div className="cx-scroll" ref={scroller} onScroll={onScroll} onClick={onMessages}>
          {empty && <Halftone className="ht-tr" />}
          {empty ? (
            <div className="cx-empty home" key={conv.id}>
              <CoeStar size={220} className="home-star" spin />
              <h2 className="home-h d">{greeting(settings.name, new Date().getHours(), hello)}</h2>
              <p className="home-lead tx">Ask anything, add a picture, or start from a block.</p>
              {!conn.ok && owner && (
                <div className="cx-connect">
                  <p className="tx"><b className="d">Not set up yet.</b> {conn.why}</p>
                  <button type="button" className="btn gold" onClick={() => { setTab('account'); setPanel('settings'); }}>Set up Coe</button>
                </div>
              )}
              <div className="hbs" role="group" aria-label="Start from a block">
                {STARTERS.slice(0, 4).map((s, i) => (
                  <button key={s.title} type="button" className={`hb t${i % 4}`} title={s.hint} style={{ animationDelay: `${i * 40}ms` }}
                    onClick={() => { if (s.tool === 'code') { setTool(true); return; } setText(s.text ?? ''); box.current?.focus(); if (s.pic) (canCamera() ? setCapture('camera') : fileIn.current?.click()); }}>
                    <span className="hb-art" aria-hidden><UiIcon name={s.icon} size={34} /></span>
                    <b className="d">{s.title}</b><small className="tx">{s.hint}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <RichContext.Provider value={richCtx}><ol className="cx-msgs" key={conv.id}>
              {groups.map((idxs) => {
                // One question gets one answer: every step Coe took for it (its text, its screen, its files) is shown together under one name.
                const i = idxs[idxs.length - 1], m = conv.messages[i], first = conv.messages[idxs[0]], parts = idxs.map((k) => conv.messages[k]);
                const agg: Msg = parts.length > 1 ? { ...m, text: parts.map((x) => x.text).filter(Boolean).join('\n\n'), outTokens: parts.reduce((n, x) => n + (x.outTokens ?? 0), 0) } : m;
                if (m.compact) return <li key={m.id} data-mid={m.id} className="cx-msg compactmsg"><details className="cx-fold"><summary className="d"><UiIcon name="down" size={14} />Earlier messages, summarised</summary><div className="cx-fold-in"><p className="tx" style={{ whiteSpace: 'pre-wrap' }}>{m.text.replace(/^\[[^\]]*\]\n?/, '')}</p></div></details></li>;
                const lastOne = i === conv.messages.length - 1 || conv.messages.slice(i + 1).every((x) => x.hidden);
                const live = streaming && lastOne && m.role === 'assistant';
                const nextVis = conv.messages.slice(i + 1).find((x) => !x.hidden), turnEnd = m.role === 'assistant' && (!nextVis || nextVis.role === 'user');
                const rr = m.runs?.[0], liveRun = live && rr?.status === 'running' ? describeRun(rr) : null;
                return (
                  <li key={first.id} data-mid={first.id} className={`cx-msg ${m.role}${Date.now() - m.ts < 2500 ? ' new' : ''}`}>
                    {m.role === 'assistant' && (m.marked || m.work) && <div className="cx-who d">{m.marked ? <UiIcon name="bookmark" size={14} /> : null}{m.work ? <i>Deep Work</i> : null}</div>}
                    {parts.map((pt) => (
                    <div key={pt.id} data-mid={pt.id} className="cx-part">
                    {pt.images?.length ? (
                      <div className="cx-pics">{pt.images.map((im, k) => (
                        <button type="button" key={k} className="cx-pic" onClick={() => setBig(im)} aria-label={`Open ${im.name}`}><img src={dataUrl(im)} alt={im.name} /></button>
                      ))}</div>
                    ) : null}
                    {pt.attach?.length ? <div className="cx-atts">{pt.attach.map((a, k) => <AttCard key={k} a={a} onOpen={() => setPeek(a)} />)}</div> : null}
                    {pt.role === 'user'
                      ? (() => { const x = codeIn(pt), t = x ? x.rest : pt.text; return <>
                        {t && <Clamp limit={260}><p className="cx-says tx">{t}</p></Clamp>}
                        {x && <div className="cx-cchips">{x.items.map((it) => <button key={it.id} type="button" className={`cx-cchip${cpOpen && cpSel === it.id ? ' on' : ''}`} title="Open this code on the side" onClick={() => openCode(it.id)}><UiIcon name="code" size={16} /><b className="d">{it.file ?? LANG_NAME[it.lang] ?? 'Code'}</b><span className="tx">{it.code.split('\n').length} lines</span></button>)}</div>}
                      </>; })()
                      : (pt.text ? <Clamp live={live && pt === m}><Rich text={pt.text} msg={pt} live={live && pt === m} /></Clamp>: null)}
                    {pt.error && !(lastOne && pt === m) && !(outBox && pt.errKind === 'credits') && <ErrorBox small own={keyOn} kind={pt.errKind} text={pt.error} canRetry={false} onAct={errAct} />}
                    </div>
                    ))}
                    {m.role === 'assistant' && m.checked && !live && <p className={`cx-checked tx ${m.checked}`}><UiIcon name={m.checked === 'ok' ? 'shield' : 'wand'} size={14} />{m.checked === 'ok' ? 'Double-checked' : <>Fixed before sending: {m.fix}</>}</p>}
                    {m.role === 'assistant' && !m.error && <Dock messages={conv.messages} convId={conv.id} live={live} from={idxs[0]} to={i} />}
                    {live && !m.error && <Generating since={conv.messages[idxs[0]]?.ts} phase={shownPhase} label={liveRun?.now} detail={liveRun?.detail} empty={!parts.some((x) => x.text)} />}
                    {m.role === 'assistant' && turnEnd && !m.error && !(dk && dk.end >= turnFrom(i) && dk.end <= i) && <Activity steps={turnSteps(conv.messages, i)} live={live} phaseNote={PHASES[shownPhase === 'rest' ? 'idle' : shownPhase].label} />}
                    {m.role === 'assistant' && turnEnd && parts.some((x) => x.refund) && <p className="cx-refund tx"><UiIcon name="refresh" size={14} /><span>{fmtTok(parts.reduce((n, x) => n + (x.refund ?? 0), 0))} tokens given back.</span><button type="button" className="cx-link" onClick={() => { setTab('usage'); setPanel('settings'); }}>See refunds</button></p>}
                    {m.role === 'assistant' && (m.stopped || m.cut) && !m.error && <p className="cx-flag tx">{m.stopped ? 'You stopped this reply.' : 'This reply reached its length limit. Say “continue” to carry on.'}</p>}
                    {!live && (
                      <div className="cx-acts">
                        {m.role === 'assistant' && agg.text && <button type="button" className="cx-act" title="Copy" aria-label="Copy" onClick={() => copyMsg(agg)}><UiIcon name="copy" size={14} />Copy</button>}
                        {m.role === 'assistant' && agg.text && !m.error && <button type="button" className="cx-act" title={aloud === m.id ? 'Stop reading' : 'Read aloud'} aria-label={aloud === m.id ? 'Stop reading' : 'Read aloud'} aria-pressed={aloud === m.id} onClick={() => readAloud(agg)}><UiIcon name={aloud === m.id ? 'stop' : 'volume'} size={14} />{aloud === m.id ? 'Stop' : 'Read aloud'}</button>}
                        {m.role === 'assistant' && !m.error && lastOne && !busy && worthRedo(agg.text) && (() => { const left = redoLeft(planNow(settings)); return <button type="button" className="cx-act" onClick={redo} aria-label="Try again" title={left > 0 ? `Not right? Try again, free. ${left} free ${left === 1 ? 'try' : 'tries'} left today.` : 'Try again. Today\'s free tries are used, so this counts like a normal message.'}><UiIcon name="refresh" size={14} /></button>; })()}
                        {m.role === 'assistant' && agg.text && !m.error && (
                          <details className="cx-more" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) { const d = e.currentTarget as HTMLDetailsElement; const off = (ev: Event) => { if (!d.contains(ev.target as Node)) { d.open = false; document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); } }}>
                            <summary className="cx-act" title="More" aria-label="More for this answer"><UiIcon name="menu" size={14} />More</summary>
                            <div className="cx-more-menu" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>
                              {lastOne && !busy && <button type="button" className="cx-act" onClick={retry} title="Again"><UiIcon name="refresh" size={14} /><span className="lb">Again</span></button>}
                              <button type="button" className="cx-act" onClick={() => mark(m.id)}><UiIcon name="bookmark" size={14} />{m.marked ? 'Remove bookmark' : 'Bookmark'}</button>
                              <button type="button" className="cx-act" onClick={() => void branchFrom(m.id)}><UiIcon name="branch" size={14} />Branch from here</button>
                              <button type="button" className="cx-act" onClick={() => setInfoFor(m.id)}><UiIcon name="info" size={14} />Info</button>
                            </div>
                          </details>
                        )}
                        {m.role === 'user' && m.id === lastUser && !busy && <button type="button" className="cx-act" title="Edit" aria-label="Edit" onClick={() => edit(m.id)}><UiIcon name="edit" size={14} />Edit</button>}
                        {m.role === 'assistant' && agg.outTokens ? <span className="cx-tok tx">{agg.outTokens} tokens</span> : null}
                      </div>
                    )}
                    {m.role === 'assistant' && lastOne && !live && !busy && !m.error && (() => {
                      const f = followupsOf(agg.text);
                      return f.length ? <div className="cx-fu" role="group" aria-label="Ask next">{f.map((x) => <button key={x} type="button" className="fu" onClick={() => sendBody(x)}><span>{x}</span><UiIcon name="arrow" size={15} /></button>)}</div> : null;
                    })()}
                  </li>
                );
              })}
            </ol></RichContext.Provider>
          )}
        </div>

        <footer className="cx-compose">
          {away && <button type="button" className="cx-jump btn small" onClick={() => { stick.current = true; toBottom(true); setAway(false); }}><UiIcon name="down" size={15} />Latest</button>}
          {remoteLive && !busy && <p className="cx-flag tx" role="status">Coe is replying to this chat on another device. It shows here as it is written.</p>}
          {note && <p className="cx-flag tx">{note}</p>}
          {outBox
            ? <ErrorBox small own={keyOn} kind="credits" text={lastErr?.errKind === 'credits' ? lastErr.error ?? '' : ''} canRetry={false} onAct={errAct} />
            : lastErr ? <ErrorBox small own={keyOn} kind={lastErr.errKind} text={lastErr.error ?? ''} canRetry onAct={errAct} /> : null}
          {fb && !busy && !empty && <Feedback onRate={(r) => void sendFeedback(loadSettings(), r)} onMessage={async (r, t) => (await sendFeedback(loadSettings(), undefined, `[${r}] ${t}`, 'problem')).emailed} onLater={() => { feedbackLater(); setFb(false); }} onDone={() => setFb(false)} />}
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
                <span key={i} className="cx-chipic"><img src={dataUrl(p)} alt={p.name} role="button" tabIndex={0} title="Look closer" onClick={() => setBig(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBig(p); } }} />
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPics((x) => x.filter((_, k) => k !== i))}><UiIcon name="close" size={12} /></button></span>
              ))}</div>
            )}
            {(atts.length > 0 || reading) && (
              <div className="cx-chips">
                {atts.map((a, i) => <AttCard key={i} a={a} onOpen={() => setPeek(a)} onRemove={() => setAtts((x) => x.filter((_, k) => k !== i))} />)}
                {reading && <span className="cx-att tx"><CoeStar size={18} mode="read" /><b>{reading.endsWith('…') ? reading : `Reading ${reading}`}</b></span>}
              </div>
            )}
            {slash.length > 0 && (
              <ul className="cx-slash" role="listbox" aria-label="Commands">
                {slash.map((c, i) => <li key={c.cmd} role="option" aria-selected={i === slashAt}><button type="button" className={i === slashAt ? 'on' : ''} onMouseMove={() => setSlashAt(i)} onPointerDown={(e) => { e.preventDefault(); useSlash(c); }}><b className="d">/{c.cmd}</b><span className="tx">{c.title}</span></button></li>)}
              </ul>
            )}
            {mathOpen && <MathPad onInsert={(t) => { insertText(t); setMathOpen(false); }} onClose={() => { setMathOpen(false); box.current?.focus(); }} />}
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
                    <li role="presentation" className="cx-pop-h d">How Coe works</li>
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
              {persona !== 'coe' && (
              <div className="cx-modes" role="group" aria-label="Switched on">
                {persona !== 'coe' && <button type="button" className="cx-mode" aria-label="Go back to the usual style" onClick={() => pickPersona('coe')}><UiIcon name="graduate" size={14} /><span className="d">{personaOf(persona).name}</span><UiIcon name="close" size={12} /></button>}
              </div>
            )}
              <span className="cx-grow" />
              <Select className="cx-model" small block={false} align="right" label="Model" value={conv.model}
                options={COE_MODELS.map((m) => ({ value: m.key, label: m.name, hint: m.blurb, badge: canUse(planNow(settings), m.key) ? m.tag : 'Pro' }))}
                onChange={(k) => pickModel(k as ModelKey)} />

              <button type="button" className={`tb${dict === 'rec' ? ' rec' : ''}`} aria-label={dict === 'rec' ? 'Stop dictating' : 'Dictate with your voice'} aria-pressed={dict === 'rec'} title={dict === 'rec' ? 'Stop' : dict === 'work' ? 'Reading…' : 'Dictate: speak and it types'} disabled={dict === 'work'} onClick={() => void toggleDict()}><UiIcon name={dict === 'rec' ? 'stop' : 'mic'} size={20} /></button>
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
            <Suspense fallback={<p className="tx" role="status">Opening Code check…</p>}><Check key={checkKey} settings={settings} onUsed={() => setUse(usage())} onSettings={() => { setTool(false); openSetup(); }} onUpgrade={setUpgrade} say={say} /></Suspense>
            <div className="cd-foot"><button type="button" className="btn gold" onClick={() => setTool(false)}><UiIcon name="left" size={18} />Back to chat</button></div>
          </div>
        )}
        {cpOpen && cItems.length > 0 && <CodePane items={cItems} sel={cpSel} changes={cpChanges} narrow={!wide} frac={cpFrac} onSel={selectCode} onChanges={setCpChanges} onClose={closeCode} onSize={sizeCode} onCompose={composeAbout} onAsk={(t) => askRef.current(t)} onCheck={checkCode} say={say} />}
        {progOpen && <Progress info={prog} conv={conv} busy={busy} onClose={() => { setProgOpen(false); }} onDoc={(id) => { setProgOpen(false); openEditor(id); }} onFiles={() => { setShelfTab('project'); setShelf(true); }} onZoom={(im) => setBig(im)} onGallery={() => setGalOpen(true)} />}
        {edOpen && (
          <Suspense fallback={<aside className={`cx-ed${edOver ? ' over' : ''}`} style={edOver ? undefined : { width: edShow }} aria-label="Editor"><div className="ed-load" role="status"><CoeStar size={46} live mode="code" /><span className="ed-dots" aria-hidden><i /><i /><i /></span><b className="d">Opening the editor</b></div></aside>}>
            <Editor key={conv.id} docs={docs} activeId={edId} over={edOver} width={edShow} onDocs={(d) => setDocs(d, conv.id)} onActive={setEdId} onClose={closeEditor} onSize={sizeEditor} send={edSend} compose={edCompose} toast={say} />
          </Suspense>
        )}
        {shelf && <Workspace files={conv.files ?? {}} messages={conv.messages} tab={shelfTab} convTitle={conv.title} onChange={(f) => { const next = { ...convRef.current, files: f }; setConv(next); void persist(next); }} onClose={() => setShelf(false)} say={say} plan={planNow(settings)} />}
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
      {meet && !panel && !acct && !upgrade && <MeetCoe s={settings} save={(p) => setSettings({ ...loadSettings(), ...p })} onClose={() => setMeet(false)} />}
      {panel === 'settings' && <SettingsPanel owner={owner} settings={settings} set={setSettings} tab={tab} setTab={setTab} convCount={list.length} used={usedNow} limit={perDay} onSignIn={() => setAcct(true)} onAccountChange={(inn) => { setMe(inn ? session()?.email ?? null : null); if (inn) { say('Signed in.'); void doSync(); } else void refreshList(); }} onExport={exportEvery} onImport={importFile} onDeleteAll={wipe} onClose={() => setPanel(null)} />}
      {peek && <AttPeek a={peek} onClose={() => setPeek(null)} />}
      {big && <Modal title={big.name} onClose={() => setBig(null)} wide><img className="cx-big" src={dataUrl(big)} alt={big.name} /></Modal>}
    </div>
  );
}

