/**
 * When a tool did not work, the reply must say so. Coe is told this in plain words, but a reply that ignores it
 * ("Here is your picture" with no picture) is mended here, so the person is never left guessing.
 */
interface Run { tool: string; args: Record<string, unknown> }

/** "Could not make a picture": what to call a step that did not work. */
export function couldNot(r: Run): string {
  const a = r.args, k = ({ doc: 'document', code: 'code file', web: 'web page', data: 'table' } as Record<string, string>)[String(a.kind ?? 'doc')] ?? 'document';
  switch (r.tool) {
    case 'js': return 'Could not run the code';
    case 'maths': return 'Could not work it out';
    case 'remember': return 'Could not save a note';
    case 'search': return 'Could not search the web';
    case 'image': return 'Could not make a picture';
    case 'place': return 'Could not look up places';
    case 'pmc_app': return `Could not use ${String(a.slug ?? '').slice(0, 30) || 'the app'}`;
    case 'chat': return 'Could not change a chat';
    case 'workspace': return 'Could not use the project folder';
    case 'editor': return String(a.action ?? 'list') === 'create' ? `Could not make the ${k}` : 'Could not work in the editor';
    case 'read': return 'Could not read the file';
    case 'screenshot': return 'Could not take the screenshot';
    default: return 'A tool did not work';
  }
}

/** The same thing as Coe would say it: "I couldn't make the picture." */
const doing = (r: Run): string => {
  const a = r.args;
  switch (r.tool) {
    case 'image': return 'make the picture';
    case 'search': return 'search the web';
    case 'js': return 'run the code';
    case 'maths': return 'work that out';
    case 'remember': return 'save that note';
    case 'place': return 'look up that place';
    case 'pmc_app': return `use ${String(a.slug ?? '').slice(0, 30) || 'the app'}`;
    case 'chat': return 'change the chat';
    case 'workspace': return 'use the project folder';
    case 'editor': return String(a.action ?? 'list') === 'create' ? 'make that document' : 'change the document';
    case 'read': return 'read that file';
    case 'screenshot': return 'take the screenshot';
    default: return 'do that';
  }
};

/** Does the reply already say it did not work? */
const OWNS = /\b(couldn.?t|could not|can.?t|cannot|unable|did not work|didn.?t work|wasn.?t able|was not able|not able|failed|sorry|used up|part of pro|not available|isn.?t available|ran out)\b/i;
/** Does it talk as if it worked? */
const BRAGS = /\b(here(?:.s| is| are)|i(?:.ve| have)? (?:made|drawn|drew|created|generated|written|finished|ran|run|found)|it (?:ran|worked|works|is working)|done|ready|all set|there you go|fine|success\w*|complet\w*|finished|correct|passed|no problem)\b/i;

export const failLine = (r: Run, why: string): string => {
  const reason = why.replace(/\s+/g, ' ').trim().replace(/^FAILED\.\s*/, '');
  return `I couldn’t ${doing(r)}.${reason ? ' ' + (/[.!?]$/.test(reason) ? reason : reason + '.') : ''}`;
};

/** The reply, made honest: if the last tool failed and the reply does not say so, it starts with what went wrong. */
export function honest(text: string, r: Run, why: string): string {
  if (OWNS.test(text)) return text;
  const line = failLine(r, why);
  const t = text.trim();
  return !t || t.length < 120 || (BRAGS.test(t) && t.length < 500) ? line : `${line}\n\n${t}`;
}
