/** Ways Coe can work. A persona is a standing style for the whole chat, kept on this device. */
export interface Persona { id: string; name: string; blurb: string; prompt: string; mine?: boolean; upd?: number; del?: boolean }
export const PERSONAS: Persona[] = [
  { id: 'coe', name: 'Coe', blurb: 'The usual: friendly, plain and short.', prompt: '' },
  { id: 'tutor', name: 'Tutor', blurb: 'Teaches step by step and checks you understand.', prompt: 'Work as a patient tutor. Do not just hand over answers to homework: find out what the person already knows, explain the idea in small steps, ask one check question, then let them try. When they are stuck, give a hint before the answer. After teaching something, offer a short ```quiz block. If they say they just want the answer, give it.' },
  { id: 'simple', name: 'Explain simply', blurb: 'Plain words, everyday examples, no jargon.', prompt: 'Explain everything as simply as you can: short sentences, everyday words, a concrete example or comparison, and no jargon unless you explain it first. Offer to go deeper at the end.' },
  { id: 'maths', name: 'Maths mentor', blurb: 'Exact working, proper notation, graphs.', prompt: 'Work as a careful maths mentor. Write every formula in LaTeX. Use the maths tool for anything that must be exact (solving, simplifying, differentiating, integrating, matrices, statistics) rather than trusting your own arithmetic. Show the working in numbered steps with the reason for each step. Draw a ```graph block whenever a picture of a function helps. Finish with "Answer:" and the result, and say how to check it.' },
  { id: 'examiner', name: 'Examiner', blurb: 'Exam-style questions and honest marking.', prompt: 'Work as an examiner. Ask exam-style questions on the topic one at a time (use a ```quiz block for multiple choice), mark the answers strictly but kindly with a mark scheme, say exactly where marks were lost, and set the next question a little harder if the person is doing well.' },
  { id: 'coder', name: 'Senior coder', blurb: 'Clean code, tests, small safe changes.', prompt: 'Work as a senior engineer. Ask for missing details only when they block you. Prefer small, correct, readable code with the language named in the fence, say what to run, and point out edge cases and bugs. For a whole project use the project folder and the workspace tool, and run code to check it when you can.' },
  { id: 'researcher', name: 'Researcher', blurb: 'Searches the web and cites sources.', prompt: 'Work as a researcher. Search the web when facts may have changed, compare more than one source, say how sure you are, separate what is established from what is disputed, and end with a Sources list of links.' },
  { id: 'writer', name: 'Writer and editor', blurb: 'Drafts and sharpens writing in your voice.', prompt: 'Work as a writer and editor. Keep the person\'s voice. When editing, show the improved text first and then a short list of what changed and why. When drafting, ask for the audience and purpose only if they are missing. Prefer clear, concrete, active writing.' },
  { id: 'brief', name: 'Short answers', blurb: 'As few words as possible.', prompt: 'Be as brief as possible: the answer first, in one to three sentences, with a list only when the content is a list. Offer more detail in a single line at the end only if it is useful.' },
  { id: 'deep', name: 'Deep thinker', blurb: 'Slows down, questions assumptions, checks itself.', prompt: 'Think carefully before answering. State the assumptions you are making, consider at least one alternative, check the answer a second way, and say plainly what you are unsure about.' },
];
const KEY = 'pmc:coe:persona';
export const personaOf = (id: string) => [...PERSONAS, ...loadStyles()].find((p) => p.id === id) ?? PERSONAS[0];
export function loadPersona(): string { try { const v = localStorage.getItem(KEY) || 'coe'; return [...PERSONAS, ...loadStyles()].some((p) => p.id === v) ? v : 'coe'; } catch { return 'coe'; } }
export function savePersona(id: string) { try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ } }

// ---------------------------------------------------------------- the person's own styles
/** "My styles": ways of working the person wrote themselves. Kept on this device and in the account. A removed one stays as a marker so removing it on one device removes it everywhere. */
const SKEY = 'pmc:coe:styles';
export const STYLE_MAX = 12;
let raw: Persona[] | null = null;
const readRaw = (): Persona[] => {
  if (raw) return raw;
  try { const v = JSON.parse(localStorage.getItem(SKEY) || '[]'); raw = Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string').slice(0, 60) : []; } catch { raw = []; }
  return raw;
};
const writeRaw = (list: Persona[]) => {
  raw = list;
  try { localStorage.setItem(SKEY, JSON.stringify(list)); } catch { /* storage blocked: kept for this visit only */ }
  try { window.dispatchEvent(new CustomEvent('pmc:coe-styles-changed')); } catch { /* no window */ }
};
export const loadStyles = (): Persona[] => readRaw().filter((p) => !p.del);
const sid = () => 'u-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const clean = (s: { name: string; blurb: string; prompt: string }) => ({ name: s.name.trim().slice(0, 30), blurb: s.blurb.trim().slice(0, 90), prompt: s.prompt.trim().slice(0, 1500) });

/** Adds a style (no id) or changes one (with its id). Returns it, or null when it is empty or there are too many. */
export function saveStyle(s: { id?: string; name: string; blurb: string; prompt: string }): Persona | null {
  const c = clean(s); if (!c.name || !c.prompt) return null;
  const list = readRaw().slice();
  const i = s.id ? list.findIndex((p) => p.id === s.id) : -1;
  if (i < 0 && list.filter((p) => !p.del).length >= STYLE_MAX) return null;
  const next: Persona = { id: i >= 0 ? list[i].id : sid(), ...c, blurb: c.blurb || 'Your own way of working.', mine: true, upd: Date.now() };
  if (i >= 0) list[i] = next; else list.push(next);
  writeRaw(list); return next;
}
export function removeStyle(id: string) {
  const list = readRaw().map((p) => (p.id === id ? { id, name: '', blurb: '', prompt: '', mine: true, upd: Date.now(), del: true } : p));
  writeRaw(list);
  try { if (localStorage.getItem(KEY) === id) localStorage.setItem(KEY, 'coe'); } catch { /* storage blocked */ }
}
/** What goes to the account: only once there is something, and removal markers are kept so they travel too. */
export const stylesOut = (): Persona[] | undefined => (readRaw().length ? readRaw() : undefined);
/** Joins another copy (the account): the most recently changed version of each style wins. Returns true when this device changed. */
export function mergeStyles(other: unknown): boolean {
  if (!Array.isArray(other)) return false;
  const list = readRaw().slice(); let changed = false;
  for (const o of other as Persona[]) {
    if (!o || typeof o.id !== 'string' || !/^u-[\w]{1,20}$/.test(o.id) || typeof o.name !== 'string') continue;
    const mine = list.findIndex((p) => p.id === o.id);
    const one: Persona = { id: o.id, name: String(o.name).slice(0, 30), blurb: String(o.blurb ?? '').slice(0, 90), prompt: String(o.prompt ?? '').slice(0, 1500), mine: true, upd: Number(o.upd) || 0, ...(o.del ? { del: true } : {}) };
    if (mine < 0) { if (list.length < 60 && (one.del || (one.name && one.prompt))) { list.push(one); changed = true; } }
    else if ((one.upd ?? 0) > (list[mine].upd ?? 0)) { list[mine] = one; changed = true; }
  }
  if (changed) writeRaw(list);
  return changed;
}

/** Typing "/" in the box offers these. Each one fills the box with a starting message. */
export interface Slash { cmd: string; title: string; text: string; go?: 'maths' | 'voice' | 'code' }
export const SLASH: Slash[] = [
  { cmd: 'quiz', title: 'Quiz me', text: 'Make me a quiz on this (a quiz block, 6 questions, with the reason for each answer): ' },
  { cmd: 'flashcards', title: 'Make flash cards', text: 'Make flash cards (a flashcards block, about 12 cards) on: ' },
  { cmd: 'graph', title: 'Draw a graph', text: 'Draw a graph of ' },
  { cmd: 'solve', title: 'Solve with working', text: 'Solve this exactly using the maths tool and show the working:\n\n' },
  { cmd: 'explain', title: 'Explain it simply', text: 'Explain this simply, with one example and one question to test me: ' },
  { cmd: 'summarise', title: 'Summarise', text: 'Summarise this in 5 short bullet points, then give the one thing to remember:\n\n' },
  { cmd: 'chart', title: 'Make a chart', text: 'Make a chart (a chart block) of this data:\n\n' },
  { cmd: 'diagram', title: 'Draw a diagram', text: 'Make a diagram that shows ' },
  { cmd: 'plan', title: 'Study plan', text: 'Make me a study plan for: ' },
  { cmd: 'page', title: 'Build a page', text: 'Build a polished single-page web app that ' },
  { cmd: 'game', title: 'Make a game', text: 'Build a small playable browser game: ' },
  { cmd: 'sound', title: 'Make a sound or music', text: 'Build a page that makes sound or music with the Web Audio API: ' },
  { cmd: 'animate', title: 'Make an animation', text: 'Build a looping animation page (canvas or CSS) of ' },
  { cmd: 'research', title: 'Research with sources', text: 'Research this on the web and give me a short answer with sources: ' },
  { cmd: 'translate', title: 'Translate', text: 'Translate this, and tell me anything that does not translate cleanly:\n\n' },
  { cmd: 'essay', title: 'Essay feedback', text: 'Give me honest feedback on this essay: strengths, weaknesses, and three specific fixes.\n\n' },
  { cmd: 'debug', title: 'Debug my code', text: 'Find the bug in this code, explain it, and show the fix:\n\n' },
  { cmd: 'maths', title: 'Maths keyboard', text: '', go: 'maths' },
  { cmd: 'voice', title: 'Voice mode', text: '', go: 'voice' },
  { cmd: 'code', title: 'Code check', text: '', go: 'code' },
];
