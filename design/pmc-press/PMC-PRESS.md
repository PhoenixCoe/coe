# PMC Press

The design system of every PMC app (edition 2, the app edition). This file is the brand book and the component notes in one place, so a new app can be built from it without opening anything else. The same content, with live previews of every component, is in the PMC Press Design System artifact.

## Kit contents

- `pmc-press.css`: fonts, tokens, the four leads, base rules and every component. One `<link>` and an `<html data-lead="cream">` is enough.
- `pmc-press.js`: `fitAccent`, `accentCss`, `applyAccent`, the ten accents and the eight looks. Plain JavaScript, no dependencies.
- `tokens.json`: every token with its usage note (colours per lead, type styles, spacing, radius, shadows, frames).
- `fonts/`: PMC Header, PMC Font (and Upright), PMC Symbols L2 and L4, JetBrains Mono (OFL licence beside it), and the two open fallbacks (Big Shoulders Display, IBM Plex Mono).
- `logos/`: Coe star, wordmark, favicon, iOS icon, PMC mark (ink and cream).
- `demo.html`: every control on one page with a lead and accent picker. Open it through a local server (`npx serve design/pmc-press`), because it loads a module.

Source of truth: Coe's `src/app/globals.css` and `src/lib/coe/look.ts`. If they change, change this kit and the design system in the same sitting.

---

PMC Press is the design system of every PMC app: Coe, Coe Mini, the PMC Account site, and whatever comes next. It looks like flat ink on paper: solid blocks of colour, square corners, heavy frames, and a hard offset shadow under everything that can be pressed, like a print that is slightly out of register. The name is that look. Coe's own stylesheet is the source; when this book and Coe disagree, Coe is right and this book is wrong.

PMC Press has two editions. **Edition 2, the app edition, is this book.** Edition 1 is the pmcstudios.uk website, which shares the fonts, the green and the cream but moves bigger on hover (the box jumps up and left, the shadow grows from 7px to 11px) and has its own guide.

## Start a new app

Do these in order. Each takes minutes.

1. Copy `pmc-press.css` and the `fonts/` folder from the kit into the app (`design/pmc-press/` in the Coe repo). Link the stylesheet in `<head>`. It already holds the tokens, the four leads, the base rules and every component in this system.
2. Set `<html lang="en" data-lead="cream">`. Do not set any other colour on `html` or `body`.
3. Build with the classes in the component list: `.btn`, `.plate`, `.seg`, `.sel`, `.swt`, `.sld`, `.set-tab`, `.cx-modal`, `.cx-code`. Do not invent a second button or a second card.
4. Wire the four leads and the accent (see Colour) to a Look setting, and store the choice on the device.
5. Add the logo files from Logos: the favicon, the 180px iOS icon (`coe-apple-touch-icon.png` is the model, a full-bleed square with the mark and no transparency) and the wordmark.
6. Add `prefers-reduced-motion` and the `data-motion` switch before adding any animation (see Motion).
7. Open the app on a phone at 390px wide, on all four leads, with the accent set to Graphite and to Orange. If anything is unreadable, fix the token, not the component.
8. Tell Coe: add the app to its changelog and to the list of PMC apps it knows about.

## Content fundamentals

- Write short, plain sentences. Say what happened and what to do next: "Your reply is ready." "Coe is taking a while." "Check your email." "Only used to check this address."
- Speak to the person as "you". Name the app by its name when it is the one acting ("Coe is taking a while."), never "the system" or "we".
- Write all copy in sentence case in the source. The display face turns headings, buttons, tabs and labels into capitals by style (`text-transform: uppercase`); do not type capitals yourself.
- A button names the action: "Sign in", "Send code", "Reload", "Fix and reload", "Copy". Never "Click here", "Submit", "OK".
- Errors say what went wrong in plain words and offer the fix on a button. No codes in the sentence; the code can sit in a smaller line under it.
- No emoji. Icons are drawn (see Iconography). Keep exclamation marks out of interface copy.
- Numbers use the units the person knows ("2 of 5", "42%").
- Names: write **PMC Header** and **PMC Font** for the two fonts, **PMC Account** for the sign-in, **Coe Mini** for the browser extension.

## Visual foundations

### Colour

- Pages are made of `paper` (the page), `cream` (one step raised), `tint` (soft accent) and `ink` (everything you read and every frame). The accent is `g1`, and only `g1`: one accent per app.
- Set text in `ink` on `paper`, `cream` and `tint`. Set text in `cream` on `ink`, `g1` and `g2`. Set text in white on `danger`.
- Cream on `g1` is 4.2:1 on the cream lead. That is the real PMC green and it stays: use it only for display-face labels (buttons, tabs, title bars), never for running text.
- `g2` is the shadow colour. `g3` is the light accent for text and ticks on the dark pages. `gold` is the highlight: text selection, slider handle, keyboard ring, flash outline. Never set text in `gold` and never fill a surface with it.
- `danger` is for errors, stop and delete. On the gold lead it is 3.1:1 on `paper`, so there it marks bars and icons only.
- A **lead** is the page colour. There are four, chosen in Look settings and set on `html[data-lead]`: `cream` (default), `ink` (dark), `gold` (warm) and `green` (shown to people as "Theme": the page takes the accent, darkened). Components use tokens only and each lead redefines them. Do not add a fifth.
- **Accent.** A person can pick any accent. The app stores one hex and derives the rest. Ten are offered: Green `#337957` (the default), Teal `#1F7A7A`, Blue `#2B6CB0`, Indigo `#4C51BF`, Purple `#7B4FA3`, Rose `#B83B6E`, Red `#B03A2E`, Orange `#B85C1E`, Brown `#7A5A2E`, Graphite `#3F4750`. Eight ready-made looks pair a lead with an accent: PMC, Ocean, Berry, Sunset, Night, Forest, Lilac, Mono.
- **Fit the accent first.** White text must stay readable on it: darken the accent by mixing 10% black, repeatedly (up to 12 times), until `1.05 / (luminance + 0.05)` reaches 4.5. Then derive: `g1` = accent, `g2` = accent mixed 42% toward black, `g3` = accent mixed 42% toward white, `tint` = accent mixed 84% toward white. On the ink lead use `g1` = accent mixed 30% toward white, `g2` = the accent, `tint` = accent mixed 70% toward `#141414`. On the gold lead `g1` is the dark one (accent 42% toward black) and `g3` is that mixed 40% toward black. On the Theme lead `paper` is the accent 42% toward black, `cream` 62% toward black, `tint` is `paper` 12% toward white, `g1` is the accent 50% toward white, `g2` 78% toward black and `g3` 62% toward white. A ready snippet that does all of this is `pmc-press.js` in the kit.
- Contrast: ink on paper 16.6:1 (cream lead), 14.7 (ink), 6.6 (gold), 8.2 (green); `g1` on paper 4.9, 6.1, 3.8, 5.2. Treat 3.8 as a rule or icon colour, not a text colour. High contrast (`data-contrast="high"`) forces 100% opacity on small text and 3px `ink` frames everywhere.

### Type

- Two faces, both PMC's own. **PMC Header** (display) is set in capitals, weight 400, for headings, buttons, tabs, labels and dropdown names. **PMC Font** (text) is set in normal case for everything that is read as a sentence. Use the Upright cut in the interface.
- The Symbols faces (`PMC Symbols L2`, `L4`, `L4 Upright`) sit first in each stack; they only carry punctuation glyphs and fall through to the real face for letters. Keep them first.
- Code is JetBrains Mono with ligatures on.
- The root is **13.5px**, so 1rem is 13.5px, and body is 1.05rem on a 1.65 line. Use rem for every size; people scale the app from 75% to 150% (`data-scale`), and phones and iPads start smaller (about 90% and 85%).
- Headings: `display-xl` (h1, up to 6rem, line 0.86, one per page), `display-l` (h2, up to 3.4rem), `display-m` (plate titles, up to 1.6rem), `display-s` (h3, 1.7rem). Buttons 1.1rem; labels 1.15rem at 80% opacity. Hints 0.88rem. Never go below 0.78rem.
- Paragraphs stop at 66 characters. Headings never get letter-spacing wider than 0.03em; display-face labels use 0.03em.
- Never fake bold or italic (`font-synthesis: none`). Emphasis is a colour or a frame, not a weight.

### Frames, shadows, radii

- Nothing is rounded. Radius is 0 on every box, field, button, tag, menu, scrollbar and switch. A circle appears only in a drawn icon or the loader.
- Frames are solid: 2px on buttons, bubbles and code; 3px on fields, plates, menus, dropdowns, tabs, switches and the segmented bar; 4px on dialogs and the sidebar divider.
- Every raised thing has a hard shadow with zero blur, down and to the right. Sizes by height above the page: button 3px (`shadow-btn`), plate 5px, menu 8px, dialog 10px; ink shadows (`shadow-ink` 4px, `shadow-ink-sm` 3px) for the segmented bar, dropdown, switch, tabs and slider handle. Never blur, never a gradient shadow, never an inner shadow.
- A shadow grows when you reach for it (hover: button 3 to 5px, plate 5 to 8px) and shrinks when you press (2px). It is colour `g2`, except in the dark sidebar where it is `g1`.

### Spacing and layout

- Steps in use: 4, 8, 12, 16, 20, 30px (`space-1` to `space-6`). Stay on them. Dialog body padding is 20px (14px on phones); message gap is 18px.
- The app is a grid: a 240px `cream` sidebar with a 4px `ink` right rule, a 46px top bar with a 3px bottom rule, a message column up to 780px, and a composer with a 3px frame and a 6px `g2` shadow that turns `g1` on focus.
- Page headings sit in a title block: a plain `paper` field, `display-xl` text, and a halftone in the top right corner. Colour blocks run edge to edge; do not put a block inside a rounded card (there are none).
- On a phone the sidebar becomes a drawer with an 8px `g2` shadow to its right, tabs keep only the label of the chosen tab, and buttons wrap their text. Nothing scrolls sideways.

### Pattern and imagery

- The only pattern is the **halftone**: comic-book dots, 13px grid, three sizes fading into each other, top right (`.ht`). One per screen. See Halftone.
- There are no photographs, illustrations or gradients in the interface. Colour comes from flat blocks. A picture shown by the app (a generated image) sits in a 3px `ink` frame with a 4px `g2` shadow.

### Motion

- Two easings: `--e` `cubic-bezier(0.7, 0, 0.2, 1)` (a heavy ease, for blocks sliding) and `--x` `cubic-bezier(0.16, 1, 0.3, 1)` (a quick ease-out, for things appearing). Entrances use `up` (10px, 0.14 to 0.2s) for overlays and `rise` (36px, 0.6 to 0.9s) for tiles and messages.
- Press and hover transitions are 0.1s; the pressed state is 0.04s.
- Respect `prefers-reduced-motion` and the in-app switch `data-motion="calm"` (slow decorative loops to 6s, stop shakes and glows) or `"off"` (all animation and transitions end in 0.001s). Add both before shipping any animation.
- Sound is optional and off by default for new apps.

### States

- Hover: fill flips to `ink` with `cream` text, or `cream`/`tint` for light controls. Focus: a 4px `g1` outline 3px away on `:focus-visible` (3px `gold` inside segmented buttons). Press: the shadow shrinks. Disabled: 40 to 55% opacity, no pointer events. Selected: `ink` fill, `cream` text (tabs, segmented) or `tint` fill (dropdown rows).
- Selection highlight is `gold` with `ink` text.

### Density and accessibility

- `data-density="compact"` tightens message gaps and dialog padding; `"easy"` widens them, makes touch targets 46px and loosens line height to 1.8.
- Every control is reachable by keyboard and has a visible focus ring. Switches, tabs, segmented bars and lists carry the right ARIA roles (see each component).
- Text must hold 4.5:1 on its ground on all four leads, except the cream-on-`g1` pair above.

## Iconography

- Interface icons are drawn, not fonts: a 24x24 grid, 2.4px stroke, `stroke-linecap: square`, `stroke-linejoin: miter`, `fill: none`, colour `currentColor`. They are square-ended on purpose: a line where a curve is not needed. Default size 20px (a plate icon is 20px, the loader star is large).
- Keep the set small and literal: mail, calendar, note, trophy, target, timer, wave. Draw a new one on the same grid in the same stroke; do not import another icon set.
- The 4-point star is Coe's mark and may spin in the loader.
- No emoji, no icon fonts, no filled glyph sets.

## Logos

- Logos are in the Logos asset group. Use the PMC mark in `ink` on light pages and the cream version on `ink` or `green`. Use the Coe star in `#337957` (it keeps its colour on every lead) and the wordmark (ink letters, green star).
- The favicon is the star on a square; the iOS icon is a full-bleed 180px PNG with no transparency. Do not stretch, outline, shadow or recolour a logo.
- All logo SVGs here are drawn with fixed fills, so they display through `<img>`. The PMC mark is `#171717`; the cream mark is `#F2E4CE`.

## Do and don't

- Do put the primary action in a `.btn.primary`, once per screen. Don't use two.
- Do keep every corner square. Don't add `border-radius`, `backdrop-filter` or `filter: drop-shadow`.
- Do use `ink` for every frame. Don't tint a frame, don't use a 1px hairline except inline code.
- Do change colour by changing the lead or the accent. Don't type a hex in a component.
- Do use a halftone once. Don't tile it.
- Do call the fonts PMC Header and PMC Font. Don't use Impact or any other face except as the listed fallback.
- Do build on the classes here. Don't copy a component and change its radius, shadow or frame to "fit".

## Known differences from Coe

- bundle.css adds one rule to Coe's: `.btn:active:not([disabled])` drops the shadow to 2px. In Coe's own stylesheet the hover rule matches `:active` in weight and comes later, so the press only shows on touch. Coe's own stylesheet does not have it yet.
- Class names beginning `cx-` (messages, dialog, toast, menu, code block) are Coe's chat classes. Reuse the look, rename them to taste in a new app only if you keep every value.
- Plate title size scales with the viewport (`clamp(1.2rem, 1.7vw, 1.6rem)`); the token holds the top of that range.


---

## Components

Class names are Coe's. All of them are in `pmc-press.css`.

### Button

One square, framed button in four variants and two sizes: a 2px frame in the text colour, a hard 3px shadow in `g2`, set in the display face in capitals (`button` style). It is the only way anything in a PMC app is "clicked"; links are links, everything else that acts is a `.btn`.

**Variants**
- `.btn` (ghost): the default. Transparent, frame and text in `ink`. Hover fills it with `ink`.
- `.btn.primary`: one per screen, the thing the person came to do. `ink` fill, `cream` text, 1.25rem. Hover turns the fill `g1`.
- `.btn.gold`: accent fill (`g1`) with `cream` text. Despite the class name it is the accent, not gold. Use for the second-most important action.
- `.btn.danger`: `danger` fill, white text. Destructive only.
- `.btn.small`: 0.95rem, 2px shadow. Inside rows, dialogs and bars.
- `disabled` (attribute): 40% opacity, no pointer events, no shadow.

**Rules**
- Label is a verb or a short noun phrase: "Sign in", "Reload", "Fix and reload". Never "Click here".
- Put the icon first, 8px gap. Icons are 20px stroke icons that inherit `currentColor`.
- Never round it, never add blur, never add a gradient. The shadow colour is `g2` (or `g1` inside the dark sidebar), nothing else.
- Buttons wrap and centre their text (`white-space: normal`) so a long label never breaks the layout on a phone.
- Minimum touch height is 40px; the `easy` density setting raises it to 46px.
- Press: `.btn:active` drops the shadow to 2px. Coe's own stylesheet loses this on a mouse (its hover rule is as strong and later); bundle.css carries the one-line fix.

### Field

Text fields are a square `paper` box with a 3px `ink` frame and no shadow at rest. On focus the outline goes and a 5px hard shadow in `g1` (`shadow-focus`) appears: the field "lifts" the way a button does, in the accent colour.

**Rules**
- Cover `input[type=text|search|password]`, `select` and `textarea` with the base rule in bundle.css; do not restyle per page.
- Text is the text face (`body`), never the display face, and is never forced to capitals.
- Padding is 10px 12px; font size inherits (1.05rem on the 13.5px root).
- Labels sit above, in the `label` style. Help text under the field is `hint` (0.88rem, 80% opacity). An error is a sentence in `danger` with a 10px left bar, not a red field.
- Placeholders are examples ("Name"), not instructions.
- A field never has a radius. A search field is the same box with an icon inside a `.cx-find`-style wrapper (3px frame, `paper`, shadow `shadow-focus` on `:focus-within`).

### Select

The dropdown replaces the browser's `<select>` everywhere: a display-face button with a 3px frame and a 4px `ink` shadow, opening a `cream` list with a 3px frame and an 8px `g2` shadow.

**States**
- Closed: `paper` fill; hover `cream`.
- Open (`.sel.open`): `tint` fill, shadow turns `g1`, the chevron turns over.
- Row: `.sel-o`; chosen row `.on` (`tint` fill, a tick in `g2`); keyboard or hover row `.at` (`ink` fill, `cream` text).
- Each row can carry a second line (`.sel-h`, text face, 0.86rem) and a badge (`.sel-badge`, `ink` on `cream`).

**Rules**
- Use it whenever the person picks one of 3 or more things. For 2 to 4 short options that fit on one line, use the Segmented bar instead.
- Option names are display-face capitals; the help line is normal case.
- The list opens below the button and matches its width; on phones the button is 50px tall for a thumb.
- Keyboard: arrows move `.at`, Enter picks, Escape closes. Always render `aria-haspopup`, `role="listbox"` and `aria-selected`.

### Switch

A square on/off control: a 58x32 track with a 3px frame and 3px `ink` shadow, and a square knob that slides 26px. Off is a `paper` track with an `ink` knob; on is a `g1` track with a `cream` knob.

**Rules**
- A switch applies immediately. If the change needs a Save, use a checkbox row or a button instead.
- The label (`.swt-l`) is the display face in capitals and says what turns on ("Sound effects"), never "Enable ...". One optional help line (`.swt-h`, 0.88rem) under it.
- The label is clickable and the track has `role="switch"` with `aria-checked`.
- Disabled rows (`.off`) fade to 50% and say why in the help line.
- Turning something on that needs the browser's permission (notifications) asks for it at that moment, not on page load.

### Slider

A range input redrawn square: a 14px track with a 3px frame, filled with `g1` up to the handle (the filled part follows the CSS variable `--p`, set in script from the value), and a square `gold` handle with a 3px frame and 3px shadow. While dragging the handle turns `cream`.

**Rules**
- Always show the current value in the pill on the right (`.sld-v`, `ink` fill, display face) as words if the number alone means little ("Large", not "2").
- Put tap marks (`.sld-marks`) under it for 3 to 5 named stops; the handle snaps.
- Set `--p` on the `.sld` element on every `input` event; Firefox draws its own progress and needs no variable.
- Keyboard: arrows step, Home and End jump.

### Segmented

A row of 2 to 4 buttons sharing one 3px `ink` frame and a 4px `ink` shadow. The chosen button is `ink` with `cream` text; others are `paper` and tint to `cream` on hover. A 3px `ink` rule separates the buttons.

**Rules**
- For choices that are visible all at once and short ("Cream / Ink / Gold / Theme", "Compact / Normal / Easy"). More than 4 or long names: use a dropdown.
- Behaves as a radio group: one on, always. `role="radiogroup"` on the bar, `role="radio"` and `aria-checked` on each button.
- The optional sliding thumb (`.seg-thumb`, 0.26s ease-out) sits behind the labels once the bar has `.ready`; without script the bar still works.
- Keyboard focus draws a 3px `gold` ring inside the button.
- It is a sibling of Select: same height class of control, same ink shadow. Put them side by side without changing either.

### Tabs

Tabs switch between panes of one page, such as the settings dialog. Each tab is a boxed button: 3px `ink` frame, `paper` fill, 3px `ink` shadow, an icon and a display-face label. The chosen tab is `ink` with `cream` text and its shadow turns `g1`.

**Rules**
- 3 to 8 tabs. They wrap onto a second row on wide screens and scroll sideways on phones; on phones only the chosen tab keeps its label, the others show the icon alone (keep the label in `<span>` so this works).
- Icon first, 7px gap, 20px.
- `role="tablist"`, `role="tab"`, `aria-selected`. Arrow keys move between tabs.
- Do not use tabs for navigating between pages: those are plain links in the sidebar or top bar.

### Plate

A plate is the PMC tile: a clickable box of flat colour with a 3px frame, a hard 5px shadow, a 20px icon, a display-face title and a one-line help. It is how a PMC app offers "things you can start" (home screen, tools, settings groups).

**Colourways** (set by class; they set `--bg`, `--fg`, `--sh`)
- `.c0` `cream` / `ink` / shadow `g2`: the default.
- `.c1` `ink` / `cream` / shadow `g1`: the strong one. Use once or twice per grid.
- `.c2` `cream` / `g2` / shadow `ink`: the quiet one.
- `.c3` `ink` / `#D9C48E` / shadow `g2`: the warm one (gold text).
- `.c4` `g1` / white / shadow `ink`: the accent one.

**Rules**
- Mix at most three colourways per grid; keep them in a repeating order so the grid looks printed, not random.
- Hover grows the shadow to 8px; press drops it to 2px; focus draws a 4px `g1` outline 5px off the edge.
- On the ink and green leads the text colours of `.c2`, `.c3` and `.c4` swap to light-ground values (see the lead overrides in `pmc-press.css`).
- A plate is a button or a link, never both, and the whole tile is the target.
- Tiles enter with the `rise` animation (0.9s, `--x`); with motion off they appear at once.

### Message

Chat messages are boxes, not bubbles. The person's message sits on the right in an `ink` box with `cream` text; Coe's reply sits on the left in a `cream` box with a 2px `ink` frame, and the whole assistant row carries a 4px `g1` rule on its left edge. Both boxes take a 3px `g1` shadow (`shadow-bubble`).

**Rules**
- Text is the text face at 0.98rem on a 1.55 line, max width 780px for the list and 88% for a box. Long words break anywhere (`overflow-wrap: anywhere`).
- Assistant output may hold Markdown: links in `g2` underlined, quotes with a 6px `g1` bar, tables with 2px `ink` lines, code in a Code block.
- Gap between messages is 18px (`normal` density), 16px compact, 38px easy.
- New messages enter with `rise` (0.6s). `.flash` draws a 4px `gold` outline 10px away for a message the person jumped to.
- Never add avatars, timestamps or tails. The left rule is the only marker of who is speaking.
- A failed reply is an error row: 3px `danger` frame, 10px `danger` left bar, a sentence, and a Reload button.

### Dialog

A dialog is the biggest raised object in the system: a 4px `ink` frame, a `cream` body, a 10px `g2` shadow, and a title bar filled with `g1` carrying the title in `cream` at 2rem with a 4px `ink` rule under it. Dialogs open with the `up` animation (0.2s) over a dimmed page.

**Rules**
- Width 580px, `.wide` 880px, `.flush` (no padding, fixed height) for panes such as Settings. On phones they fill the screen minus 12px.
- Title bar: display-face title (one line, ellipsis), a Close button on the right. A `.ht` halftone can sit in the bar.
- Body is a grid with an 18px gap and 20px padding (14px on phones). Actions at the bottom: the primary button first.
- Escape and the Close button close it; focus is trapped inside and returns to the opener.
- One dialog at a time. Confirmation of a destructive action is a small dialog with the danger button, not a browser `confirm()`.

### Menu

A menu is a `cream` list with a 3px frame and an 8px `g2` shadow. Rows are display-face capitals; hover turns a row `ink`; the current choice is `tint`; a delete row is `danger` text that fills `danger` on hover. A heading row (`.cx-pop-h`) is `ink` with `cream` text. A 3px rule separates a group.

**Rules**
- Opens from a button, below it, on the same left edge; closes on Escape, outside click or pick.
- Rows are single-purpose actions. Anything that needs choosing a value is a dropdown (Select).
- Put the destructive row last, behind a rule.
- Badges (`b`) are `ink` on `cream`, 0.9rem, right-aligned.

### Toast

A toast confirms something the person just did, in one short line: an `ink` box with `cream` text, a 3px frame and a 5px `g2` shadow, centred near the bottom of the work area. It rises in (0.2s) and leaves after about 3 seconds.

**Rules**
- One sentence in normal case: "Copied to the clipboard." Not an exclamation, not a question.
- Never the only place an error is shown; errors stay on screen as an error row.
- No buttons inside a toast. If the person might want to act, it is not a toast.
- With motion off it appears without moving.

### CodeBlock

Code is always set in JetBrains Mono (Regular and Bold) with programming ligatures on. A block is an `ink` box with a 2px frame, a 3px `g2` shadow and a `g2` header strip that names the language in the display face and holds a Copy button (2px `currentColor` frame, fills `cream` on hover).

**Rules**
- Block text is 0.86rem on a 1.6 line, with 2-space tabs, horizontal scroll and a 340px max height. Never wrap code.
- Inline code is 0.9em, `cream` fill, a 1px hairline of `ink` at 35%; on dark leads the hairline is `cream` at 40%.
- On the ink and green leads the block darkens to `#0C0C0C` with a `cream` frame and the header strip takes the accent.
- The Copy button reads "Copy", then "Copied" for two seconds.

### Loader

The loader is a full `ink` screen shown while an app starts: the logo, a title with a running percentage in `tint`, a 12px bar with a 3px `cream` frame filled with `g1`, and one line of plain status. It fades in after one second so a fast start never flashes it.

**Rules**
- Show the real percentage if you have one, otherwise leave the bar out; never fake progress.
- After 8 seconds add a calm line ("Coe is taking a while.") and the two help buttons: Reload and Fix and reload.
- Respect reduced motion: the fade is replaced by a 0.01s one.
- The star in the logo may spin (`cmspin`); with motion off it holds still.

### Halftone

The halftone is PMC's one decorative pattern: comic-book dots on a 13px grid, big in a corner and shrinking until they melt into the page. It is three layers of the same grid (dots 3.9px, 2.7px and 1.5px) each masked to fade in as the last fades out, so no edge shows. Drawn with `radial-gradient` and masks only; no image.

**Rules**
- Markup: `<div class="ht" aria-hidden><i></i><i></i><i></i></div>` in a `position: relative; overflow: hidden` parent. Keep text above it with `z-index: 1`.
- The dots take `g1` at 42% opacity on a page, and `cream` at 30% in a title bar (`.ht-bar`, 300px wide).
- One halftone per screen, top right. Never a full-page fill, never behind body text.
- It is decoration: hidden from assistive tech and switched off by `data-motion` only if it animates (it does not).

### Themes

A *lead* is the colour a page is led by. Every PMC app has four and a person picks one in Look settings; components never mention a lead, they only use the colour tokens, which each lead redefines.

- **Cream** (`#FBF6EC` page, ink text): the classic, and the default.
- **Ink** (`#141414` page, cream text): dark. The accent lightens so it keeps contrast.
- **Gold** (`#B49A57` page, ink text): warm. The accent goes dark green and shadows go `ink`.
- **Theme** (page is the accent itself, darkened): the page takes the person's accent colour. In Coe's UI this lead is called "Theme" and its id is `green`.

**Rules**
- Set the lead on `<html data-lead="ink">` in an app (`data-theme` in this system's previews). Do not hard-code colours in components; use `paper`, `cream`, `ink`, `tint`, `g1`, `g2`, `g3`, `gold` and `danger`.
- A fifth lead is a new design decision, not a setting: ask before adding one.
- Check every new component on all four leads before shipping.

---

## Logos

Files in `logos/`. Copy them as they are; never redraw, recolour or add a shadow.

- `coe-star.svg`: Coe's 4-point star, single ink `#337957` (the same on every lead). Use as the app mark, in the loader and as a bullet.
- `coe-wordmark.svg`: the Coe wordmark, letters `#171717` and a `#337957` star. Use on `paper` and `cream` pages; on `ink` and `green` pages place it on a `cream` block.
- `coe-favicon.svg`: Coe's browser tab icon, the star on a square (`#171717` ground with `#F2E4CE`, `#337957` and `#1A4934` marks).
- `coe-apple-touch-icon.png`: the iOS home-screen icon, 180px, full bleed, no transparency.
- `pmc-mark.svg`: the PMC mark, single ink `#171717`. Use on light pages.
- `pmc-mark-cream.svg`: the PMC mark, single ink `#F2E4CE`. Use on `ink`, `green` and accent grounds.

Single-ink files cannot inherit `currentColor` through `<img>`; pick the file that matches the ground.
