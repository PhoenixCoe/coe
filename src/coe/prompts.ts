/** How Coe answers. One assistant: it helps with study questions, with code and with anything else. */
export const BASE_COE = [
  'You are Coe, a helpful assistant for students and for people who write code.',
  'Answer clearly and keep to what was asked. Use Markdown, and put code in fenced blocks with the language named.',
  'For a study question (maths, science, any school subject): read the question carefully first, including any picture. Work it out in short numbered steps so the person can follow along, then give the final answer on its own line that starts with "Answer:". For multiple choice, name the option and say why in one line. For a topic, explain it simply, then give one short question to test understanding.',
  'For code that has a problem: say what is wrong and on which line, then show the corrected code.',
  'If you are not sure, say so and say what to check. Do not make up facts or sources.',
].join(' ');
export const REDO_NOTE = 'The person says your last answer was wrong. Do not repeat it. Work the question again from the start, check every step, and say plainly what you changed.';

/** A greeting that depends on the hour and changes each visit. */
export function greeting(name: string, hour: number, pick = Math.random()): string {
  const c = name.trim() ? `, ${name.trim()}` : '';
  const set: string[] =
    hour < 5 ? [`Late night study session${c}?`, `Still up${c}? Let's make it count.`, `Burning the midnight oil${c}?`]
    : hour < 9 ? [`Early start${c}. What are we on?`, `Morning${c}. What is first?`, `Up early${c}? Good.`]
    : hour < 12 ? [`Morning${c}. What are you working on?`, `Good morning${c}. Pick a question.`, `Ready when you are${c}.`]
    : hour < 17 ? [`Afternoon${c}. What is the question?`, `Back at it${c}? What is next?`, `Hello${c}. What are we stuck on?`]
    : hour < 21 ? [`Evening${c}. What is left to do?`, `Study time${c}? Let's go.`, `Good evening${c}. What is the question?`]
    : [`Late one${c}? Let's get it done.`, `Nearly bedtime${c}. One last question?`, `Evening study${c}. What is up?`];
  return set[Math.min(set.length - 1, Math.floor(pick * set.length))];
}

export interface Starter { title: string; text?: string; pic?: boolean; tool?: 'code' }
export const STARTERS: Starter[] = [
  { title: 'A maths question', text: 'Solve this and show the working:\n\n' },
  { title: 'Explain a topic', text: 'Explain this topic simply, then give me one question to test myself:\n\n' },
  { title: 'Check my code', tool: 'code' },
  { title: 'Fix an error', text: 'I get this error. What does it mean and how do I fix it?\n\n' },
  { title: 'A picture of a question', text: 'Read the question in this picture and answer it.', pic: true },
  { title: 'Write a message', text: 'Help me write a short, friendly message to ' },
];
