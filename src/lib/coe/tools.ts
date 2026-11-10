/**
 * What Coe can do besides talk. A reply can end with one block:
 *
 *   ```coe-tool
 *   {"tool":"search","q":"..."}
 *   ```
 *
 * The page runs it, shows the result under the reply, tells Coe what came of it, and Coe carries on.
 * This works with any model, because it is only text. Tools that change something outside Coe (a Google file, a GitHub repository)
 * wait for the person to press a button.
 */
import type { Attach, Img, Perm, ToolOut, ToolRun } from '@/coe/store';
import { serverPost } from './billing';
import { lookupPlaces } from './places';
import { bumpQuota, countOther, quotaLeft } from './account';
import { COST_IMAGE, COST_SEARCH, QUOTAS, type PlanKey, type QuotaKey } from './models';
import type { CoeSettings } from './settings';
import { memory, remember } from './links';
import { runJs } from './sandbox';
import { KINDS, STARTER_WEB, docText, findDoc, makeDoc, replaceInDoc, toDocHtml, wordsInDoc, type EDoc, type EKind } from './editors';
import { guessLang, normLang } from './codesplit';
import { shootHtml } from './shot';
import * as ws from './workspace';
import { APPS_URL, appBySlug, catalogPrompt, describe, frameFor, nearApps, openFrame, type AppFile, type DoMsg } from './pmc';

export type Call = Record<string, unknown> & { tool: string };
export interface Found { start: number; end: number; call: Call | null; error?: string }

const OPEN = /```coe-tool[ \t]*\r?\n/;
/** The first complete tool block in a reply, if there is one. */
export function findTool(text: string): Found | null {
  const m = OPEN.exec(text); if (!m) return null;
  const from = m.index + m[0].length;
  const close = text.indexOf('```', from); if (close < 0) return null;
  const body = text.slice(from, close).trim();
  let end = close + 3; if (text[end] === '\r') end++; if (text[end] === '\n') end++;
  try {
    const j = JSON.parse(body);
    if (!j || typeof j !== 'object' || typeof j.tool !== 'string') return { start: m.index, end, call: null, error: 'The block must be JSON with a "tool" name.' };
    return { start: m.index, end, call: j as Call };
  } catch (e) { return { start: m.index, end, call: null, error: 'The block was not valid JSON (' + (e as Error).message.slice(0, 80) + '). Check quotes and line breaks inside strings.' }; }
}

// ---------------------------------------------------------------- what exists
export interface Def { name: string; pro?: boolean; confirm?: boolean; quota?: QuotaKey }
export const TOOLS: Def[] = [
  { name: 'js' }, { name: 'maths' }, { name: 'remember' }, { name: 'search', quota: 'search' }, { name: 'image', quota: 'image' }, { name: 'place' }, { name: 'pmc_app', quota: 'app' },
  { name: 'chat' }, { name: 'workspace', pro: true }, { name: 'editor' }, { name: 'read' }, { name: 'screenshot' },
];
export const defOf = (n: string) => TOOLS.find((t) => t.name === n);
/** Steps one request may take before Coe must wrap up. */
export const STEPS = { free: 4, pro: 10, work: 24 };


export interface Ctx {
  settings: CoeSettings; signal: AbortSignal; plan: PlanKey; convId: string; runId: string;
  files: () => ws.Files; setFiles: (f: ws.Files) => void;
  images: () => Img[];                    // pictures in the chat, newest last: what the person attached, and what was made
  docs: () => EDoc[];                     // what is open in the editor
  setDocs: (d: EDoc[]) => void;
  attachments: () => Attach[];            // files the person attached, with all the words that were read
  perm: () => Perm;                       // what the person allowed Coe to open in this chat
  patch: (p: Partial<ToolRun>) => void;
  say: (t: string) => void;
  chats?: ChatOps;
  /** A temporary chat: nothing is added to the person's notes. */
  temp?: boolean;
}
/** What Coe may do to the chats in the side list, but only when the person asks. */
export interface ChatOps {
  list: () => Promise<{ id: string; title: string; pinned: boolean; current: boolean }[]>;
  rename: (id: string, title: string) => Promise<void>;
  pin: (id: string, on: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Squeeze the older messages of this chat into a summary. */
  compact: () => Promise<boolean>;
}
export interface Done { status: 'ok' | 'error' | 'pending'; result: string; shown?: string; out?: ToolOut; images?: Img[]; /** It did not work because of a limit (Pro only, or used up for today), not because something went wrong. Nothing is refunded for those. */ gate?: boolean }

const fail = (result: string): Done => ({ status: 'error', result });
const pro = (what: string): Done => ({ gate: true, status: 'error', result: `${what} is part of Pro, and this person is on Free. Tell them so in one short sentence and offer what you can do without it. Do not try again.`, shown: `${what} is part of Pro.` });
const str = (v: unknown, n = 100000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const trim = (s: string, n = 7000) => (s.length > n ? s.slice(0, n) + `\n[... ${s.length - n} more characters cut]` : s);

// ---------------------------------------------------------------- running a tool
/** Said to the model after any tool that did not work, so its reply is honest: it did not happen, and here is why. */
export const FAILED_RULE = 'Nothing was made or done. Start your reply with one short sentence that says you could not do it and why, in words a child could follow. Say it once and do not repeat the reason. Never say it worked, and never say "here it is" or "here is your ...". Then give one thing the person can do next. Do not repeat this message.';

/** Runs a tool. When it does not work, the model is told so in a way it cannot misread, and the person sees only the plain reason. */
export async function execute(c: Call, x: Ctx): Promise<Done> {
  const r = await go(c, x);
  if (r.status !== 'error' || /^Stopped\.$/.test(r.result) || r.result.startsWith('FAILED')) return r;
  return { ...r, shown: r.shown ?? r.result, result: `FAILED. ${r.result} ${FAILED_RULE}` };
}

async function go(c: Call, x: Ctx): Promise<Done> {
  const d = defOf(c.tool);
  if (!d) return fail(`There is no tool called "${c.tool}". The tools are: ${TOOLS.map((t) => t.name).join(', ')}.`);
  if (d.pro && x.plan !== 'pro') return pro(`The ${c.tool} tool`);
  try {
    if (d.quota && !(await takeQuota(d.quota, x))) { const m = `${QUOTAS[d.quota].unit[0].toUpperCase() + QUOTAS[d.quota].unit.slice(1)} for today are used up on this plan. ${x.plan === 'free' ? 'Pro has far more.' : 'They come back at midnight (UTC).'}`; return { status: 'error', gate: true, result: m + ' Do not try that tool again today.', shown: m }; }
    switch (c.tool) {
      case 'js': return await toolJs(c, x);
      case 'maths': return await toolMaths(c);
      case 'remember': { const f = str(c.fact, 240).trim(); if (!f) return fail('Say what to remember.'); if (x.temp) return fail('This is a temporary chat, so nothing is kept in your notes.'); remember(f); return { status: 'ok', result: 'Saved. You will see it in your notes next time.', out: { kind: 'text', text: f } }; }
      case 'search': return await toolSearch(c, x);
      case 'image': return await toolImage(c, x);
      case 'place': return await toolPlace(c, x);
      case 'pmc_app': return await toolApp(c, x);
      case 'workspace': return await toolWorkspace(c, x);
      case 'editor': return await toolEditor(c, x);
      case 'read': return toolRead(c, x);
      case 'screenshot': return await toolShot(c, x);
      case 'chat': return await toolChat(c, x);
    }
  } catch (e) { if ((e as Error).name === 'AbortError') return fail('Stopped.'); const m = (e as Error).message || ''; if (/^(credits|plan|signin|check_cap)$/.test((e as { code?: string }).code ?? '')) return { ...fail(m || 'That is not available on this plan right now.'), gate: true }; return fail(!m || /cannot read|undefined|null|is not a function|not iterable/i.test(m) ? 'That did not work. Try again in a moment.' : m); }
  return fail('That tool did nothing.');
}

async function takeQuota(k: QuotaKey, x: Ctx): Promise<boolean> {
  const q = quotaLeft(k, x.settings);
  if (q.left <= 0) return false;
  return true;
}

async function toolJs(c: Call, x: Ctx): Promise<Done> {
  const code = str(c.code, 60000); if (!code.trim()) return fail('There is no code to run.');
  const r = await runJs(code, 10000, x.files());
  const bits = [r.log && `Printed:\n${trim(r.log, 6000)}`, r.value !== undefined && `Returned: ${trim(r.value, 3000)}`, r.error && `Error: ${r.error}`].filter(Boolean).join('\n\n') || 'It ran and printed nothing.';
  return { status: r.ok ? 'ok' : 'error', result: bits, out: { kind: 'text', text: bits } };
}

async function toolMaths(c: Call): Promise<Done> {
  try {
    const { runMaths } = await import('./maths');
    const r = await runMaths(c as never);
    return { status: 'ok', result: r.text + '\nThis came from an exact maths engine. Use it. Show the working in your own words, and give the answer in LaTeX.', out: { kind: 'maths', text: r.md } };
  } catch (e) { return { status: 'error', result: 'The maths engine could not do that: ' + ((e as Error).message || 'unknown error') + '. Check the expression (use * for times, ^ for powers) or work it out another way.', shown: 'Could not work that out: ' + ((e as Error).message || 'check the expression') }; }
}

async function toolSearch(c: Call, x: Ctx): Promise<Done> {
  const q = str(c.q, 600).trim(); if (!q) return fail('Say what to search for.');
  const r = await serverPost<{ text: string; sources: { title: string; url: string }[] }>(x.settings, '/search', { q });
  bumpQuota('search'); countOther(x.settings, COST_SEARCH);
  return { status: 'ok', result: `Web search for "${q}":\n${r.text}\n\nSources:\n${r.sources.map((s) => `- ${s.title}: ${s.url}`).join('\n') || '(none given)'}\n\nAnswer from this, name the sources you use, and say if the results do not settle the question.`, out: { kind: 'search', text: r.text, sources: r.sources } };
}

async function toolImage(c: Call, x: Ctx): Promise<Done> {
  const prompt = str(c.prompt, 4000).trim(); if (!prompt) return fail('Say what to draw.');
  const r = await serverPost<{ data: string; type: string }>(x.settings, '/image', { prompt });
  if (!r || !r.data || !r.type) return fail('The picture service sent nothing back. Try again, or describe it a little differently.');
  bumpQuota('image'); countOther(x.settings, COST_IMAGE);
  const ext = r.type.split('/')[1]?.replace('svg+xml', 'svg').replace('jpeg', 'jpg') || 'png';
  return { status: 'ok', result: 'The picture was made and is now shown to the person under your message. You cannot see it, so do not describe details you cannot know. Ask if they want changes.', out: { kind: 'image', img: { name: `picture.${ext}`, type: r.type, data: r.data } } };
}

/** Real places and businesses. Coe's server (Google Places) when it is switched on, otherwise OpenStreetMap. The page keeps what it finds so the map cards can show it. */
async function toolPlace(c: Call, x: Ctx): Promise<Done> {
  const q = str(c.query, 200).trim(); if (!q) return fail('Say which place or business to look up, with the town or country.');
  const near = Array.isArray(c.near) && c.near.length === 2 ? ([Number(c.near[0]), Number(c.near[1])] as [number, number]) : null;
  let rows: Awaited<ReturnType<typeof lookupPlaces>> = [];
  try { rows = await lookupPlaces(x.settings, q, { near, radius: Number(c.radius_km) || 15, limit: Number(c.limit) || 5, signal: x.signal }); }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; return fail('The place lookup could not be reached. Say what you know and mark any position as approximate, or ask the person for the address.'); }
  if (!rows.length) return { status: 'ok', result: `No place matched "${q}". Try a simpler name with the town or country, or ask the person where it is.`, out: { kind: 'text', text: `No place found for "${q}".` } };
  const src = rows[0].source === 'google' ? 'Google Places' : 'OpenStreetMap';
  const line = (p: (typeof rows)[number], i: number) => [
    `${i + 1}. ${p.name}`, p.address ?? '', `lat ${p.lat.toFixed(5)}, lng ${p.lng.toFixed(5)}`, p.kind && `type: ${p.kind}`,
    p.rating !== undefined && `rating: ${p.rating}/5${p.reviews ? ` from ${p.reviews} reviews` : ''}`, p.price && `price: ${p.price}`,
    p.phone && `phone: ${p.phone}`, p.website && `website: ${p.website}`, p.hours?.length ? `hours: ${p.hours.join('; ')}` : p.hoursText && `hours (may be out of date): ${p.hoursText}`,
    p.summary && `about: ${p.summary}`, p.closed && `status: ${p.closed.toLowerCase().replace(/_/g, ' ')}`,
  ].filter(Boolean).join(' | ');
  const text = rows.map(line).join('\n');
  return {
    status: 'ok',
    result: `Places for "${q}" (${src}):\n${text}\n\nUse these exact positions in a map block, with each place's name written exactly as above. A card with the photo, rating, phone, website and hours appears under the map by itself, using only what was found, so do NOT write ratings, phone numbers, websites, hours or photo links yourself. If the person asks for a detail that is not above, say you could not find it. Hours and ratings can change, so say they are worth checking.`,
    out: { kind: 'text', text: rows.map((p, i) => `${i + 1}. ${p.name}${p.rating !== undefined ? ` (${p.rating}/5)` : ''} (${p.lat.toFixed(3)}, ${p.lng.toFixed(3)})`).join('\n') },
    shown: `Looked up "${q}": ${rows.length} ${rows.length === 1 ? 'place' : 'places'}`,
  };
}

// ---------------------------------------------------------------- PMC Apps
async function toolApp(c: Call, x: Ctx): Promise<Done> {
  const slug = str(c.slug, 80); const app = appBySlug(slug);
  if (!app) return fail(`There is no app called "${slug}".${nearApps(slug).length ? ' Did you mean: ' + nearApps(slug).join(', ') + '?' : ''} Use a name from the list.`);
  const key = `${x.convId}:${slug}`;
  const reuse = openFrame(key);
  if (!reuse) {   // opening an app is asked first: the person gets Yes / Always open in this chat / Don't open
    const pm = x.perm();
    if (pm.app === 'never') return fail('The person chose not to let you open apps in this chat. Do not open any. Say so in one short sentence and either do the job another way or ask what they would like.');
    if (pm.app !== 'always' && !(pm.ok ?? []).includes(slug)) return { status: 'pending', result: `Waiting for the person to say whether you may open ${app.title}. Do not call it again until they answer.`, out: { kind: 'permit', what: 'app', slug, title: app.title } };
  }
  // A second step in an app that is already open does not count as another run.
  if (!reuse) {
    const mode = x.settings.serverUrl.trim();
    if (mode) { try { await serverPost(x.settings, '/app-use', { slug }); } catch (e) { return fail((e as Error).message); } }
    bumpQuota('app');
  }
  const frameKey = reuse ? key : x.runId;
  if (!reuse) x.patch({ status: 'running', note: 'open' });
  const f = reuse ?? (await frameFor(x.runId));
  if (!f) return fail('The app window could not be opened. PMC Apps may be unreachable from here.');
  if (!reuse) { /* the card registers itself under the run id; also under the app key so later steps find it */ }
  await Promise.race([f.ready, new Promise((r) => setTimeout(r, 15000))]);

  const files: AppFile[] = [];
  const off = f.onFile((file) => { files.push(file); x.patch({ out: { kind: 'files', items: files.filter((q) => q.size <= 8_000_000).map((q) => ({ name: q.name, type: q.mime, size: q.size, data: q.data })) } }); });
  const msg: DoMsg = {
    fill: c.fill && typeof c.fill === 'object' ? (c.fill as Record<string, unknown>) : undefined,
    click: arr<string>(c.click).map(String),
    call: c.call && typeof c.call === 'object' ? (c.call as Record<string, unknown>) : undefined,
    state: c.state && typeof c.state === 'object' ? (c.state as Record<string, unknown>) : undefined,
  };
  const want = c.use_images === true || c.use_images === 'attached' || c.use_images === 'generated' || c.use_images === 'all';
  if (want) {
    const pics = x.images(); const take = c.use_images === 'generated' ? pics.slice(-1) : c.use_images === 'attached' ? pics.slice(-4) : pics.slice(-4);
    msg.files = take.map((p, i) => ({ name: p.name || `picture-${i + 1}.png`, type: p.type, data: p.data }));
  }
  const reply = await f.act(msg);
  if (msg.click?.length) { // exporting can take a moment: wait for the file to arrive, then for it to go quiet
    let last = files.length; const t0 = Date.now();
    while (Date.now() - t0 < 9000) { await new Promise((r) => setTimeout(r, 600)); if (files.length !== last) { last = files.length; await new Promise((r) => setTimeout(r, 700)); if (files.length === last) break; } else if (files.length && Date.now() - t0 > 2500) break; }
  }
  off();
  void frameKey;
  const text = describe(reply, slug) + (files.length ? `\nFiles the app made (now in the chat for the person to download): ${files.map((q) => `${q.name} (${Math.round(q.size / 1024)} KB)`).join(', ')}.` : '');
  const images: Img[] | undefined = reply.image ? [{ name: `${slug}.png`, type: 'image/png', data: reply.image.split(',')[1] ?? '' }] : undefined;
  return { status: reply.ok ? 'ok' : 'error', result: text + (images ? '\n(A picture of what the app shows is attached so you can see it.)' : ''), images, out: files.length ? { kind: 'files', items: files.filter((q) => q.size <= 8_000_000).map((q) => ({ name: q.name, type: q.mime, size: q.size, data: q.data })) } : undefined };
}

// ---------------------------------------------------------------- the project folder
async function toolWorkspace(c: Call, x: Ctx): Promise<Done> {
  const a = str(c.action, 20), f = x.files();
  const note = (t: string, text = t): Done => ({ status: 'ok', result: t, out: { kind: 'text', text } });
  switch (a) {
    case 'write': { const next = ws.writeFile(f, c.path, c.content); x.setFiles(next); return note(`Wrote ${ws.cleanPath(c.path)} (${str(c.content).split('\n').length} lines). The project has ${Object.keys(next).length} files.`); }
    case 'edit': { const next = ws.editFile(f, c.path, c.find, c.replace); x.setFiles(next); return note(`Edited ${ws.cleanPath(c.path)}.`); }
    case 'delete': { x.setFiles(ws.removeFile(f, c.path)); return note(`Deleted ${ws.cleanPath(c.path)}.`); }
    case 'read': { const p = ws.cleanPath(c.path); if (!(p in f)) return fail(`There is no file ${p}. Files: ${Object.keys(f).join(', ') || 'none'}.`); return { status: 'ok', result: trim(f[p], 40000), out: { kind: 'text', text: `Read ${p}` } }; }
    case 'list': return note(ws.listing(f));
    case 'tree': return note(ws.tree(f));
    case 'mkdir': { const d = ws.cleanPath(c.path).replace(/\/+$/, ''); const next = ws.writeFile(f, d + '/.keep', ''); x.setFiles(next); return note(`Made the folder ${d}/.`); }
    case 'move': { const from = ws.cleanPath(c.path), to = ws.cleanPath(c.to); if (!(from in f)) return fail(`There is no file ${from}.`); const moved = ws.writeFile(f, to, f[from]); x.setFiles(ws.removeFile(moved, from)); return note(`Moved ${from} to ${to}.`); }
    case 'search': {
      const q = str(c.q, 200); if (!q) return fail('Say what to search for in "q".');
      let re: RegExp; try { re = new RegExp(c.regex === true ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } catch { return fail('That is not a valid pattern.'); }
      const hits: string[] = []; for (const [p, text] of Object.entries(f)) text.split('\n').forEach((l, i) => { if (hits.length < 80 && re.test(l)) hits.push(`${p}:${i + 1}: ${l.trim().slice(0, 160)}`); });
      return note(hits.join('\n') || 'No matches.', hits.length ? `${hits.length} matches` : 'No matches');
    }
    case 'run': {
      const p = c.path ? ws.cleanPath(c.path) : ''; const code = p ? f[p] : str(c.code);
      if (!code) return fail(p ? `There is no file ${p}.` : 'Give a path to a .js file, or code.');
      const r = await runJs(code, 15000, f);
      const bits = [r.log && `Printed:\n${trim(r.log, 6000)}`, r.value !== undefined && `Returned: ${trim(r.value, 3000)}`, r.error && `Error: ${r.error}`].filter(Boolean).join('\n\n') || 'It ran and printed nothing.';
      return { status: r.ok ? 'ok' : 'error', result: bits, out: { kind: 'text', text: bits } };
    }
    case 'preview': { const e = c.path ? ws.cleanPath(c.path) : ws.entryOf(f); if (!e || !(e in f)) return fail('There is no HTML file to preview. Write index.html first.'); return { status: 'ok', result: `${e} is now shown as a live preview under your message. You cannot see it. If you want to check it, run code that reads the file, or ask the person how it looks.`, out: { kind: 'text', text: `Preview of ${e}` } }; }
    default: return fail('workspace actions are: write, edit, read, list, tree, mkdir, move, search, delete, run, preview.');
  }
}


// ---------------------------------------------------------------- the editor: documents, code, web pages and tables beside the chat
const kindOf = (v: unknown): EKind => (['doc', 'code', 'web', 'data'] as const).find((k) => k === v) ?? 'doc';
const text40 = (s: string) => (s.length > 40000 ? s.slice(0, 40000) + `\n[... ${s.length - 40000} more characters cut]` : s);
const bodyOf = (d: EDoc) => (d.kind === 'doc' ? docText(d.text) : d.text);

async function toolEditor(c: Call, x: Ctx): Promise<Done> {
  const a = str(c.action, 20) || 'list', docs = x.docs();
  const ref = c.id ?? c.name ?? c.title;
  const note = (r: string, shown?: string, out?: ToolOut): Done => ({ status: 'ok', result: r, shown, out: out ?? { kind: 'text', text: shown ?? r.split('\n')[0] } });
  const need = (): EDoc | Done => { const d = findDoc(docs, c.id ?? c.name); return d ?? fail(docs.length ? `No document matches "${str(ref, 60)}". The documents are: ${docs.map((q) => `${q.id} "${q.title}"`).join(', ')}.` : 'There are no documents yet. Use create first.'); };
  const isDone = (v: EDoc | Done): v is Done => 'status' in v;
  const save = (d: EDoc, text: string, extra: Partial<EDoc> = {}) => x.setDocs(docs.map((q) => (q.id === d.id ? { ...q, text, prev: q.text, by: 'coe' as const, at: Date.now(), rev: q.rev + 1, ...extra } : q)));
  switch (a) {
    case 'list': return note(docs.length ? docs.map((d) => `${d.id} · ${KINDS[d.kind].name} · "${d.title}" · ${wordsInDoc(d)} words`).join('\n') : 'No documents yet.', `${docs.length} in the editor`);
    case 'create': {
      const kind = kindOf(c.kind); let text = str(c.content, 300000);
      if (kind === 'doc') text = await toDocHtml(text); else if (kind === 'web' && !text.trim()) text = STARTER_WEB;
      const lang = kind === 'code' ? normLang(str(c.lang, 30) || guessLang(text)) : kind === 'web' ? 'html' : undefined;
      const d = makeDoc(kind, docs, { title: str(c.title, 80), text, lang, by: 'coe' });
      x.setDocs([...docs, d]);
      return { status: 'ok', result: `Made the ${KINDS[kind].name.toLowerCase()} "${d.title}" (id ${d.id}, ${wordsInDoc(d)} words). It is in the editor, and a card under your message lets the person open it. Do not paste its content into the chat again. To change it later use editor with edit, append or rewrite and this id. Tell the person in one short sentence what you made.`, shown: `Made ${KINDS[kind].name.toLowerCase()} “${d.title}”`, out: { kind: 'doc', id: d.id, title: d.title, dk: kind, act: 'created' } };
    }
    case 'open': { const d = need(); if (isDone(d)) return d; return { status: 'ok', result: `"${d.title}" is shown to the person with an Open button.`, shown: `Opened “${d.title}”`, out: { kind: 'doc', id: d.id, title: d.title, dk: d.kind, act: 'open' } }; }
    case 'read': { const d = need(); if (isDone(d)) return d; return note(`"${d.title}" (${KINDS[d.kind].name}${d.lang ? ', ' + d.lang : ''}):\n${text40(bodyOf(d))}`, `Read “${d.title}”`); }
    case 'rename': { const d = need(); if (isDone(d)) return d; const t = str(c.to ?? c.new_title, 80).trim(); if (!t) return fail('Say the new name in "to".'); x.setDocs(docs.map((q) => (q.id === d.id ? { ...q, title: t } : q))); return note(`Renamed to "${t}".`, `Renamed to “${t}”`); }
    case 'delete': { const d = need(); if (isDone(d)) return d; x.setDocs(docs.filter((q) => q.id !== d.id)); return note(`Deleted "${d.title}".`, `Deleted “${d.title}”`); }
    case 'edit': {
      const d = need(); if (isDone(d)) return d;
      const find = str(c.find, 100000), rep = str(c.replace, 100000), every = c.all === true;
      if (!find) return fail('Give the exact text to change in "find".');
      if (d.kind === 'doc') { const r = replaceInDoc(d.text, find, (await toDocInline(rep)), every, true); if ('error' in r) return fail(r.error); save(d, r.html); return note(`Changed ${r.n} place${r.n === 1 ? '' : 's'} in "${d.title}".`, `Edited “${d.title}”`); }
      const n = d.text.split(find).length - 1;
      if (n === 0) return fail('That text is not in the file. Read it again and copy the lines exactly, with the same spaces.');
      if (n > 1 && !every) return fail(`That text appears ${n} times. Add more lines around it so it is in one place only, or set "all": true.`);
      save(d, every ? d.text.split(find).join(rep) : d.text.replace(find, () => rep)); return note(`Changed ${every ? n : 1} place${(every ? n : 1) === 1 ? '' : 's'} in "${d.title}".`, `Edited “${d.title}”`);
    }
    case 'append': {
      const d = need(); if (isDone(d)) return d; const add = str(c.content, 300000); if (!add.trim()) return fail('Give the text to add in "content".');
      save(d, d.kind === 'doc' ? d.text.replace(/<p><br><\/p>$/, '') + (await toDocHtml(add)) : d.text.replace(/\s*$/, '\n') + add.replace(/^\n+/, '') + (add.endsWith('\n') ? '' : '\n'));
      return note(`Added to "${d.title}".`, `Added to “${d.title}”`);
    }
    case 'rewrite': {
      const d = need(); if (isDone(d)) return d; const all = str(c.content, 300000); if (!all.trim()) return fail('Give the whole new text in "content".');
      save(d, d.kind === 'doc' ? await toDocHtml(all) : all, c.lang && d.kind === 'code' ? { lang: normLang(str(c.lang, 30)) } : {}); return note(`Rewrote "${d.title}".`, `Rewrote “${d.title}”`);
    }
    default: return fail('editor actions are: create, open, read, edit, append, rewrite, rename, delete, list.');
  }
}
/** Text Coe wants put inside a document, as safe inline HTML (no paragraph wrapper). */
async function toDocInline(t: string): Promise<string> { const h = await toDocHtml(t); const m = /^<p>([\s\S]*)<\/p>$/.exec(h.trim()); return m && !/<\/p>/.test(m[1]) ? m[1] : h; }

function toolRead(c: Call, x: Ctx): Done {
  const q = str(c.name ?? c.file ?? c.path, 200).trim().toLowerCase();
  const atts = x.attachments(), docs = x.docs(), files = x.files(), names = [...atts.map((a) => a.name), ...docs.map((d) => `${d.title} (editor)`), ...Object.keys(files)];
  if (!q) return { status: 'ok', result: names.length ? 'Files you can read: ' + names.join(', ') : 'There are no files to read yet.', out: { kind: 'text', text: `${names.length} files` } };
  const a = atts.find((f) => f.name.toLowerCase() === q) ?? atts.filter((f) => f.name.toLowerCase().includes(q))[0];
  if (a) return { status: 'ok', result: `${a.name} (${a.kind}${a.cut ? ', the text was cut short when it was read in' : ''}):\n${text40(a.text)}`, shown: `Read ${a.name}`, out: { kind: 'text', text: `Read ${a.name}` } };
  const d = findDoc(docs, q); if (d) return { status: 'ok', result: `"${d.title}" (${KINDS[d.kind].name}):\n${text40(bodyOf(d))}`, shown: `Read “${d.title}”`, out: { kind: 'text', text: `Read “${d.title}”` } };
  const p = ws.cleanPath(q); const pf = p in files ? p : Object.keys(files).find((k) => k.toLowerCase() === q);
  if (pf) return { status: 'ok', result: text40(files[pf]), shown: `Read ${pf}`, out: { kind: 'text', text: `Read ${pf}` } };
  return fail(`There is no file called "${str(c.name ?? c.file ?? c.path, 80)}". ${names.length ? 'Files: ' + names.join(', ') + '.' : 'No files have been attached or made yet.'}`);
}

async function toolShot(c: Call, x: Ctx): Promise<Done> {
  let html = '', label = 'the page';
  if (typeof c.html === 'string' && c.html.trim()) html = str(c.html, 400000);
  else if (c.id || c.name || (!c.path && x.docs().some((d) => d.kind === 'web'))) {
    const docs = x.docs(); const d = c.id || c.name ? findDoc(docs, c.id ?? c.name) : docs.filter((q) => q.kind === 'web').slice(-1)[0];
    if (!d) return fail('There is no web page in the editor with that id. Make one first with editor create, kind "web".');
    if (d.kind !== 'web') return fail(`"${d.title}" is not a web page. Screenshots work for web pages (kind "web").`);
    html = d.text; label = d.title;
  } else {
    const f = x.files(), e = c.path ? ws.cleanPath(c.path) : ws.entryOf(f);
    if (!e || !(e in f)) return fail('Give an editor "id", a project "path" to an HTML file, or "html".');
    html = ws.inlinePage(f, e); label = e;
  }
  const width = c.width === 'phone' ? 390 : c.width === 'tablet' ? 768 : Number(c.width) || 1024;
  try {
    const r = await shootHtml(html, { width });
    return { status: 'ok', result: `A screenshot of ${label} at ${r.width} pixels wide is attached. Look at it carefully (layout, spacing, colours, anything cut off or missing) and fix what is wrong. Pictures from other websites do not show up in screenshots, so a missing photo is not a fault.`, images: [r.img], out: { kind: 'image', img: r.img }, shown: `Took a screenshot of ${label}` };
  } catch (e) { return fail((e as Error).message || 'The screenshot could not be taken.'); }
}

// ---------------------------------------------------------------- the chat list
async function toolChat(c: Call, x: Ctx): Promise<Done> {
  const ops = x.chats; if (!ops) return fail('Chats cannot be changed here.');
  const a = str(c.action, 12), all = await ops.list();
  if (a === 'list') return { status: 'ok', result: all.slice(0, 60).map((m) => `${m.pinned ? '[pinned] ' : ''}${m.title}${m.current ? ' (this chat)' : ''}`).join('\n') || 'No chats.', out: { kind: 'text', text: `${all.length} chats` } };
  if (a === 'compact') { const ok = await ops.compact(); return ok ? { status: 'ok', result: 'The older messages are now a short summary. Carry on as before.', out: { kind: 'text', text: 'Summarised the older messages' } } : fail('There is not enough chat to summarise yet.'); }
  const q = str(c.chat, 120).trim().toLowerCase();
  let hit = all.find((m) => m.current);
  if (q && q !== 'this' && q !== 'current') {
    const m = all.filter((t) => t.title.toLowerCase().includes(q));
    if (m.length === 0) return fail(`No chat is called "${str(c.chat, 60)}". Ask the person which one they mean.`);
    if (m.length > 1) return fail('More than one chat matches: ' + m.slice(0, 6).map((t) => `"${t.title}"`).join(', ') + '. Ask the person which one.');
    hit = m[0];
  }
  if (!hit) return fail('That chat is not saved yet.');
  const note = hit.current ? 'this chat' : `"${hit.title}"`;
  if (a === 'rename') { const t = str(c.title, 80).replace(/\s+/g, ' ').trim(); if (!t) return fail('Say the new name in "title".'); await ops.rename(hit.id, t); return { status: 'ok', result: `Renamed ${note} to "${t}".`, out: { kind: 'text', text: `Renamed to "${t}"` } }; }
  if (a === 'pin' || a === 'unpin') { await ops.pin(hit.id, a === 'pin'); return { status: 'ok', result: `${a === 'pin' ? 'Pinned' : 'Unpinned'} ${note}.`, out: { kind: 'text', text: a === 'pin' ? 'Pinned' : 'Unpinned' } }; }
  if (a === 'delete') { await ops.remove(hit.id); return { status: 'ok', result: `Deleted ${note}. It cannot be brought back.${hit.current ? ' This chat is going away, so just say a short goodbye.' : ''}`, out: { kind: 'text', text: 'Deleted' } }; }
  return fail('chat actions are: list, rename, pin, unpin, delete, compact.');
}

// ---------------------------------------------------------------- what Coe is told
export interface PromptOpts { plan: PlanKey; work: boolean; web: boolean; files: ws.Files; stepsLeft: number; hasApps: boolean; docs?: EDoc[]; activeId?: string | null; perm?: Perm }

export function toolsPrompt(o: PromptOpts): string {
  const P = o.plan === 'pro';
  const t: string[] = [];
  const add = (s: string) => t.push(s);
  add('# Tools');
  if (o.stepsLeft <= 0) { add('You have used all the tool steps for this request. Do not use any more tools. Write the final answer now with what you have, and say what is left undone.'); return t.join('\n'); }
  add('You can use tools. To use one, end your message with exactly one block like this, then stop writing. Never write the result yourself and never write anything after the block:');
  add('```coe-tool\n{"tool":"js","code":"return 6*7"}\n```');
  add('The page runs it and sends you the result as the next message, then you carry on. You decide which tools to use and when; nobody switches them on for you. Use one when it makes the answer better or surer: search for anything that may have changed or that you are not certain of, maths or js for any number that matters, an app when one fits the job. Skip them when you already know the answer. Most questions need none. The block must be valid JSON (escape quotes and write line breaks inside strings as \\n). You have up to ' + o.stepsLeft + ' more steps for this request.');
  add('');
  add('Tools you can use now:');
  add('- js {"code": "..."}: runs JavaScript in a safe box (no network). Use console.log, and "return" a value. Use it for exact maths, data work, simulations, parsing, and to check your own answers. Do not guess a calculation you can run.');
  add('- maths {"op": "...", "expr": "..."}: an exact maths engine. ops: eval (numbers, units like "5 km to miles", matrices like "det([[1,2],[3,4]])", statistics like "std([2,4,4,5])"), solve ("expr": "x^2-5x+6=0", "variable": "x"; a system: "exprs": ["x+y=3","x-y=1"], "vars": ["x","y"]), simplify, expand, factor, diff ("variable", optional "at"), integrate (optional "from" and "to" for a definite integral), limit ("at"), sum ("from", "to"). Use * for times and ^ for powers. Prefer it to working out hard algebra, calculus or arithmetic in your head, then explain the method in steps and give the result in LaTeX.');
  add('- remember {"fact": "..."}: saves something the person asked you to remember about them or how they like things done. Only when they ask, or clearly state a lasting preference.');
  add('- search {"q": "..."}: searches the web (always available, and counts toward a small daily limit' + (P ? '' : ' on Free') + '). Use it for anything recent or that you are unsure of. Then cite your sources.');
  add('- place {"query": "...", "limit": 5, "near": [lat, lng]}: looks up real places and businesses on OpenStreetMap: exact position, address, brand, opening hours, website. Put the town or country in the query ("Greggs, Ipswich, UK"). Use it before you show anything on a map or give a location. Free, and needs no web switch.');
  add('- image {"prompt": "..."}: makes a picture. Write a full prompt: subject, style, colours, composition, mood, any words to show. It is shown to the person under your message.');
  if (o.hasApps) {
    add('- pmc_app {"slug": "...", "fill": {"Field label": "value"}, "click": ["Button text"], "call": {...}, "use_images": "attached"}: opens one of the PMC Apps in the chat and works it like a person would. Call it with just the slug first: the result lists the fields and buttons. Then fill and click. Anything the app exports comes into the chat as a file the person can download. "use_images" ("attached" or "generated") adds the pictures in the chat to an app that takes files. Keep using the same slug and the same window stays open. The apps:');
    add(catalogPrompt());
    add('  Pixel Art Maker also takes a drawing: {"tool":"pmc_app","slug":"pixel-art-maker","call":{"load":{"palette":{"a":"#a33a2b","b":"#171717"},"frames":[["..aa..","..aa..", "...one string of letters per row, \\".\\" is empty..."]],"fps":6}}}. More than one frame makes an animation. Then click "GIF" for the animated file, or "PNG" or "Sheet".');
  }
  add('- chat {"action": "rename"|"pin"|"unpin"|"delete"|"compact"|"list", "title": "new name", "chat": "part of another chat\'s name; leave out for this chat"}: changes the chats in the side list. If the person asks you to rename, pin, unpin or delete a chat, do it straight away. If they have not asked but it would clearly help (a chat whose name no longer fits, one they keep coming back to, one that was only a test), you may suggest it in one short sentence and ask, for example "Want me to rename this chat to X?". Then do nothing until they say yes. Never change, pin or delete a chat without one of those two things, and never delete unless they said delete or remove (or said yes to your question). If it is not clear which chat they mean, ask. Confirm what you did in one short sentence. compact squeezes the older messages of this chat into a summary; you may use it yourself when the chat has become very long, and you must say you did.');
  add('- editor {"action": "create"|"open"|"read"|"edit"|"append"|"rewrite"|"rename"|"delete"|"list", ...}: documents the person can open in the editor beside the chat, and that you and they can both change. kinds: "doc" (a Word-style document: essay, letter, report, story, notes, worksheet), "code" (any language; give "lang"), "web" (one complete HTML page with a live preview), "data" (a table as CSV or JSON). create {kind, title, content}: for a doc write the content as Markdown (headings, lists, **bold**, tables) or HTML. edit {id, find, replace, all?}: find must be exact and in one place (in a doc it must sit inside one piece of formatting). append {id, content}. rewrite {id, content}: the whole new text. read {id}. Use the editor whenever the person asks for something they will keep working on (an essay, a program, a page, a table), or says "in the editor". Short answers and small snippets stay in the chat. After you make or change something, say in one short sentence what you did and do NOT paste it into the chat again. To change something you already made, edit it, do not make a new copy. The person sees a card under your message and decides whether to open the editor; you never need to ask. The person cannot open the editor on their own: it opens only when you make or open a document. Everything you made stays in the Outputs list on the right of the chat, where they can open it again. So when they ask to change or look at something in the editor, open it (editor open) rather than saying you cannot.');
  add('- read {"name": "..."}: reads a file the person attached (all of it, even when it was long), a document in the editor, or a project file. Use it before you answer about a file you only half saw. Call it with no name to list what can be read.');
  add('- screenshot {"id": "...", "width": "phone"|"tablet"|1024}: takes a picture of a web page in the editor (or {"path": "index.html"} in the project folder, or {"html": "..."}) and shows it to you so you can check it. After you build or change a page, take a screenshot, look at it, and fix anything that is wrong (cut-off text, bad spacing, missing parts) before you say it is done. Pictures that load from other sites do not appear in screenshots.');
  if (P) {
    add('- workspace {"action": ...}: a project folder for this chat, so you can build real projects. write {path, content} (a path like src/app/main.js makes the folders itself), edit {path, find, replace} (find must appear exactly once), read {path}, list, tree, mkdir {path}, move {path, to}, search {q, regex?} (finds text in every file with line numbers), delete {path}, run {path or code} (runs JavaScript with readFile(path) and listFiles()), preview {path} (shows an HTML page live, with its own CSS and JS files). The person can download the folder as a zip or commit it to GitHub. Work in steps: write, run, read the result, fix, repeat. Check your work before you say it is done.');
    const names = Object.keys(o.files);
    add(names.length ? 'The project folder now holds:\n' + ws.listing(o.files) : 'The project folder is empty.');
  }
  const dl = o.docs ?? [];
  add(dl.length ? 'The editor holds:\n' + dl.map((d) => `- ${d.id}: ${KINDS[d.kind].name} "${d.title}" (${wordsInDoc(d)} words)${d.id === o.activeId ? ', open on screen now' : ''}`).join('\n') : 'The editor is empty.');
  const act = dl.find((d) => d.id === o.activeId);
  if (act) add(`The person has "${act.title}" open. Its text right now${act.kind === 'doc' ? ' (as plain text)' : ''}:\n${(act.kind === 'doc' ? docText(act.text) : act.text).slice(0, 6000)}${(act.kind === 'doc' ? docText(act.text) : act.text).length > 6000 ? '\n[... cut; use editor read for all of it]' : ''}`);
  add('');
  add('When the person asks for something that needs a tool you do not have (a project folder), say it is part of Pro, in one sentence.');
  add('');
  add('# When a tool does not work');
  add('A tool result that starts with FAILED means nothing was made or done. Say that first, in one plain sentence with the reason (for example "I couldn\'t make the picture. Pictures for today are used up on this plan."), then one thing the person can do. Do not say you made, drew, ran, found or saved anything unless a result says it worked, and never write "here is your picture" when there is no picture. If the reason is a limit (Pro only, used up for today), do not try that tool again: do the job another way if you can. If it was a slip you can fix (a typo in code, a wrong name), fix it and try once more. The tokens for a reply that goes wrong are given back automatically.');
  const pm = o.perm ?? {};
  if (o.hasApps) {
    add('Opening a PMC App: the page asks the person first, with the buttons Yes, Always open in this chat, and Don\'t open. You do not ask yourself: just call pmc_app. ' + (pm.app === 'always' ? 'They chose Always for this chat, so apps open straight away.' : pm.app === 'never' ? 'They chose Don\'t open for this chat, so do not open any app; do the job another way.' : 'If the call comes back waiting, stop and wait for their answer.'));
    add('Pixel art: if the person asks for pixel art (a sprite, pixel character, pixel icon, tile, retro game art, pixel animation), use the PMC Pixel Art Maker (pmc_app with slug pixel-art-maker) by default, unless they say to make it another way (SVG, code, a picture, another app).');
  }
  if (!o.work) {
    add('');
    add('When a job has three or more real parts (a project, a long task), write a plan first as a block: ```coe-plan\n{"steps":["...","..."],"done":0}\n```, then work through it, repeating the block with "done" raised as you finish steps. For anything smaller, just answer.');
  }
  if (o.work) {
    add('');
    add('# Deep Work');
    add('This is a big job, so work like an engineer. First write a plan as a block: ```coe-plan\n{"steps":["...","..."],"done":0}\n``` (then do the work, and repeat the block with "done" raised as you finish steps). Do the work one step at a time, using tools where they help. Check what you made: run code to verify numbers, re-read files, test pages, and fix mistakes before you answer. Do not stop to ask permission between steps unless you are blocked. When finished, give the result and say what you checked and what you are unsure of.');
  }
  return t.join('\n');
}

/** What Coe can show in a reply with no tool at all. */
export const SHOW_PROMPT = [
  '# Showing things',
  '- Maths: write ALL maths in LaTeX, never as plain text (not x^2 or 1/2). Inline is $...$, on its own line is $$...$$. Use \\frac, \\sqrt, \\int, \\sum, \\lim, matrices (\\begin{pmatrix}), and \\begin{aligned} for multi-line working. Units go in \\mathrm{}. Chemistry uses \\ce{}: $\\ce{2H2 + O2 -> 2H2O}$, $\\ce{SO4^2-}$. The person can click any equation to copy its LaTeX.',
  '- Graphs: a ```graph block draws a function plot the person can drag and zoom. One line per curve, in plain maths (sin, cos, tan, sqrt, abs, log, exp, pi): "y = sin(x)", "y = x^2/4 - 1", "r = 1 + cos(theta)" (polar), "x = 2" (vertical line). Optional lines: "title: ...", "x: -10..10", "y: -5..5", "points: (1, 2) A, (3, 4) B". Up to 8 curves. Use it whenever a picture of a function helps.',
  '- Quizzes: a ```quiz block holds JSON: {"title":"...","questions":[{"q":"... (LaTeX allowed)","options":["...","...","...","..."],"answer":1,"why":"one-line reason"}]}. answer is the number of the right option, counting from 0. It becomes a quiz the person can take, with a score.',
  '- Flash cards: a ```flashcards block holds JSON: {"title":"...","cards":[{"front":"...","back":"..."}]}.',
  '- Charts: a ```chart block holds JSON: {"type":"bar|line|area|pie|donut|scatter","title":"...","labels":["A","B"],"series":[{"name":"...","data":[1,2]}],"xLabel":"...","yLabel":"..."}. Scatter data is [[x,y],...]. Optional "colors":["#2F5D8A",...] sets the series colours (any hex colours that suit the subject). Use it for numbers the person gave you or you looked up, never invented ones.',
  '- Slides: a ```slides block holds JSON: {"title":"...","slides":[{"layout":"title","title":"...","subtitle":"..."},{"layout":"bullets","title":"...","bullets":["...","..."],"notes":"what to say"},{"layout":"two","title":"...","left":{"heading":"...","bullets":["..."]},"right":{"heading":"...","bullets":["..."]}},{"layout":"big","title":"72%","subtitle":"what the number means"},{"layout":"quote","text":"...","by":"..."}]}. Layouts: title, bullets, two, big, quote. 5 to 12 slides, 3 to 5 short bullets each (LaTeX allowed). It becomes a deck the person can present full screen and save as PowerPoint. Use it for any presentation or slide request.',
  '- Data tables: a ```data block holds JSON {"title":"...","columns":["A","B"],"rows":[["x",1],["y",2]]} (or CSV). The person can sort, filter, total and save it as CSV. Use it for lists of records and results with more than a handful of rows; use a Markdown table for small ones.',
  '- Mind maps: a ```mindmap block is an indented outline. The first line is the middle of the map, each line under it is a branch, and a deeper indent is a smaller branch. Keep every label to 1 to 5 words, 4 to 8 main branches, 3 levels at most. For any request for a mind map use this block, not mermaid.',
  '- Diagrams: a ```mermaid block (flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, timeline...) is drawn as a picture. Style it however suits the subject (classDef, style lines, themes); it does not need to look like Coe. Start it with a title (--- then title: Short title then --- as the first lines).',
  '- Pictures you draw: a complete <svg> in a ```svg block is shown as a picture the person can save. Put <title>Short title</title> inside it, because that becomes the title shown above it. Leave out any frame or border around the picture: it sits straight on the page.',
  '- Pages, games and small apps: a complete, single-file page in a ```html block runs live in a preview next to the chat. Make it polished, in whatever look fits what was asked (it does not need to match Coe): responsive, good type, real colours, working interactions, canvas or CSS animation where it helps. It may load libraries from cdnjs.cloudflare.com or cdn.jsdelivr.net (for example three.js, d3, chart.js, tone.js). It has no access to the person\'s data.',
  '- Sound and music: build it as a page in a ```html block with the Web Audio API (oscillators, noise, samples, sequencers, synths, effects) and a clear Play button, because browsers only start sound after a click. Add a Record or Save button (MediaRecorder on an AudioContext destination) so they can keep a .webm or .wav.',
  '- Video and animation: build a canvas, CSS, SVG or WebGL page in a ```html block, with a Record button (MediaRecorder on canvas.captureStream()) so the person can save a .webm. You cannot generate AI video or AI music files: if asked, say so in one sentence and offer a page that makes it instead.',
  '- Sound or video the person attaches arrives as a transcript (with time stamps) and, for video, a few frames as pictures. Use them; say if the transcript has no speech.',
  '- Tables: Markdown tables. Files to take away: say what to save the code as.',
  '- What next: after a reply that has real substance (not a one-line answer or a question back to the person), end with a ```followups block holding a JSON array of 2 or 3 short things the person might ask or do next, written as the person would say them ("Explain step 2 again", "Quiz me on this", "Make it shorter"). Each under 60 characters. Nothing after it.',
].join('\n');

/** The person's notes, if they have any. */
export function memoryPrompt(): string {
  const m = memory(); if (!m.length) return '';
  return 'What the person has asked you to remember (use it quietly, only where it helps):\n' + m.map((x) => `- ${x}`).join('\n');
}
export const appsFrameSrc = (slug: string, host: string) => `${APPS_URL}/${slug}?embed=1&host=${encodeURIComponent(host)}`;
