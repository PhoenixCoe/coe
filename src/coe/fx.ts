/**
 * The words Coe can use to make a point stand out. One list, used by the page that draws replies,
 * by the instructions Coe is given, and by the tests, so they cannot drift apart.
 */
export const EFFECTS: Record<string, string> = {
  pop: 'jumps in with a bounce (a key word or number)',
  rise: 'slides up into place',
  fade: 'fades in gently',
  reveal: 'writes itself out left to right (an answer or a result)',
  pulse: 'beats slowly (the one thing to remember)',
  shake: 'a quick shake (a warning or a common mistake)',
  wave: 'the letters ripple (short, friendly words)',
  bounce: 'bounces (a short, happy word)',
  flash: 'flashes between colours (something urgent)',
  underline: 'draws a line under itself',
  highlight: 'a marker pen sweeps across it',
  grow: 'swells bigger and settles',
  flip: 'turns over once (a before and after, or a twist)',
  glow: 'a bold shadow beats around it',
};
export const COLOURS = ['green', 'gold', 'red', 'blue', 'ink'] as const;
export const BOXES: Record<string, string> = {
  center: 'centred text, for a key idea, a definition or the final answer',
  right: 'text pushed to the right',
  big: 'large bold text, for one line that matters most',
  key: 'a boxed "remember this"',
  tip: 'a green tip box',
  warn: 'a red warning box',
  note: 'a plain note box',
  quote: 'a quotation',
  steps: 'a numbered or bulleted list whose items appear one after another',
};
export const isEffect = (n: string) => Object.prototype.hasOwnProperty.call(EFFECTS, n);
export const isBox = (n: string) => Object.prototype.hasOwnProperty.call(BOXES, n);
export const isColour = (n: string) => (COLOURS as readonly string[]).includes(n);
/** Every class name a reply may carry. Anything else is removed. */
export const fxClass = (c: string) => /^fx-[a-z-]+$/.test(c) && [...Object.keys(EFFECTS), ...Object.keys(BOXES), ...COLOURS, 'box', 's', 'l', 'sp'].includes(c.slice(3));
