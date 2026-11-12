/** The version of Coe, and what changed. The number reads year, day, month, then a letter: b-2026.12.11.e is the 5th version of 2026, put out on 12 November.
 *  The b- means Beta. The letter counts the versions put out in the whole YEAR (not the day) and starts again at a each 1 January:
 *  a to z, then za to zz, then zza to zzz, then zzza and so on (each z in front adds another 26).
 *  Coe Mini uses the same number and the same list. Browsers only allow numbers in an extension's version, so Coe Mini's manifest says 2026.11.12.5
 *  (year, month, day, and the letter counted as a number, which always goes up) and shows the name above as its version name.
 *  Coe is also told this list (see prompts.ts), so it can answer "what is new?" and "what can you do now?". Add the newest version at the top. */
export const COE_VERSION = 'b-2026.12.11.e';
export const COE_DATE = '12 November 2026';
export const COE_BETA = true;

/** 1 is a, 26 is z, 27 is za, 52 is zz, 53 is zza: each extra z in front is another 26. */
export const versionLetter = (n: number): string => { const k = Math.max(1, Math.floor(n)) - 1; return 'z'.repeat(Math.floor(k / 26)) + String.fromCharCode(97 + (k % 26)); };
/** The other way: a is 1, z is 26, za is 27. Returns 0 for anything that is not a version letter. */
export const versionLetterNo = (s: string): number => { const m = /^(z*)([a-z])$/.exec(s); return m ? m[1].length * 26 + (m[2].charCodeAt(0) - 96) : 0; };
/** The name people see: b-2026.11.11.d (day first, then month, no leading zeros). */
export const versionName = (year: number, month: number, day: number, n: number, beta = true): string => `${beta ? 'b-' : ''}${year}.${day}.${month}.${versionLetter(n)}`;
/** Takes a name apart again. Anything that is not one of ours gives null. */
export function parseVersion(v: string): { beta: boolean; year: number; day: number; month: number; letter: string; n: number } | null {
  const m = /^(b-)?(\d{4})\.(\d{1,2})\.(\d{1,2})\.([a-z]+)$/.exec(String(v || '').trim()); if (!m) return null;
  const n = versionLetterNo(m[5]); return n ? { beta: !!m[1], year: Number(m[2]), day: Number(m[3]), month: Number(m[4]), letter: m[5], n } : null;
}
/** The number the browser keeps for Coe Mini: year, month, day, letter number. It only ever goes up. */
export const manifestVersion = (v: string): string | null => { const p = parseVersion(v); return p ? `${p.year}.${p.month}.${p.day}.${p.n}` : null; };

export type Where = 'both' | 'web' | 'mini';
export interface Change { where: Where; text: string }
export interface Release { v: string; date: string; items: Change[]; before: string[] }

export const RELEASES: Release[] = [
  {
    v: COE_VERSION, date: COE_DATE,
    items: [
      { where: 'both', text: 'PMC Account. One email and a password you choose, on one sign-in page (accounts.pmcstudios.uk) that Coe and Coe Mini both use. A one-time code by email is only used to check a new address and to reset a forgotten password. There is no Google, Microsoft or GitHub sign-in.' },
      { where: 'both', text: 'Sign in with PMC is the main button in Coe and in Coe Mini. Emailing a code is still there, as a small way in underneath.' },
      { where: 'both', text: 'Safer sign-in. A link can never sign you in. The PMC Account page hands you back only with a one-time value that your own browser made, and the key that travelled is swapped for a new one at once.' },
      { where: 'both', text: 'Your PMC Account page (accounts.pmcstudios.uk) is now a small dashboard: your email, the sites and apps you have used (PMC or not), signing out of every other device, and changing your password. Nobody can see your password, not even you, because only a scrambled copy is kept. Changing it asks for your current password and a code sent to your email.' },
      { where: 'both', text: 'Notifications, only if you allow them. Switch it on in Settings under Look and your browser asks first. When a reply is ready and you are on another tab or app, Coe says “Your reply is ready.” It never shows what the reply says.' },
      { where: 'both', text: 'If the PMC Account page cannot be reached, Coe and Coe Mini open on the emailed code by themselves, so nobody is stuck.' },
      { where: 'both', text: 'A bigger icon. The star button now fills the whole icon in a browser tab, on an iPhone home screen, as the app icon and on the Coe Mini toolbar, and keeps its hard green shadow.' },
      { where: 'both', text: 'The privacy page now explains the PMC Account (what is kept, what is not, and that chats are not end-to-end encrypted) and notifications.' },
      { where: 'both', text: 'Signing out puts the theme back to normal PMC and removes your picture from that device. Both come back when you sign in again.' },
      { where: 'web', text: 'Text starts smaller on a phone (90%) and an iPad (85%). A size you choose yourself is kept.' },
      { where: 'both', text: 'The Coe and Coe Mini tabs over your chats are quieter: plain underlined tabs, not boxes.' },
      { where: 'web', text: 'Coe opens on a phone without needing a refresh or two. Each wait while it starts has a limit, a slow download is no longer thrown away, and if it really is stuck, Reload and Fix and reload sit under the logo and loading bar in the PMC style.' },
    ],
    before: [
      'Coe and Coe Mini signed you in with an emailed code every time, and a link in the address could sign a browser in.',
      'Signing out left your theme and picture on the device.',
      'The text was the same size on a phone as on a computer.',
      'The loading screen buttons looked plain and sat over the middle of the screen.',
      'The icon was small, with a lot of empty space round the star.',
      'There was no account page, and no notification when a reply was ready.',
    ],
  },
  {
    v: 'b-2026.11.11.d', date: '11 November 2026',
    items: [
      { where: 'both', text: '“What Coe did” looks like the summary in Claude Code: one quiet line, and when you open it a plain list with a dot for each step and its result under it.' },
      { where: 'both', text: 'Two tabs over your chats, Coe and Coe Mini, once you have chats from both. A chat from the other one opens on the right tab.' },
      { where: 'both', text: 'A plan is the same card in both: a progress bar, and a tick for each step done.' },
      { where: 'both', text: 'A job Coe Mini did on a page shows as the same Job card in Coe Mini and on the website.' },
      { where: 'both', text: 'If a PMC app will not open in a chat, Coe says so plainly, gives you the link to open it yourself, and offers another way.' },
      { where: 'mini', text: 'Coe Mini also takes pictures of diagrams that a homework site draws as a background image, so it can read them with the question.' },
      { where: 'both', text: 'Setup is a few short screens. Pick your theme, colours and comfort settings as you go. They follow you to your other devices.' },
      { where: 'both', text: 'Any colour. Pick your own theme colour with the PMC colour picker. Coe keeps the text easy to read.' },
      { where: 'both', text: 'The age question now says it’s only used to fit answers to you.' },
      { where: 'both', text: 'Button words stay visible when you hover or press. Text boxes no longer get a coloured outline when you click in.' },
      { where: 'both', text: 'Coe asks how it’s doing much less often.' },
      { where: 'both', text: 'New font names: PMC Header and PMC Font.' },
      { where: 'both', text: 'A short footer: made by PMC Studios, About, Privacy, Contact and the version. Open Coe buttons show the Coe logo.' },
      { where: 'both', text: 'New version numbers. b-2026.11.11.d reads year, day, month, then a letter that counts the versions put out this year (a, b, c … z, then za, zb …). The b means Beta.' },
      { where: 'both', text: 'Question cards. Each shows a tick and Done once answered, folds to one line (the arrow opens it), and can show how Coe got the answer. If it was wrong, Coe says sorry and tries again for free.' },
      { where: 'web', text: 'The shared chat page looks new: details at the top, a wide centred chat, and a way to report a chat.' },
      { where: 'web', text: 'Say yes to a PMC app and it opens in the same reply, not as a new message.' },
      { where: 'both', text: 'While Coe works you see just the turning Coe star.' },
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
      { where: 'both', text: 'A chat opens the same in Coe and in Coe Mini, whichever one made it: pictures, files, maps, plans, question cards, diagrams, folded sections, highlighted words and boxes all show.' },
      { where: 'web', text: 'Coe Mini in Settings shows the Coe Mini logo and the Chrome, Edge and Firefox logos. They say Coming soon, and each becomes a button to its store when Coe Mini is there.' },
      { where: 'both', text: 'Setup shows once. The first time you open version b-2026.11.11.d, signed in or not, you get the setup. After that it never comes back, and not on your other devices either. A new account, or one deleted and made again, gets it once.' },
      { where: 'both', text: 'Words fade in one letter at a time, like being unveiled.' },
      { where: 'both', text: 'All the writing animations are gone. While Coe works, writing included, you see just the turning Coe star.' },
      { where: 'both', text: 'The tab icon in Coe and the toolbar button in Coe Mini show a turning ring while an answer is written, then just a tick when it is ready. No badge in the corner.' },
      { where: 'web', text: 'In the sidebar, a chat’s name shows a loading ring while its answer is written and a tick when it is done.' },
      { where: 'both', text: 'Every button looks right and reacts to hover and press without jumping about. The chat box buttons are redrawn.' },
      { where: 'web', text: 'Drop-downs match: Save, Find in this chat and the More menus share one look and one set of icons. (Coe Mini’s menus already did.)' },
      { where: 'both', text: 'Feedback and Report send an email to the Coe team by themselves, in a layout in the Coe style and fonts. No mail app opens.' },
      { where: 'both', text: 'A Feedback tab in Settings. The feedback box moved there from About.' },
      { where: 'both', text: 'Report chat is in the chat menu at the top. Say why, add a few words if you like, and choose whether the last few messages go with it.' },
      { where: 'web', text: 'The home page fits an iPad, even with the browser bar showing: all four blocks are back and nothing is squashed.' },
      { where: 'web', text: 'The shared chat page has one Open Coe button.' },
      { where: 'web', text: 'The code editor looks like the document editor but for code. It closes the sidebar, puts the Coe chat on the left, and lets you see the code, the preview, or both.' },
      { where: 'web', text: '“Getting a tool ready” looks neater, and the activity summary is clearer.' },
      { where: 'both', text: 'While Coe thinks you see the turning star, a word that changes every few seconds, and a timer. When it is doing something real it says what (Searching the web, Running code, Making a picture).' },
      { where: 'both', text: 'No more search boxes. A web search shows in the same line as thinking, and a quiet Sources row sits under the answer.' },
      { where: 'both', text: 'Coe checks an answer before it writes it, so you see the answer once and never a first try that changes.' },
      { where: 'both', text: 'The tab says the chat name then Coe (just Coe when no chat is open). Days have a divider (Today, Yesterday, the date). Under your message: Copy, Edit and the time.' },
      { where: 'both', text: 'The focus ring only shows when you use the keyboard. Menus and dropdowns open quickly towards the side that has room.' },
      { where: 'both', text: 'Maps work in Coe Mini, and Coe draws a map right in the chat instead of giving a Google Maps link.' },
      { where: 'both', text: 'Hand a job to the other Coe. Ask Coe for something only Coe Mini does and it says so, with the right Add button for your browser and a Send this to Coe Mini button. Ask Coe Mini for something only Coe does and it asks Switch to normal Coe?, then opens your Coe tab (or the one already open). The one that receives it always asks before using it.' },
      { where: 'both', text: 'Links from Coe Mini to something done in Coe open that chat in Coe, and the document too when there is one.' },
      { where: 'web', text: 'The Coe Mini linking code shows as a temporary chat in Coe, with a big code. Only Accept or Decline there links it, never in Coe Mini. Leave it by starting or opening another chat.' },
      { where: 'both', text: 'Coe Mini shows What Coe did the same way Coe does: PMC apps, code, pictures, documents and project steps in one folded line.' },
      { where: 'both', text: 'When a PMC app has finished, the result is written in the reply. You never have to open the app or a fold to find it.' },
      { where: 'mini', text: 'Coe Mini is Coe in the sidebar: a little companion and helper. Ask it anything, with or without the page, and it looks at the page when that helps.' },
    ],
    before: [
      'Coe Mini was offered as a file to download from the Coe website.',
      'The setup was one long page, with no theme or colour choices.',
      'You could only pick from a few theme colours.',
      'Fonts were called Caracteres L2 and L4.',
      'There was no footer or credits page. The letter on a version counted the versions in one day.',
      'Setup was remembered by the device, so a deleted and remade account could skip it, and another device could ask again.',
      'A pencil appeared while Coe wrote, and words faded in a few at a time.',
      'Feedback and Report opened your mail app.',
      'A question card had no Done tick and could not be folded.',
    ],
  },
  {
    v: '2026.10.11', date: '10 November 2026',
    items: [
      { where: 'both', text: 'Profile picture. Add one in Settings, Account. It shows in Coe and in Coe Mini, with or without an account.' },
      { where: 'both', text: 'Kinder answers. Coe is gentler and less blunt, and greets you in five words or fewer.' },
      { where: 'both', text: 'Banned accounts. A banned account cannot ask or make more answers, and is told to write to contact@pmcstudios.uk.' },
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
export const versionLine = COE_VERSION;

/** What goes into Coe's own instructions: its version, and the list of what changed, for the app it is running in. */
export function versionPrompt(app: 'web' | 'mini'): string {
  const mine = (c: Change) => c.where === 'both' || c.where === app;
  const name = app === 'mini' ? 'Coe Mini' : 'Coe';
  const r = NEWEST;
  return [
    '# Your version and what is new',
    `You are ${name}, version ${COE_VERSION}. The number reads year, day, month, then a letter: ${parseVersion(r.v)?.year}, ${parseVersion(r.v)?.day}, ${parseVersion(r.v)?.month}, which is ${r.date}. The letter counts the versions put out this year (a is the first, then b, c, and after z comes za, zb), so ${r.v.split('.').pop()} is number ${parseVersion(r.v)?.n} of the year. The b at the front means Beta. ${COE_BETA ? 'Coe is still in Beta, so it keeps changing and can have rough edges. ' : ''}Coe and Coe Mini share one version number.`,
    `If the person asks what is new, what changed, what you can do now, or what you were like before, answer from this list in your own words, short and friendly, and never claim a change that is not on it. Do not bring it up otherwise.`,
    `New in ${r.v}:`,
    ...r.items.filter(mine).map((c) => `- ${c.text}`),
    'What it was like before this version:',
    ...r.before.map((t) => `- ${t}`),
  ].join('\n');
}
