/**
 * PMC Apps inside the chat. An app opens in a frame (apps.pmcstudios.uk/<name>?embed=1) and is worked by messages:
 * fill in fields, press buttons, load a drawing, add files, read what it shows. Files it makes come back as files in the chat.
 * The other side of this is src/lib/embed.ts in the PMC Apps project.
 */
import catalog from './apps-catalog.json';

export const APPS_URL = (process.env.NEXT_PUBLIC_APPS_URL ?? 'https://apps.pmcstudios.uk').trim().replace(/\/+$/, '');
let appsOrigin = ''; try { appsOrigin = new URL(APPS_URL).origin; } catch { /* a bad address: no frames */ }
export const APPS_ORIGIN = appsOrigin;

export interface AppInfo { slug: string; cat: string; title: string; tagline: string; mode: string; fullscreen: boolean; files: boolean; keys: { key: string; init: string }[] }
export const CATALOG = catalog as AppInfo[];
export const appBySlug = (s: string) => CATALOG.find((a) => a.slug === s);
/** The closest app names to something mistyped. */
export const nearApps = (s: string) => { const q = s.toLowerCase().replace(/[^a-z]/g, ''); return CATALOG.filter((a) => a.slug.replace(/-/g, '').includes(q.slice(0, 5)) || q.includes(a.slug.replace(/-/g, '').slice(0, 5))).slice(0, 4).map((a) => a.slug); };

/** The list Coe is told about, one line each. */
export const catalogPrompt = () => CATALOG.map((a) => `${a.slug}: ${a.tagline || a.title}${a.files ? ' [takes files]' : ''}`).join('\n');

export interface Reply { ok: boolean; error?: string; done?: string[]; notes?: string[]; title?: string; fields?: { n: number; label: string; kind: string; value: string; options?: string[] }[]; buttons?: string[]; outputs?: { label: string; text: string }[]; image?: string; imageSize?: [number, number]; state?: Record<string, unknown>; api?: unknown }
export interface DoMsg { fill?: Record<string, unknown>; click?: string[]; call?: Record<string, unknown>; state?: Record<string, unknown>; files?: { name: string; type: string; data: string }[] }
export interface AppFile { name: string; mime: string; size: number; data: string }

export interface FrameCtl {
  slug: string;
  ready: Promise<void>;
  read(): Promise<Reply>;
  act(m: DoMsg): Promise<Reply>;
  onFile(fn: (f: AppFile) => void): () => void;
  onHeight(fn: (px: number) => void): () => void;
  dispose(): void;
}

/** Talks to one app in one frame. Only messages from that frame, from the PMC Apps address, are listened to. */
export function makeFrame(iframe: HTMLIFrameElement, slug: string): FrameCtl {
  const pending = new Map<number, (r: Reply) => void>(); let n = 0;
  const fileFns = new Set<(f: AppFile) => void>(), heightFns = new Set<(px: number) => void>();
  let resolveReady: () => void = () => {}; const ready = new Promise<void>((r) => { resolveReady = r; });
  let lastH = 0;
  const on = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow || e.origin !== APPS_ORIGIN) return;
    const m = e.data; if (!m || m.pmc !== 1) return;
    if (m.type === 'ready') resolveReady();
    else if (m.type === 'height') { lastH = m.px; heightFns.forEach((f) => f(m.px)); }
    else if (m.type === 'file') fileFns.forEach((f) => f({ name: String(m.name), mime: String(m.mime), size: Number(m.size) || 0, data: String(m.data) }));
    else if (m.type === 'reply') { const f = pending.get(m.id); if (f) { pending.delete(m.id); f(m as Reply); } }
  };
  window.addEventListener('message', on);
  const send = (type: string, body: object, ms = 25000) => new Promise<Reply>((res) => {
    const id = ++n; const t = setTimeout(() => { pending.delete(id); res({ ok: false, error: 'The app did not answer in time.' }); }, ms);
    pending.set(id, (r) => { clearTimeout(t); res(r); });
    iframe.contentWindow?.postMessage({ pmc: 1, id, type, ...body }, APPS_ORIGIN);
  });
  // The app says "ready" when it starts. If that message came before this listener, ask again.
  const hello = setInterval(() => iframe.contentWindow?.postMessage({ pmc: 1, type: 'hello' }, APPS_ORIGIN), 700);
  void ready.then(() => clearInterval(hello));
  return {
    slug, ready,
    read: () => send('read', {}),
    act: (m) => send('do', m as object, 60000),
    onFile: (fn) => { fileFns.add(fn); return () => fileFns.delete(fn); },
    onHeight: (fn) => { heightFns.add(fn); if (lastH) fn(lastH); return () => heightFns.delete(fn); },
    dispose: () => { window.removeEventListener('message', on); clearInterval(hello); },
  };
}

// Which frames are open, so the tool can find the one it just made, or reuse one that is already open for the same app.
const open = new Map<string, FrameCtl>(), waiters = new Map<string, ((f: FrameCtl) => void)[]>();
export const registerFrame = (key: string, f: FrameCtl) => { open.set(key, f); (waiters.get(key) ?? []).forEach((w) => w(f)); waiters.delete(key); return () => { if (open.get(key) === f) open.delete(key); }; };
export const frameFor = (key: string, ms = 20000) => new Promise<FrameCtl | null>((res) => {
  const f = open.get(key); if (f) { res(f); return; }
  const t = setTimeout(() => res(null), ms);
  waiters.set(key, [...(waiters.get(key) ?? []), (x) => { clearTimeout(t); res(x); }]);
});
export const openFrame = (key: string) => open.get(key) ?? null;

/** What Coe is told about the app after each step. */
export function describe(r: Reply, slug: string): string {
  if (!r.ok) return `The app did not respond: ${r.error ?? 'unknown error'}`;
  const out: string[] = [`${r.title || slug} is open in the chat.`];
  if (r.done?.length) out.push('Done: ' + r.done.join(', ') + '.');
  if (r.notes?.length) out.push('Problems: ' + r.notes.join('; ') + '.');
  if (r.fields?.length) out.push('Fields (use the label, or its number n):\n' + r.fields.map((f) => `  ${f.n}. ${f.label} [${f.kind}] = ${JSON.stringify(f.value)}${f.options ? ' options: ' + f.options.join(' | ') : ''}`).join('\n'));
  if (r.buttons?.length) out.push('Buttons: ' + r.buttons.join(' | '));
  if (r.state && Object.keys(r.state).length) out.push('Stored settings you can set with "state": ' + Object.entries(r.state).map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 80)}`).join(', '));
  if (r.outputs?.length) out.push('Shown by the app:\n' + r.outputs.map((o) => `  [${o.label}] ${o.text}`).join('\n'));
  if (r.api) out.push('App data: ' + JSON.stringify(r.api).slice(0, 600));
  return out.join('\n').slice(0, 6000);
}
