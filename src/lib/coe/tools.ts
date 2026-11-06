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
import type { Img, ToolOut, ToolRun } from '@/coe/store';
import { serverPost } from './billing';
import { lookupPlaces } from './places';
import { bumpQuota, quotaLeft } from './account';
import { QUOTAS, type PlanKey, type QuotaKey } from './models';
import type { CoeSettings } from './settings';
import { googleNow, links, memory, remember } from './links';
import { runJs } from './sandbox';
import * as gh from './github';
import * as gg from './google';
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
  { name: 'google_doc', confirm: true }, { name: 'google_sheet', confirm: true }, { name: 'google_slides', confirm: true },
  { name: 'google_read', pro: true }, { name: 'github', pro: true }, { name: 'workspace', pro: true },
];
export const defOf = (n: string) => TOOLS.find((t) => t.name === n);
/** Steps one request may take before Coe must wrap up. */
export const STEPS = { free: 4, pro: 10, work: 24 };

/** Reads the call and says whether it only shows something for the person to approve. */
export const needsApproval = (c: Call): boolean => {
  if (c.tool === 'github') return ['commit', 'issue', 'pull'].includes(String(c.action));
  return !!defOf(c.tool)?.confirm;
};

export interface Ctx {
  settings: CoeSettings; signal: AbortSignal; plan: PlanKey; convId: string; runId: string;
  files: () => ws.Files; setFiles: (f: ws.Files) => void;
  images: () => Img[];                    // pictures in the chat, newest last: what the person attached, and what was made
  patch: (p: Partial<ToolRun>) => void;
  say: (t: string) => void;
}
export interface Done { status: 'ok' | 'error' | 'pending'; result: string; shown?: string; out?: ToolOut; images?: Img[] }

const fail = (result: string): Done => ({ status: 'error', result });
const pro = (what: string): Done => ({ status: 'error', result: `${what} is part of Pro, and this person is on Free. Tell them so in one short sentence and offer what you can do without it. Do not try again.`, shown: `${what} is part of Pro.` });
const str = (v: unknown, n = 100000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const trim = (s: string, n = 7000) => (s.length > n ? s.slice(0, n) + `\n[... ${s.length - n} more characters cut]` : s);

// ---------------------------------------------------------------- running a tool
export async function execute(c: Call, x: Ctx): Promise<Done> {
  const d = defOf(c.tool);
  if (!d) return fail(`There is no tool called "${c.tool}". The tools are: ${TOOLS.map((t) => t.name).join(', ')}.`);
  if (d.pro && x.plan !== 'pro') return pro(`The ${c.tool} tool`);
  try {
    if (d.quota && !(await takeQuota(d.quota, x))) { const m = `${QUOTAS[d.quota].unit[0].toUpperCase() + QUOTAS[d.quota].unit.slice(1)} for today are used up on this plan. ${x.plan === 'free' ? 'Pro has far more.' : 'They come back at midnight (UTC).'}`; return { status: 'error', result: m + ' Tell the person and carry on without it.', shown: m }; }
    switch (c.tool) {
      case 'js': return await toolJs(c, x);
      case 'maths': return await toolMaths(c);
      case 'remember': { const f = str(c.fact, 240).trim(); if (!f) return fail('Say what to remember.'); remember(f); return { status: 'ok', result: 'Saved. You will see it in your notes next time.', out: { kind: 'text', text: f } }; }
      case 'search': return await toolSearch(c, x);
      case 'image': return await toolImage(c, x);
      case 'place': return await toolPlace(c, x);
      case 'pmc_app': return await toolApp(c, x);
      case 'workspace': return await toolWorkspace(c, x);
      case 'google_read': { const r = await gg.readGoogle(str(c.url)); return { status: 'ok', result: `${r.kind} "${r.title}":\n${trim(r.text, 30000)}`, out: { kind: 'text', text: `Read ${r.kind}: ${r.title}` } }; }
      case 'github': return await toolGithub(c, x);
      case 'google_doc': case 'google_sheet': case 'google_slides': return await previewGoogle(c);
    }
  } catch (e) { if ((e as Error).name === 'AbortError') return fail('Stopped.'); return fail((e as Error).message || 'That did not work.'); }
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
  bumpQuota('search');
  return { status: 'ok', result: `Web search for "${q}":\n${r.text}\n\nSources:\n${r.sources.map((s) => `- ${s.title}: ${s.url}`).join('\n') || '(none given)'}\n\nAnswer from this, name the sources you use, and say if the results do not settle the question.`, out: { kind: 'search', text: r.text, sources: r.sources } };
}

async function toolImage(c: Call, x: Ctx): Promise<Done> {
  const prompt = str(c.prompt, 4000).trim(); if (!prompt) return fail('Say what to draw.');
  const r = await serverPost<{ data: string; type: string }>(x.settings, '/image', { prompt });
  bumpQuota('image');
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
    case 'run': {
      const p = c.path ? ws.cleanPath(c.path) : ''; const code = p ? f[p] : str(c.code);
      if (!code) return fail(p ? `There is no file ${p}.` : 'Give a path to a .js file, or code.');
      const r = await runJs(code, 15000, f);
      const bits = [r.log && `Printed:\n${trim(r.log, 6000)}`, r.value !== undefined && `Returned: ${trim(r.value, 3000)}`, r.error && `Error: ${r.error}`].filter(Boolean).join('\n\n') || 'It ran and printed nothing.';
      return { status: r.ok ? 'ok' : 'error', result: bits, out: { kind: 'text', text: bits } };
    }
    case 'preview': { const e = c.path ? ws.cleanPath(c.path) : ws.entryOf(f); if (!e || !(e in f)) return fail('There is no HTML file to preview. Write index.html first.'); return { status: 'ok', result: `${e} is now shown as a live preview under your message. You cannot see it. If you want to check it, run code that reads the file, or ask the person how it looks.`, out: { kind: 'text', text: `Preview of ${e}` } }; }
    default: return fail('workspace actions are: write, edit, read, list, delete, run, preview.');
  }
}

// ---------------------------------------------------------------- GitHub
async function toolGithub(c: Call, x: Ctx): Promise<Done> {
  if (!links().github) return fail('GitHub is not connected. Tell the person to add a token in Settings > Connections.');
  const a = str(c.action, 20), repo = str(c.repo, 200);
  const txt = (t: string): Done => ({ status: 'ok', result: trim(t, 30000), out: { kind: 'text', text: trim(t, 1500) } });
  switch (a) {
    case 'repos': return txt(await gh.repos());
    case 'tree': return txt(await gh.tree(repo, str(c.ref, 100)));
    case 'read': return txt(await gh.readFile(repo, str(c.path, 300), str(c.ref, 100)));
    case 'search': return txt(await gh.searchCode(str(c.q, 200), repo));
    case 'commit': case 'issue': case 'pull': return preview(c);
    case 'to_workspace': { // copy repository files into the project folder
      const paths = arr<string>(c.paths).slice(0, 40); let f = x.files();
      for (const p of paths) f = ws.writeFile(f, p, await gh.readFile(repo, p, str(c.ref, 100)));
      x.setFiles(f); return txt(`Copied ${paths.length} files into the project folder.`);
    }
    default: return fail('github actions are: repos, tree, read, search, to_workspace, commit, issue, pull.');
  }
}

/** Something that changes the outside world is shown first. */
function preview(c: Call): Done { return { status: 'pending', result: 'Shown to the person with a button. Wait for their decision.', out: { kind: 'text', text: summary(c) } }; }
async function previewGoogle(c: Call): Promise<Done> {
  if (c.tool === 'google_doc' && !str(c.markdown).trim()) return fail('A Google Doc needs "markdown" with its content.');
  if (c.tool === 'google_sheet' && !arr(c.sheets).length) return fail('A Google Sheet needs "sheets": [{"name":"...","rows":[[...],[...]]}].');
  if (c.tool === 'google_slides' && !arr(c.slides).length) return fail('Google Slides need "slides": [{"title":"...","bullets":["..."]}].');
  return preview(c);
}
export function summary(c: Call): string {
  if (c.tool === 'google_doc') return `Google Doc: ${str(c.title, 100) || 'Untitled'}`;
  if (c.tool === 'google_sheet') return `Google Sheet: ${str(c.title, 100) || 'Untitled'}`;
  if (c.tool === 'google_slides') return `Google Slides: ${str(c.title, 100) || 'Untitled'}`;
  if (c.tool === 'github') return c.action === 'commit' ? `Commit to ${str(c.repo)} on ${str(c.branch) || 'the default branch'}: ${str(c.message, 100)}` : c.action === 'issue' ? `Issue on ${str(c.repo)}: ${str(c.title, 100)}` : `Pull request on ${str(c.repo)}: ${str(c.title, 100)}`;
  return c.tool;
}

/** What the person approved. Called from a button, so a Google pop-up can open. */
export async function approve(c: Call, x: Pick<Ctx, 'plan' | 'files'>): Promise<{ result: string; url?: string; label?: string }> {
  if (x.plan !== 'pro') throw new Error('Putting things into Google and GitHub is part of Pro.');
  if (c.tool === 'github') {
    const repo = str(c.repo);
    if (c.action === 'commit') {
      let files = arr<{ path: string; content?: string; delete?: boolean }>(c.files);
      if (c.from_workspace === true) files = [...files, ...Object.entries(x.files()).map(([path, content]) => ({ path, content }))];
      const pr = c.pr && typeof c.pr === 'object' ? (c.pr as { title?: string; body?: string; base?: string }) : undefined;
      const r = await gh.commit({ repo, branch: str(c.branch, 100) || undefined, message: str(c.message, 500) || 'Update from Coe', files, pr: pr ? { title: str(pr.title, 250) || str(c.message, 250), body: str(pr.body), base: pr.base } : undefined });
      return { result: `Committed${r.pr ? ' and opened a pull request' : ''}: ${r.pr ?? r.url}`, url: r.pr ?? r.url, label: r.pr ? 'Open pull request' : 'Open commit' };
    }
    if (c.action === 'issue') { const u = await gh.openIssue(repo, str(c.title, 250), str(c.body)); return { result: `Issue opened: ${u}`, url: u, label: 'Open issue' }; }
    if (c.action === 'pull') { const u = await gh.openPull(repo, str(c.title, 250), str(c.head, 100), str(c.base, 100), str(c.body)); return { result: `Pull request opened: ${u}`, url: u, label: 'Open pull request' }; }
  }
  if (!googleNow()) await gg.connectGoogle('make');
  if (c.tool === 'google_doc') {
    const r = c.id || c.url ? await gg.appendDoc(str(c.id || c.url), str(c.markdown)) : await gg.makeDoc(str(c.title, 200), str(c.markdown));
    return { result: `Google Doc ready: ${r.url}`, url: r.url, label: 'Open in Google Docs' };
  }
  if (c.tool === 'google_sheet') { const r = await gg.makeSheet(str(c.title, 200), arr<gg.SheetIn>(c.sheets)); return { result: `Google Sheet ready: ${r.url}`, url: r.url, label: 'Open in Google Sheets' }; }
  if (c.tool === 'google_slides') { const r = await gg.makeSlides(str(c.title, 200), arr<gg.SlideIn>(c.slides)); return { result: `Google Slides ready: ${r.url}`, url: r.url, label: 'Open in Google Slides' }; }
  throw new Error('That cannot be approved.');
}

// ---------------------------------------------------------------- what Coe is told
export interface PromptOpts { plan: PlanKey; work: boolean; web: boolean; google: boolean; github: boolean; files: ws.Files; stepsLeft: number; hasApps: boolean }

export function toolsPrompt(o: PromptOpts): string {
  const P = o.plan === 'pro';
  const t: string[] = [];
  const add = (s: string) => t.push(s);
  add('# Tools');
  if (o.stepsLeft <= 0) { add('You have used all the tool steps for this request. Do not use any more tools. Write the final answer now with what you have, and say what is left undone.'); return t.join('\n'); }
  add('You can use tools. To use one, end your message with exactly one block like this, then stop writing. Never write the result yourself and never write anything after the block:');
  add('```coe-tool\n{"tool":"js","code":"return 6*7"}\n```');
  add('The page runs it and sends you the result as the next message, then you carry on. Use a tool only when it really helps. Most questions need none. The block must be valid JSON (escape quotes and write line breaks inside strings as \\n). You have up to ' + o.stepsLeft + ' more steps for this request.');
  add('');
  add('Tools you can use now:');
  add('- js {"code": "..."}: runs JavaScript in a safe box (no network). Use console.log, and "return" a value. Use it for exact maths, data work, simulations, parsing, and to check your own answers. Do not guess a calculation you can run.');
  add('- maths {"op": "...", "expr": "..."}: an exact maths engine. ops: eval (numbers, units like "5 km to miles", matrices like "det([[1,2],[3,4]])", statistics like "std([2,4,4,5])"), solve ("expr": "x^2-5x+6=0", "variable": "x"; a system: "exprs": ["x+y=3","x-y=1"], "vars": ["x","y"]), simplify, expand, factor, diff ("variable", optional "at"), integrate (optional "from" and "to" for a definite integral), limit ("at"), sum ("from", "to"). Use * for times and ^ for powers. Prefer it to working out hard algebra, calculus or arithmetic in your head, then explain the method in steps and give the result in LaTeX.');
  add('- remember {"fact": "..."}: saves something the person asked you to remember about them or how they like things done. Only when they ask, or clearly state a lasting preference.');
  add('- search {"q": "..."}: searches the web (needs the web switched on, and counts toward a small daily limit' + (P ? '' : ' on Free') + '). Use it for anything recent or that you are unsure of. Then cite your sources.');
  add('- place {"query": "...", "limit": 5, "near": [lat, lng]}: looks up real places and businesses on OpenStreetMap: exact position, address, brand, opening hours, website. Put the town or country in the query ("Greggs, Ipswich, UK"). Use it before you show anything on a map or give a location. Free, and needs no web switch.');
  add('- image {"prompt": "..."}: makes a picture. Write a full prompt: subject, style, colours, composition, mood, any words to show. It is shown to the person under your message.');
  if (o.hasApps) {
    add('- pmc_app {"slug": "...", "fill": {"Field label": "value"}, "click": ["Button text"], "call": {...}, "use_images": "attached"}: opens one of the PMC Apps in the chat and works it like a person would. Call it with just the slug first: the result lists the fields and buttons. Then fill and click. Anything the app exports comes into the chat as a file the person can download. "use_images" ("attached" or "generated") adds the pictures in the chat to an app that takes files. Keep using the same slug and the same window stays open. The apps:');
    add(catalogPrompt());
    add('  Pixel Art Maker also takes a drawing: {"tool":"pmc_app","slug":"pixel-art-maker","call":{"load":{"palette":{"a":"#a33a2b","b":"#171717"},"frames":[["..aa..","..aa..", "...one string of letters per row, \\".\\" is empty..."]],"fps":6}}}. More than one frame makes an animation. Then click "GIF" for the animated file, or "PNG" or "Sheet".');
  }
  add('- google_doc {"title": "...", "markdown": "..."}, google_sheet {"title": "...", "sheets": [{"name": "...", "rows": [["header","header"],["a",1]]}]}, google_slides {"title": "...", "slides": [{"title": "...", "bullets": ["..."]}]}: shows a preview, and the person presses a button to put it in their Google account' + (P ? '' : ' (that button is part of Pro; they can still read the preview and download it)') + '. Write the whole thing. In sheets, text starting with = is a formula. Slides: the first one is the cover.');
  if (P) add('- google_read {"url": "..."}: reads a Google Doc, Sheet or Slides file the person shares.');
  if (P && o.github) {
    add('- github {"action": ..., "repo": "owner/name"}: actions repos, tree {ref}, read {path, ref}, search {q}, to_workspace {paths: [...]} run now. commit {branch, message, files: [{path, content}], from_workspace: true|false, pr: {title, body}}, issue {title, body} and pull {title, head, base, body} are shown for the person to approve. A commit to a new branch makes the branch.');
  }
  if (P) {
    add('- workspace {"action": ...}: a project folder for this chat, so you can build real projects. write {path, content}, edit {path, find, replace} (find must appear exactly once), read {path}, list, delete {path}, run {path or code} (runs JavaScript with readFile(path) and listFiles()), preview {path} (shows an HTML page live, with its own CSS and JS files). The person can download the folder as a zip or commit it to GitHub. Work in steps: write, run, read the result, fix, repeat. Check your work before you say it is done.');
    const names = Object.keys(o.files);
    add(names.length ? 'The project folder now holds:\n' + ws.listing(o.files) : 'The project folder is empty.');
  }
  add('');
  add('When the person asks for something that needs a tool you do not have (GitHub, a project folder, a Google file read), say it is part of Pro or needs connecting in Settings > Connections, in one sentence.');
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
  '- Diagrams: a ```mermaid block (flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, mindmap, pie, timeline...) is drawn as a picture. Style it however suits the subject (classDef, style lines, themes); it does not need to look like Coe.',
  '- Pictures you draw: a complete <svg> in a ```svg block is shown as a picture the person can save.',
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
