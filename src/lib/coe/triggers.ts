// The owner's test replies. Type TRIGGER-NAME (for example TRIGGER-MAP) as a message and Coe answers with a ready-made reply instead of asking the AI.
// Same list, same replies, in Coe and in Coe Mini. Nothing is sent to the model, so no tokens are used, and tool blocks (pictures, code, searches, editor) still run for real.
// Only the owner account gets them: for anyone else the message is an ordinary message. Coe Mini's copy of this file is made from this one.
// @ts-nocheck
/* eslint-disable */

const tool = (o) => '```coe-tool\n' + JSON.stringify(o) + '\n```';
const HEART = ['........', '..aa.aa.', '.aaaaaaa', '.aaaaaaa', '..aaaaa.', '...aaa..', '....a...', '........'];
const HEART2 = ['........', '.aa...aa', 'aaaa.aaa', 'aaaaaaaa', '.aaaaaa.', '..aaaa..', '...aa...', '........'];
const SHOW = 'Here is a mix of things.\n\nThe quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$ and the sum is\n\n$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$\n\n```mermaid\nflowchart LR\n  A[Idea] --> B{Plan}\n  B -->|yes| C[Build]\n  B -->|no| D[Think again]\n  C --> E[Ship]\n```\n\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect width="200" height="120" fill="#F2E4CE"/><circle cx="60" cy="60" r="34" fill="#337957" stroke="#171717" stroke-width="4"/><rect x="110" y="30" width="70" height="60" fill="#B49A57" stroke="#171717" stroke-width="4"/></svg>\n```\n\n```html\n<!doctype html><html><body style="margin:0;background:#171717;display:grid;place-items:center;height:100vh;font-family:sans-serif;color:#F2E4CE"><canvas id=c width=320 height=200></canvas><script>const x=document.getElementById("c").getContext("2d");let t=0;(function f(){x.fillStyle="#171717";x.fillRect(0,0,320,200);for(let i=0;i<9;i++){x.fillStyle="hsl("+(150+i*14)+",45%,"+(40+i*3)+"%)";x.beginPath();x.arc(160+Math.cos(t+i)*90,100+Math.sin(t*1.3+i)*50,14,0,7);x.fill()}t+=.03;requestAnimationFrame(f)})()</script></body></html>\n```\n';
const STUDY = ['Here is everything in one go.', '', 'The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$ and water forms by $\\ce{2H2 + O2 -> 2H2O}$.', '', '$$\\begin{aligned} \\int_0^1 x^2\\,dx &= \\frac{1}{3} \\\\ \\lim_{x\\to 0}\\frac{\\sin x}{x} &= 1 \\end{aligned}$$', '',
  '```graph', 'title: A wave and a parabola', 'y = sin(x)', 'y = x^2/8 - 1', 'x: -8..8', 'points: (0, -1) Vertex', '```', '',
  '```quiz', JSON.stringify({ title: 'Algebra', questions: [{ q: 'What is $2^3$?', options: ['6', '8', '9', '12'], answer: 1, why: '$2\\times 2\\times 2 = 8$' }, { q: 'Solve $x + 3 = 5$', options: ['1', '2', '3', '8'], answer: 1, why: 'Subtract 3 from both sides.' }] }), '```', '',
  '```flashcards', JSON.stringify({ title: 'Formulae', cards: [{ front: 'Area of a circle', back: '$\\pi r^2$' }, { front: 'Pythagoras', back: '$a^2 + b^2 = c^2$' }] }), '```', '',
  '```chart', JSON.stringify({ type: 'bar', title: 'Marks by term', labels: ['Autumn', 'Spring', 'Summer'], series: [{ name: 'Maths', data: [62, 71, 84] }, { name: 'Science', data: [55, 68, 77] }], yLabel: 'Mark' }), '```'].join('\n');
const REPLY = `Here is a short answer.

## What it does

The function **adds two numbers** and returns the result. A few notes:

- It does not change its inputs
- It works with whole numbers and decimals
- Use \`Number()\` first if the values are text

\`\`\`js
function add(a, b) {
  return a + b;
}
console.log(add(2, 3)); // 5
\`\`\`

| Input | Output |
| --- | --- |
| 2, 3 | 5 |
| 0.1, 0.2 | 0.30000000000000004 |

> Floating point numbers are not exact.
`;
const FU = REPLY + '\n```followups\n["Explain it more simply","Quiz me on this","Show it as a diagram"]\n```\n';
const DECK = 'Here is a short deck.\n\n```slides\n' + JSON.stringify({ title: 'Volcanoes', slides: [{ layout: 'title', title: 'Volcanoes', subtitle: 'How they work, and why they matter' }, { layout: 'bullets', title: 'How they form', bullets: ['Plates **move** apart or together', 'Magma rises through cracks', 'Pressure builds until $E = mc^2$-sized bangs'], notes: 'Say that most volcanoes sit on plate edges.' }, { layout: 'two', title: 'Two kinds', left: { heading: 'Shield', bullets: ['Gentle lava', 'Wide and low'] }, right: { heading: 'Stratovolcano', bullets: ['Explosive', 'Tall and steep'] } }, { layout: 'big', title: '1,350', subtitle: 'active volcanoes on Earth' }, { layout: 'quote', text: 'The Earth is not finished.', by: 'A geologist' }] }) + '\n```\n';
const DATA = 'Here are the results.\n\n```data\n' + JSON.stringify({ title: 'Marks', columns: ['Name', 'Maths', 'Science'], rows: [['Ada', 91, 88], ['Ben', 62, 70], ['Cy', 75, 59], ['Dee', 83, 94], ['Eli', 48, 52]] }) + '\n```\n';
const RUNJS = 'Try this:\n\n```js\nconst xs = [1, 2, 3, 4];\nconsole.log(xs.map((x) => x * x));\nconsole.error("a warning");\nreturn xs.reduce((a, b) => a + b, 0);\n```\n\n```js\nwhile (true) {}\n```\n';
const CHECK = JSON.stringify({ findings: [
  { line: 3, endLine: null, severity: 'error', title: 'The loop goes one step too far', why: 'i <= numbers.length reads one item past the end, which gives undefined.', idea: 'Stop before the length with <.', replace: { from: 3, to: 3, text: '  for (let i = 0; i < numbers.length; i++) {' } },
  { line: 6, endLine: null, severity: 'tip', title: 'Say what an empty list gives', why: 'Dividing by zero gives NaN when the list is empty.', idea: 'Return 0 when there are no numbers.', replace: null },
], summary: 'Two things to look at. The first one changes your answer.' });

const PIC64 = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAAeklEQVR4nO3QMQ0AIADAMIShE4+4wAEPBzuaTMDSsdfUpfH9IB4gQIAAAQoHCBAgQIDCAQIECBCgcIAAAQIEKBwgQIAAAQoHCBAgQIDCAQIECBCgcIAAAQIEKBwgQIAAAQoHCBAgQIDCAQIECBCgcIAAAQIEKBwgQG8dbxeKaLwekSEAAAAASUVORK5CYII=';
const FX = ['# Why the sky is blue', '', '::: center big pop', 'Sunlight is scattered, and blue scatters most.', ':::', '', 'The air bends short waves far more than long ones, so [blue]{.wave .blue} light reaches your eyes from every direction.', '', '## The short version', '', '::: key pulse', 'Short waves scatter more. Blue is a short wave.', ':::', '', '::: steps', '1. Sunlight enters the air.', '2. Blue light is scattered the most.', '3. You see blue from all around.', ':::', '', '::: tip', 'At sunset the light travels through more air, so the blue is used up and red is left.', ':::', '', '::: warn', 'Never look straight at the sun.', ':::', '', 'This is [the key idea]{.highlight} and **bold** words stand out too.', '', '![A flat orange square](data:image/png;base64,' + PIC64 + ')', ''].join('\n');
const MAPREPLY = 'Here are three good places by the water.\n\n```map\n{"title":"Around Ipswich Waterfront","places":[{"name":"Ipswich Waterfront","lat":52.0527,"lng":1.1600,"note":"Marina and cafes","kind":"waterfront"},{"name":"Christchurch Park","lat":52.0640,"lng":1.1650,"note":"Big park with a mansion","kind":"park","address":"Soane St"},{"name":"Ipswich Station","lat":52.0504,"lng":1.1443,"note":"Trains to London","kind":"station"}]}\n```\n';
const PLACESREPLY = 'Here are three good places by the water.\n\n```places\n{"title":"Around Ipswich Waterfront","places":[{"name":"Ipswich Waterfront","lat":52.0527,"lng":1.1600,"note":"Marina and cafes, lovely at sunset","kind":"waterfront"},{"name":"Christchurch Park","lat":52.0640,"lng":1.1650,"note":"Big park with a mansion and a free museum","kind":"park","address":"Soane St"},{"name":"Ipswich Station","lat":52.0504,"lng":1.1443,"note":"Trains to London","kind":"station"}]}\n```\n';
const ASKREPLY = 'Before I write the quiz, a quick question.\n\n```ask\n{"questions":[{"id":"level","type":"choice","question":"How hard should the quiz be?","options":["Easy","Medium","Hard"]},{"id":"count","type":"slider","question":"How many questions?","min":5,"max":30,"step":5,"unit":"questions","default":10},{"id":"topics","type":"multi","question":"Which topics?","options":["Cells","Genetics","Ecology"]}]}\n```\n';

/** The commands, for the Owner tab. */
export const TRIGGERS: { name: string; what: string }[] = [
 {
  "name": "TRIGGER-APP",
  "what": "Opens a PMC app and draws in it"
 },
 {
  "name": "TRIGGER-ASK",
  "what": "Coe asks you questions with buttons"
 },
 {
  "name": "TRIGGER-CASE",
  "what": "Opens Case Converter"
 },
 {
  "name": "TRIGGER-CODE",
  "what": "A code check answer"
 },
 {
  "name": "TRIGGER-CUTCODE",
  "what": "Code that is cut off"
 },
 {
  "name": "TRIGGER-DATA",
  "what": "A data table"
 },
 {
  "name": "TRIGGER-DECK",
  "what": "A slide deck"
 },
 {
  "name": "TRIGGER-DOC",
  "what": "Drafts a Google Doc"
 },
 {
  "name": "TRIGGER-ECODE",
  "what": "Writes a code file in the editor"
 },
 {
  "name": "TRIGGER-EDATA",
  "what": "Writes a table in the editor"
 },
 {
  "name": "TRIGGER-EDOC",
  "what": "Writes a document in the editor"
 },
 {
  "name": "TRIGGER-EEDIT",
  "what": "Edits a line in the document it made"
 },
 {
  "name": "TRIGGER-EMPTY",
  "what": "An empty reply"
 },
 {
  "name": "TRIGGER-EOPEN",
  "what": "Opens the document in the editor"
 },
 {
  "name": "TRIGGER-EREAD",
  "what": "Reads what is open in the editor"
 },
 {
  "name": "TRIGGER-EWEB",
  "what": "Writes a web page in the editor"
 },
 {
  "name": "TRIGGER-FILES",
  "what": "Starts a multi-file project"
 },
 {
  "name": "TRIGGER-FOLD",
  "what": "Folded sections"
 },
 {
  "name": "TRIGGER-FU",
  "what": "An answer with follow-up buttons"
 },
 {
  "name": "TRIGGER-FX",
  "what": "Every box, colour and effect"
 },
 {
  "name": "TRIGGER-IMG",
  "what": "Makes a picture"
 },
 {
  "name": "TRIGGER-IMGBAD",
  "what": "A picture that is made badly"
 },
 {
  "name": "TRIGGER-IMGFAIL",
  "what": "A picture that cannot be made"
 },
 {
  "name": "TRIGGER-JS",
  "what": "Runs JavaScript"
 },
 {
  "name": "TRIGGER-JSBAD",
  "what": "JavaScript that fails"
 },
 {
  "name": "TRIGGER-LONG",
  "what": "A very long answer (Show more and the scroll)"
 },
 {
  "name": "TRIGGER-MAP",
  "what": "A map with pins and cards"
 },
 {
  "name": "TRIGGER-MATHS",
  "what": "The exact maths tool"
 },
 {
  "name": "TRIGGER-PIN",
  "what": "Coe pins the chat"
 },
 {
  "name": "TRIGGER-PIXEL",
  "what": "Opens Pixel Art Maker"
 },
 {
  "name": "TRIGGER-PLACES",
  "what": "Place cards"
 },
 {
  "name": "TRIGGER-QS",
  "what": "Question cards for a worksheet"
 },
 {
  "name": "TRIGGER-RENAME",
  "what": "Coe renames the chat"
 },
 {
  "name": "TRIGGER-RUN",
  "what": "Code you can run"
 },
 {
  "name": "TRIGGER-SEARCH",
  "what": "Searches the web"
 },
 {
  "name": "TRIGGER-SHEET",
  "what": "Drafts a Google Sheet"
 },
 {
  "name": "TRIGGER-SHOW",
  "what": "Maths, chemistry, a graph and a diagram together"
 },
 {
  "name": "TRIGGER-SLIDES",
  "what": "Drafts Google Slides"
 },
 {
  "name": "TRIGGER-SLOW",
  "what": "A slow reply (7 seconds of thinking)"
 },
 {
  "name": "TRIGGER-STUDY",
  "what": "Everything the Study screen makes"
 },
 {
  "name": "TRIGGER-WORK",
  "what": "A plan and a long job"
 },
 {
  "name": "TRIGGER-WS",
  "what": "Starts a workspace project"
 }
];


export const SLOW_MS = 7000;
/** The command at the start of a message, or ''. */
export const triggerOf = (text: string): string => { const m = /^\s*TRIGGER-([A-Z]+)\b/.exec(String(text || '')); return m && TRIGGERS.some((t) => t.name === 'TRIGGER-' + m[1]) ? m[1] : ''; };
/** The canned reply for the message the person typed. nres is how many tool results have come back so far (tools run for real, then Coe answers again). text is the last message sent. */
export function triggerReply(real: string, nres: number, text: string): string | null {
  const failedM = /\[Result of the (\w+) tool\]\s*FAILED\. ([\s\S]*?)(?: Nothing was made or done\.|$)/.exec(text);
  return false ? ''

    : /TRIGGER-EDOC/.test(real) ? (nres === 0 ? 'I will write that in the editor.\n\n' + tool({ tool: 'editor', action: 'create', kind: 'doc', title: 'Volcano essay', content: '# Volcanoes\n\nA volcano is an opening in the Earth\'s crust where **hot rock**, ash and gas escape.\n\n## Three kinds\n\n- Shield volcanoes\n- Cone volcanoes\n- Supervolcanoes\n\n| Kind | Example |\n| --- | --- |\n| Shield | Mauna Loa |\n| Cone | Mount Fuji |\n\n> The word comes from Vulcan, the Roman god of fire.\n' }) : 'I wrote the essay. It is ready to open.')
    : /TRIGGER-EEDIT/.test(real) ? (nres === 0 ? tool({ tool: 'editor', action: 'edit', id: 'Volcano', find: 'Mauna Loa', replace: 'Mauna Kea' }) : nres === 1 ? tool({ tool: 'editor', action: 'append', id: 'Volcano', content: '## Quick fact\n\nThere are about 1,350 potentially active volcanoes.' }) : 'I changed one word and added a quick fact.')
    : /TRIGGER-ECODE/.test(real) ? (nres === 0 ? tool({ tool: 'editor', action: 'create', kind: 'code', title: 'squares.js', lang: 'javascript', content: 'const xs = [1, 2, 3, 4];\nconsole.log(xs.map((x) => x * x));\n' }) : 'Made a small script. Press Run to try it.')
    : /TRIGGER-EWEB/.test(real) ? (nres === 0 ? tool({ tool: 'editor', action: 'create', kind: 'web', title: 'Counter page', content: '<!doctype html><html><head><meta charset="utf-8"><title>Counter</title><style>body{font-family:sans-serif;background:#F2E4CE;text-align:center;padding:40px}button{font-size:24px;padding:12px 24px;background:#337957;color:#fff;border:4px solid #171717}</style></head><body><h1>Counter</h1><p id="n">0</p><button id="b">Add one</button><script>var n=0;document.getElementById("b").onclick=function(){document.getElementById("n").textContent=++n}<\/script></body></html>' }) : nres === 1 ? tool({ tool: 'screenshot', id: 'Counter', width: 'phone' }) : 'I checked the page on a phone-sized screen and it looks right.')
    : /TRIGGER-EDATA/.test(real) ? (nres === 0 ? tool({ tool: 'editor', action: 'create', kind: 'data', title: 'Marks table', content: 'Name,Maths,Science\nAda,92,88\nBen,75,81\nCy,64,70\nDee,88,95\n' }) : 'I made a small table of marks.')
    : /TRIGGER-EREAD/.test(real) ? (nres === 0 ? tool({ tool: 'read' }) : 'That is everything I can see.')
    : /TRIGGER-EOPEN/.test(real) ? (nres === 0 ? tool({ tool: 'editor', action: 'open', id: 'Volcano' }) : 'It is open for you.')
    : /TRIGGER-QS/.test(real) ? 'Here are your questions.\n\n```questions\n{"title":"Maths worksheet","items":[{"q":"Work out 6 × 7.","answer":"42","working":"6 × 7 = 42"},{"q":"Which of these is a prime number?","options":["9","15","7","21"],"answer":"7","working":"7 only divides by 1 and 7."},{"q":"Why is the sky blue?","answer":"Air scatters blue light most.","working":"Short waves scatter more than long ones.","sure":"low"}]}\n```\n'
    : /TRIGGER-LONG/.test(real) ? ('Here is the long version.\n\n' + Array.from({length: 40}, (_, i) => `Paragraph ${i + 1}. This is a sentence that makes the answer long enough to need the Show all button.`).join('\n\n') + '\n')
    : /TRIGGER-FOLD/.test(real) ? 'Short answer first.\n\n:::fold The options\n- One\n- Two\n- Three\n:::\n\n:::fold Sources\nSome notes in a fold with `code`.\n:::\n'
    : /TRIGGER-FILES/.test(real) ? (nres === 0 ? 'Starting the project.\n\n' + tool({ tool: 'workspace', action: 'write', path: 'src/app/main.js', content: 'console.log(1)' }) : nres === 1 ? tool({ tool: 'workspace', action: 'write', path: 'src/lib/util.js', content: 'export const a = 1;' }) : nres === 2 ? tool({ tool: 'workspace', action: 'mkdir', path: 'docs' }) : nres === 3 ? tool({ tool: 'workspace', action: 'search', q: 'console' }) : 'Made the folders src/app, src/lib and docs.')
    : /TRIGGER-RENAME/.test(real) ? (nres === 0 ? 'Renaming.\n\n' + tool({ tool: 'chat', action: 'rename', title: 'Renamed By Coe' }) : 'Done, it is now called Renamed By Coe.')
    : /TRIGGER-PIN/.test(real) ? (nres === 0 ? tool({ tool: 'chat', action: 'pin' }) : 'Pinned.')
    : /TRIGGER-FX/.test(real) ? FX
    : /TRIGGER-PLACES/.test(real) ? PLACESREPLY
    : /TRIGGER-MAP/.test(real) ? MAPREPLY
    : /TRIGGER-APP/.test(real) ? (nres === 0 ? 'I can draw that for you in the Pixel Art Maker.\n\n' + tool({ tool: 'pmc_app', slug: 'pixel-art-maker' }) : 'The Pixel Art Maker is open. Draw your sprite there, and ask me when you want a change.')
    : /TRIGGER-ASK/.test(real) ? ASKREPLY
    : /TRIGGER-FU/.test(real) ? FU
    : /TRIGGER-DECK/.test(real) ? DECK
    : /TRIGGER-DATA/.test(real) ? DATA
    : /TRIGGER-RUN/.test(real) ? RUNJS
    : /TRIGGER-SHOW/.test(real) ? SHOW
    : /TRIGGER-STUDY/.test(real) ? STUDY
    : /TRIGGER-MATHS/.test(real) ? (nres === 0 ? 'I will solve it exactly.\n\n' + tool({ tool: 'maths', op: 'solve', expr: 'x^2 - 5*x + 6 = 0', var: 'x' }) : nres === 1 ? 'Now the integral.\n\n' + tool({ tool: 'maths', op: 'integrate', expr: 'x^2*sin(x)', var: 'x' }) : 'So $x = 2$ or $x = 3$, and the integral is as shown above.')
    : /TRIGGER-JS(?!BAD)/.test(real) ? (nres === 0 ? 'Let me work that out exactly.\n\n' + tool({ tool: 'js', code: "let s=0;for(let i=1;i<=100;i++)s+=i;console.log('sum',s);return s*2" }) : 'The sum of 1 to 100 is **5050**, and doubled it is **10100**.')
    : /TRIGGER-SEARCH/.test(real) ? (nres === 0 ? 'I will look that up.\n\n' + tool({ tool: 'search', q: 'latest PMC Studios news' }) : 'From the search: PMC Studios makes Mini Mayhem. Source: example.com.')
    : /TRIGGER-IMGFAIL/.test(real) ? (nres === 0 ? 'Drawing it now.\n\n' + tool({ tool: 'image', prompt: 'FAILIMG a green phoenix' }) : failedM ? `I couldn't make the picture. ${failedM[2]}` : 'Here is your picture.')
    : /TRIGGER-IMGBAD/.test(real) ? (nres === 0 ? 'Drawing it now.\n\n' + tool({ tool: 'image', prompt: 'FAILIMG A green phoenix made of flat colour blocks' }) : 'Here is your picture. Want it brighter?')
    : /TRIGGER-IMG/.test(real) ? (nres === 0 ? 'Drawing it now.\n\n' + tool({ tool: 'image', prompt: 'A green phoenix made of flat colour blocks' }) : failedM ? `I couldn't make the picture. ${failedM[2]}` : 'Here is your picture. Want it brighter?')
    : /TRIGGER-JSBAD/.test(real) ? (nres === 0 ? 'Running it.\n\n' + tool({ tool: 'js', code: "throw new Error('boom: the list is empty')" }) : failedM ? `I couldn't run that code. ${failedM[2]}` : 'It ran fine.')
    : /TRIGGER-CUTCODE/.test(real) ? 'Here is the start of the program.\n\n```python\ndef big():\n    total = 0\n    for i in range(10):\n        total += i\n'
    : /TRIGGER-EMPTY/.test(real) ? ' '
    : /TRIGGER-DOC/.test(real) ? (nres === 0 ? 'Here is a draft ready to put in Google Docs.\n\n' + tool({ tool: 'google_doc', title: 'Study plan', markdown: '# Study plan\n\nA short plan for **this week**.\n\n## Monday\n- Maths: algebra\n- Read chapter 3\n\n## Tuesday\n1. Past paper\n2. Mark it\n\nSee [PMC](https://pmcstudios.uk).' }) : 'Done.')
    : /TRIGGER-SHEET/.test(real) ? (nres === 0 ? tool({ tool: 'google_sheet', title: 'Budget', sheets: [{ name: 'Month', rows: [['Item', 'Cost'], ['Rent', 600], ['Food', 220], ['Total', '=SUM(B2:B3)']] }] }) : 'Done.')
    : /TRIGGER-SLIDES/.test(real) ? (nres === 0 ? tool({ tool: 'google_slides', title: 'Volcanoes', slides: [{ title: 'Volcanoes' }, { title: 'How they form', bullets: ['Plates move', 'Magma rises', 'Pressure builds'] }, { title: 'Types', bullets: ['Shield', 'Cone', 'Caldera'] }] }) : 'Done.')
    : /TRIGGER-PIXEL/.test(real) ? (nres === 0 ? 'Opening Pixel Art Maker.\n\n' + tool({ tool: 'pmc_app', slug: 'pixel-art-maker' }) : nres === 1 ? 'Now I will draw a beating heart in two frames.\n\n' + tool({ tool: 'pmc_app', slug: 'pixel-art-maker', call: { load: { palette: { a: '#a33a2b' }, frames: [HEART, HEART2], fps: 4 } }, click: ['GIF'] }) : 'Your heart animation is ready. Save the GIF from the card.')
    : /TRIGGER-CASE/.test(real) ? (nres === 0 ? tool({ tool: 'pmc_app', slug: 'case-converter' }) : nres === 1 ? tool({ tool: 'pmc_app', slug: 'case-converter', fill: { 'Text': 'hello coe world' }, click: ['UPPER'] }) : 'Converted it with the Case Converter.')
    : /TRIGGER-WS/.test(real) ? (nres === 0 ? 'I will start the project.\n\n' + tool({ tool: 'workspace', action: 'write', path: 'index.html', content: '<!doctype html><link rel=stylesheet href=style.css><h1 id=t>Clicker</h1><button id=b>Click me</button><p id=n>0</p><script src=app.js></script>' }) : nres === 1 ? tool({ tool: 'workspace', action: 'write', path: 'style.css', content: 'body{font-family:sans-serif;background:#F2E4CE;text-align:center;padding:40px}button{font-size:24px;padding:10px 20px;background:#337957;color:#fff;border:3px solid #171717}h1{color:#1A4934}' }) : nres === 2 ? tool({ tool: 'workspace', action: 'write', path: 'app.js', content: 'let n=0;document.getElementById("b").onclick=()=>{n++;document.getElementById("n").textContent=n}' }) : nres === 3 ? tool({ tool: 'workspace', action: 'preview', path: 'index.html' }) : 'The clicker page is built: index.html, style.css and app.js. Press Click me in the preview.')
    : /TRIGGER-CODE/.test(real) ? 'The mistake is on line 1: a function line needs a colon at the end. Here is your code with that fixed, and a clearer name.\n\n```python\ndef total(items):\n    s = 0\n    for i in items:\n        s += i\n    return s\n\n\nprint(total([1, 2, 3]))\n```\n\nIt prints 6.'
    : /TRIGGER-WORK/.test(real) ? (nres === 0 ? 'Here is my plan.\n\n```coe-plan\n{"steps":["Work out the answer","Check it by running code","Write it up"],"done":0}\n```\n\n' + tool({ tool: 'js', code: 'return [1,2,3,4,5].reduce((a,b)=>a*b)' }) : '```coe-plan\n{"steps":["Work out the answer","Check it by running code","Write it up"],"done":3}\n```\n\nThe product is **120**. I checked it by running code.')

    : /TRIGGER-SLOW/.test(real) ? REPLY
    : null;
}
