/** Squeezes the old part of a long chat into a short summary, so the chat stays quick and cheap and Coe still remembers what mattered. */
import { ask } from './client';
import type { CoeSettings } from './settings';
import { uid, type Conv, type Msg } from '@/coe/store';

export const KEEP = 6;                    // the newest messages are always kept word for word
export const BIG = 90_000;                // about 22 thousand tokens of earlier chat

const plain = (m: Msg) => (m.text || '').replace(/`{3}coe-(?:tool|plan)[\s\S]*?(`{3}|$)/g, '').replace(/`{3}followups[\s\S]*?(`{3}|$)/g, '').trim();
export const chatChars = (c: Conv) => c.messages.reduce((n, m) => n + (m.text?.length ?? 0), 0);
/** Is the chat long enough that squeezing it is worth doing? */
export const tooLong = (c: Conv) => c.messages.length > KEEP + 4 && chatChars(c) > BIG;

/** Returns the chat with its older messages replaced by one summary, or null if there is nothing to squeeze or it did not work. */
export async function compactConv(s: CoeSettings, c: Conv): Promise<Conv | null> {
  const cut = c.messages.length - KEEP;
  if (cut < 4) return null;
  // Start the kept part on a message from the person.
  let at = cut; while (at < c.messages.length && !(c.messages[at].role === 'user' && !c.messages[at].hidden)) at++;
  if (at >= c.messages.length) at = cut;
  const old = c.messages.slice(0, at), keep = c.messages.slice(at);
  let transcript = old.filter((m) => !m.hidden || m.compact).map((m) => `${m.role === 'user' ? 'Person' : 'Coe'}: ${plain(m).slice(0, 2400)}`).filter((l) => l.length > 8).join('\n\n');
  if (transcript.length > 70_000) transcript = transcript.slice(-70_000);
  if (!transcript.trim()) return null;
  const r = await ask(s, { model: 'swift', check: true, maxTokens: 900, system: 'You write a summary of a conversation so that the assistant (Coe) can carry on without the original messages. Keep every fact, name, number, decision, preference, file name, code detail and unfinished task that could matter later. Use short bullet points. No greeting, no commentary. Write in the language the person used.', messages: [{ role: 'user', text: transcript + '\n\nWrite the summary now.' }] });
  const text = r.text.trim();
  if (text.length < 20) return null;
  const sum: Msg = { id: uid(), role: 'user', text: `[Summary of the earlier conversation, written so you can carry on]\n${text}`, ts: old[0]?.ts ?? Date.now(), compact: true };
  return { ...c, messages: [sum, ...keep], updated: Date.now() };
}
