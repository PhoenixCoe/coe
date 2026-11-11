import { connection, CREATIVITY, modeOf, own, type CoeSettings } from './settings';
import { takePretend } from './ownertest';
import type { ModelKey } from './models';
import { token } from './cloud';

export interface Pic { type: string; data: string }   // data is base64, with no "data:" front
export interface ChatMsg { role: 'user' | 'assistant'; text: string; images?: Pic[] }
export interface Reply { text: string; inTokens?: number; outTokens?: number; stopped: boolean; cut: boolean; credits?: { used: number; limit: number; plan: string; tokens?: number; receipt?: string } }

export type ErrorKind = 'banned' | 'setup' | 'refused' | 'limit' | 'credits' | 'plan' | 'signin' | 'network' | 'server' | 'bad';
export class CoeError extends Error { constructor(public kind: ErrorKind, message: string) { super(message); } }

interface Request { model: ModelKey; system?: string; messages: ChatMsg[]; maxTokens?: number; signal?: AbortSignal; redo?: boolean; work?: boolean; step?: boolean; check?: boolean; call?: string }

const trim = (s: string) => s.trim().replace(/\/+$/, '');

async function target(s: CoeSettings): Promise<{ url: string; headers: Record<string, string> }> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (modeOf(s) === 'server') {
    if (s.code.trim()) h['x-coe-code'] = s.code.trim();
    const t = await token(); if (t) h.authorization = `Bearer ${t}`;     // the server can ask for a signed-in account
    return { url: trim(s.serverUrl), headers: h };
  }
  const o = own(s);
  if (o.kind === 'anthropic') {
    Object.assign(h, { 'x-api-key': o.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
    return { url: `${o.base}/v1/messages`, headers: h };
  }
  if (o.key) h.authorization = `Bearer ${o.key}`;
  return { url: `${o.base}/chat/completions`, headers: h };
}

/** The Coe server speaks the OpenAI way. With your own key, it depends on the provider you chose. */
const kindOf = (s: CoeSettings) => (modeOf(s) === 'server' ? 'openai' : own(s).kind);

function body(s: CoeSettings, r: Request): string {
  // The server turns Swift, Core and Deep into real model names itself. With your own key, Settings says which is which.
  const server = modeOf(s) === 'server';
  const model = server ? r.model : own(s).model(r.work ? 'deep' : r.model);
  const openai = server || /api\.openai\.com/.test(own(s).base);
  const temperature = CREATIVITY[s.creativity];
  const max = r.maxTokens ?? 2048;
  if (kindOf(s) === 'anthropic') {
    return JSON.stringify({
      model, max_tokens: max, stream: true, ...(r.system ? { system: r.system } : {}), ...(temperature !== undefined ? { temperature } : {}),
      messages: r.messages.map((m) => ({
        role: m.role,
        content: [...(m.images ?? []).map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.type, data: i.data } })), { type: 'text', text: m.text || ' ' }],
      })),
    });
  }
  return JSON.stringify({
    model, stream: true, stream_options: { include_usage: true }, ...(server && r.work ? { work: true } : {}), ...(openai ? { max_completion_tokens: max } : { max_tokens: max }), ...(temperature !== undefined && !openai ? { temperature } : {}),
    messages: [
      ...(r.system ? [{ role: 'system', content: r.system }] : []),
      ...r.messages.map((m) => ({
        role: m.role,
        content: m.images?.length ? [...m.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.type};base64,${i.data}` } })), { type: 'text', text: m.text || ' ' }] : m.text || ' ',
      })),
    ],
  });
}

/** The data lines of a server-sent stream, one by one. */
async function* lines(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader(), dec = new TextDecoder();
  let buf = '';
  const parts = (final: boolean) => {
    const out: string[] = [];
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0 || (final && buf.trim())) {
      const block = i >= 0 ? buf.slice(0, i) : buf; buf = i >= 0 ? buf.slice(i + 2) : '';
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (data) out.push(data);
    }
    return out;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    for (const d of parts(false)) yield d;
  }
  for (const d of parts(true)) yield d;
}

async function explain(res: Response): Promise<CoeError> {
  let message = '', code = '';
  try { const j = await res.json(); message = j?.error?.message ?? j?.message ?? ''; code = j?.error?.code ?? ''; } catch { /* not JSON */ }
  if (code === 'banned') return new CoeError('banned', message);
  if (res.status === 402 || code === 'credits') return new CoeError('credits', message);
  if (code === 'plan') return new CoeError('plan', message);
  if (res.status === 401 && code === 'signin') return new CoeError('signin', message);
  if (res.status === 401 || res.status === 403) return new CoeError('refused', message || 'The server turned that down. Check the key or the access code in Settings.');
  if (res.status === 429) return new CoeError('limit', message || 'Too many requests just now. Wait a moment and try again.');
  if (res.status === 400 || res.status === 404 || res.status === 413) return new CoeError('bad', message || 'The server could not use that. Check the model name in Settings, or send less.');
  return new CoeError('server', message || `The server had a problem (${res.status}). Try again in a moment.`);
}

/** Sends a conversation and calls onText with the whole reply so far each time more arrives. */
export async function stream(s: CoeSettings, r: Request, onText?: (soFar: string) => void): Promise<Reply> {
  const c = connection(s);
  if (!c.ok) throw new CoeError('setup', c.why);
  const { url, headers } = await target(s); const pretend = takePretend(); if (pretend && pretend !== 'offline') headers['x-coe-test'] = pretend; if (r.redo) headers['x-coe-redo'] = '1'; if (r.step) headers['x-coe-step'] = '1'; if (r.check) headers['x-coe-check'] = '1'; if (r.call) headers['x-coe-call'] = r.call;
  let res: Response;
  try { if (pretend === 'offline') throw new TypeError('Failed to fetch'); res = await fetch(url, { method: 'POST', headers, body: body(s, r), signal: r.signal }); }
  catch (e) {
    if ((e as Error).name === 'AbortError') return { text: '', stopped: true, cut: false };
    throw new CoeError('network', 'Could not reach the server. Check its address in Settings, and that it allows this site.');
  }
  if (!res.ok) throw await explain(res);
  const hu = res.headers.get('x-coe-used'), hl = res.headers.get('x-coe-limit');
  let credits: Reply['credits'] = hu !== null && hl !== null ? { used: Number(hu), limit: Number(hl), plan: res.headers.get('x-coe-plan') || 'free' } : undefined;
  if (!res.body) throw new CoeError('server', 'The server sent nothing back.');

  let text = '', inTokens: number | undefined, outTokens: number | undefined, cut = false;
  try {
    for await (const d of lines(res)) {
      if (d === '[DONE]') break;
      let j: any; try { j = JSON.parse(d); } catch { continue; }
      if (j.coe_usage) { credits = { used: Number(j.coe_usage.used) || 0, limit: Number(j.coe_usage.limit) || 0, plan: String(j.coe_usage.plan || 'free'), tokens: j.coe_usage.tokens === undefined ? undefined : Number(j.coe_usage.tokens) || 0, receipt: typeof j.coe_usage.receipt === 'string' ? j.coe_usage.receipt : undefined }; continue; }
      if (kindOf(s) === 'anthropic') {
        if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') { text += j.delta.text; onText?.(text); }
        else if (j.type === 'message_start') inTokens = j.message?.usage?.input_tokens;
        else if (j.type === 'message_delta') { outTokens = j.usage?.output_tokens ?? outTokens; if (j.delta?.stop_reason === 'max_tokens') cut = true; }
        else if (j.type === 'error') throw new CoeError('server', j.error?.message || 'The model stopped with an error.');
      } else {
        const t = j.choices?.[0]?.delta?.content; if (t) { text += t; onText?.(text); }
        if (j.choices?.[0]?.finish_reason === 'length') cut = true;
        if (j.usage) { inTokens = j.usage.prompt_tokens; outTokens = j.usage.completion_tokens; }
        if (j.error) throw new CoeError('server', j.error.message || 'The model stopped with an error.');
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { text, inTokens, outTokens, stopped: true, cut, credits };
    if (e instanceof CoeError) throw e;
    if (!text) throw new CoeError('network', 'The connection dropped before a reply came back.');
  }
  return { text, inTokens, outTokens, stopped: false, cut, credits };
}

/** One question, one answer, no streaming to the screen. Used by Code check, which wants the whole answer before it shows anything. */
export async function ask(s: CoeSettings, r: Request): Promise<Reply> { return stream(s, r); }
