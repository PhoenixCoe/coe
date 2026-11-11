/** The version of Coe, and what changed. The number reads year, day, month: 2026.11.11 is 11 November 2026. Coe Mini uses the same number and the same list.
 *  If more than one version goes out on the same day, the later ones end in a letter: 2026.11.11, then 2026.11.11b, 2026.11.11c (the first of the day has no letter).
 *  Browsers only allow numbers in an extension's version, so Coe Mini's manifest counts the letters as a fourth number (b is .2) and shows the lettered name.
 *  Coe is also told this list (see prompts.ts), so it can answer "what is new?" and "what can you do now?". Add the newest version at the top. */
export const COE_VERSION = '2026.11.11';
export const COE_DATE = '11 November 2026';
export const COE_BETA = true;

export type Where = 'both' | 'web' | 'mini';
export interface Change { where: Where; text: string }
export interface Release { v: string; date: string; items: Change[]; before: string[] }

export const RELEASES: Release[] = [
  {
    v: COE_VERSION, date: COE_DATE,
    items: [
      { where: 'both', text: 'Setup is a few short screens. Pick your theme, colours and comfort settings as you go. They follow you to your other devices.' },
      { where: 'both', text: 'Any colour. Pick your own theme colour with the PMC colour picker. Coe keeps the text easy to read.' },
      { where: 'both', text: 'The age question now says it’s only used to fit answers to you.' },
      { where: 'both', text: 'Button words stay visible when you hover or press. Text boxes no longer get a coloured outline when you click in.' },
      { where: 'both', text: 'Coe asks how it’s doing much less often.' },
      { where: 'both', text: 'New font names: PMC Header and PMC Font.' },
      { where: 'both', text: 'A footer with the Coe and PMC Studios copyright, About, Privacy, Contact and the version. Open Coe buttons show the Coe logo.' },
      { where: 'both', text: 'If two versions come out on the same day, the later one ends in a letter, like 2026.11.11b.' },
      { where: 'both', text: 'Question cards. Each shows a tick and Done once answered, folds to one line (the arrow opens it), and can show how Coe got the answer. If it was wrong, Coe says sorry and tries again for free.' },
      { where: 'web', text: 'The shared chat page looks new: details at the top, a wide centred chat, and a way to report a chat.' },
      { where: 'web', text: 'Say yes to a PMC app and it opens in the same reply, not as a new message.' },
      { where: 'both', text: 'While Coe works you see just the Coe star, with a pencil when it writes.' },
      { where: 'web', text: 'A list of questions shows as the same cards as Coe Mini, so you can read and tick them off.' },
      { where: 'mini', text: 'Coe Mini can type an answer into an ordinary page with its own cursor, like a person: quick bursts, small pauses, and a slip it fixes. Never on homework or quiz sites.' },
      { where: 'mini', text: 'The cursor shows the Coe logo and what it’s doing, and wanders while an answer takes a while. Stop is in the panel (Esc still works).' },
      { where: 'mini', text: 'The panel says what Coe is doing right now (going to a question, moving to the box, typing), with a progress bar. Stop or Esc ends it at once.' },
      { where: 'mini', text: 'Coe Mini reads questions without clicking through them when they’re all on screen.' },
      { where: 'mini', text: 'Google Forms and Microsoft Forms. A quiz or school form gets the answer and working in the panel, and nothing is typed. For an ordinary form (a sign-up, a survey) Coe can fill it in from what you tell it, and Press Submit for me asks first, then presses Submit once.' },
      { where: 'mini', text: 'Stop highlights what Coe typed, deletes it and puts the box back as it was.' },
      { where: 'mini', text: 'The Homework site note above the questions is bigger and clearer.' },
      { where: 'both', text: 'Notices and problems look the same in both. Grey with an info icon is a notice (tokens, Pro, sign in, blocked network or microphone). Orange means Coe couldn’t get through. Red means something broke.' },
      { where: 'both', text: 'If your network blocks Coe you’ll see Coe may be blocked here. If the microphone is blocked or missing, Coe says so and how to fix it.' },
      { where: 'both', text: 'Coe knows the main UK exam boards (AQA, Edexcel, OCR, WJEC and Eduqas, CCEA, SQA, Cambridge International, the IB) and how they word questions.' },
      { where: 'mini', text: 'Coe Mini recognises many more homework, quiz and game sites, and still never types on them.' },
      { where: 'mini', text: 'Do a job on this page. Ask Coe Mini to do something on a page, like saving a file to GitHub. It shows the good and the risks first, asks before anything that can’t be undone, and never types passwords or works on school sites.' },
      { where: 'both', text: 'Ask before Coe uses the cursor is one setting in Coe and Coe Mini. Turning it off shows the good and the risks first.' },
      { where: 'mini', text: 'The home screen is tidier. The buttons change to fit the page you are on (a homework site, a video, a document), the extras are in a More window, and the Coe star sits top right like on the website.' },
      { where: 'mini', text: 'If the sidebar is too narrow, Coe Mini shows which edge to drag, whether the sidebar is on the left or the right.' },
      { where: 'both', text: 'Coe Mini is for computers only (Chrome, Edge and Firefox). Phones and iPads can’t add extensions, so Coe greys out its Coe Mini settings there.' },
      { where: 'both', text: 'A chat opens the same in Coe and in Coe Mini, whichever one made it: pictures, files, maps, plans, question cards, diagrams, folded sections, highlighted words and boxes all show.' }
    ],
    before: [
      'The setup was one long page, with no theme or colour choices.',
      'You could only pick from a few theme colours.',
      'Fonts were called Caracteres L2 and L4.',
      'There was no footer or credits page, and a lettered version was not possible.',
      'A question card had no Done tick and could not be folded.',
    ],
  },
  {
    v: '2026.10.11', date: '10 November 2026',
    items: [
      { where: 'both', text: 'Profile picture. Add one in Settings, Account. It shows in Coe and in Coe Mini, with or without an account.' },
      { where: 'both', text: 'Kinder answers. Coe is gentler and less blunt, and greets you in five words or fewer.' },
      { where: 'both', text: 'Banned accounts. A banned account cannot ask or make more answers, and is told to write to appeal@pmcstudios.uk.' },
      { where: 'both', text: 'Errors look and read the same in Coe and Coe Mini, and sit just above the chat box.' },
      { where: 'both', text: 'The green page colour is now called Theme.' },
      { where: 'both', text: 'The words Coe shows while it thinks change as it works, so a long wait never says the same thing twice.' },
      { where: 'both', text: 'Feedback bonus. Send feedback in Settings, About, and get extra tokens once a day.' },
      { where: 'web', text: 'The Plans page is built again from scratch in the new look: a Free panel, a green Pro panel, a monthly or yearly switch and a meter for today\'s tokens.' },
      { where: 'web', text: 'The PMC Studios logo shows in only three places: the loading screen, the sign-in page and About.' },
      { where: 'mini', text: 'The PMC Studios logo shows in only two places: the sign-in screen and About.' },
      { where: 'mini', text: 'A top bar like the one on the website (the black island), with the chat name, the page and the files.' },
      { where: 'mini', text: 'A smaller account bar under the chat box, with the token meter along its top edge.' },
      { where: 'mini', text: 'Coe Mini reads each page you open, on your device. It uses no tokens. Turn it off in Settings, Browser.' },
      { where: 'mini', text: 'The double-checked mark is a small shield that opens to the right when you press it.' },
      { where: 'mini', text: 'A narrow window shows a short note about how to make Coe Mini wider.' },
    ],
    before: [
      'The Plans page was black, with the old header.',
      'Coe Mini had a sidebar button on top, and its errors looked different from the website\'s.',
      'There was no profile picture, and no notice for banned accounts.',
      'Greetings were longer, and answers were blunter.',
      'The green page colour was called Green.',
    ],
  },
];

export const NEWEST = RELEASES[0];
export const versionLine = `${COE_VERSION}${COE_BETA ? ' Beta' : ''}`;

/** What goes into Coe's own instructions: its version, and the list of what changed, for the app it is running in. */
export function versionPrompt(app: 'web' | 'mini'): string {
  const mine = (c: Change) => c.where === 'both' || c.where === app;
  const name = app === 'mini' ? 'Coe Mini' : 'Coe';
  const r = NEWEST;
  return [
    '# Your version and what is new',
    `You are ${name}, version ${versionLine}. The number reads year, day, month: ${r.v.split('.')[0]}, ${r.v.split('.')[1]}, ${r.v.split('.')[2]}, which is ${r.date}. ${COE_BETA ? 'Coe is still in Beta, so it keeps changing and can have rough edges. ' : ''}Coe and Coe Mini share one version number.`,
    `If the person asks what is new, what changed, what you can do now, or what you were like before, answer from this list in your own words, short and friendly, and never claim a change that is not on it. Do not bring it up otherwise.`,
    `New in ${r.v}:`,
    ...r.items.filter(mine).map((c) => `- ${c.text}`),
    'What it was like before this version:',
    ...r.before.map((t) => `- ${t}`),
  ].join('\n');
}
