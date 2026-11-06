/** Turns a slides block into a PowerPoint file. The library is only fetched when someone presses Save. */
import type { Deck, Slide } from './Slides';

export const PAIRS = {
  cream: { bg: 'F2E4CE', fg: '171717', ac: '337957' },
  ink: { bg: '171717', fg: 'F2E4CE', ac: 'B49A57' },
  green: { bg: '1A4934', fg: 'F2E4CE', ac: 'E8C98A' },
  gold: { bg: 'B49A57', fg: '171717', ac: 'F2E4CE' },
} as const;
export type PairName = keyof typeof PAIRS;
const ROTATE: PairName[] = ['cream', 'ink', 'green', 'gold'];
export const pairFor = (deck: Deck, i: number): (typeof PAIRS)[PairName] => {
  const t = deck.theme && deck.theme !== 'blocks' ? deck.theme : null;
  return PAIRS[t ?? ((i === 0 ? 'ink' : ROTATE[i % 4]) as PairName)];
};

const MAP: [RegExp, string][] = [[/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)'], [/\\sqrt\{([^}]*)\}/g, '√($1)'], [/\\cdot/g, '·'], [/\\times/g, '×'], [/\\pi/g, 'π'], [/\\theta/g, 'θ'], [/\\alpha/g, 'α'], [/\\beta/g, 'β'], [/\\pm/g, '±'], [/\\leq?/g, '≤'], [/\\geq?/g, '≥'], [/\\neq/g, '≠'], [/\\infty/g, '∞'], [/\\sum/g, 'Σ'], [/\\int/g, '∫'], [/\\to|\\rightarrow/g, '→'], [/\^2/g, '²'], [/\^3/g, '³'], [/[{}\\]/g, '']];
/** The words of a line, without Markdown or LaTeX marks. */
export const plain = (t: unknown) => { let s = String(t ?? ''); s = s.replace(/\$\$?([^$]+)\$\$?/g, (_, m) => MAP.reduce((a, [r, v]) => a.replace(r, v), m)); return s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim(); };

export async function deckToPptx(deck: Deck): Promise<Blob> {
  const mod = await import('pptxgenjs/dist/pptxgen.es.js');
  const P = (typeof mod.default === 'function' ? mod.default : mod.default?.default ?? (mod as any).PptxGenJS ?? mod) as new () => any;
  const pres = new P(); pres.layout = 'LAYOUT_16x9'; pres.title = plain(deck.title) || 'Slides'; pres.author = 'Coe';
  const W = 10, H = 5.625, HF = 'Arial Narrow', BF = 'Calibri';
  deck.slides.forEach((s: Slide, i: number) => {
    const c = pairFor(deck, i), sl = pres.addSlide(); sl.background = { color: c.bg };
    const lay = s.layout ?? (i === 0 ? 'title' : s.bullets?.length ? 'bullets' : s.left || s.right ? 'two' : s.text ? 'quote' : 'bullets');
    sl.addShape('rect', { x: 0, y: 0, w: 0.22, h: H, fill: { color: c.ac }, line: { color: c.ac, width: 0 } });
    const foot = () => sl.addText(`${plain(deck.title)}   ${i + 1} / ${deck.slides.length}`, { x: 0.6, y: H - 0.45, w: W - 1.2, h: 0.3, fontFace: BF, fontSize: 10, color: c.fg, transparency: 45 });
    if (lay === 'title') {
      sl.addText(plain(s.title).toUpperCase(), { x: 0.7, y: 1.5, w: W - 1.4, h: 1.9, fontFace: HF, bold: true, fontSize: 54, color: c.fg, valign: 'bottom', fit: 'shrink' });
      sl.addShape('rect', { x: 0.7, y: 3.55, w: 2.2, h: 0.12, fill: { color: c.ac }, line: { color: c.ac, width: 0 } });
      if (s.subtitle) sl.addText(plain(s.subtitle), { x: 0.7, y: 3.8, w: W - 1.4, h: 1, fontFace: BF, fontSize: 24, color: c.fg, valign: 'top', fit: 'shrink' });
    } else if (lay === 'big') {
      sl.addText(plain(s.title), { x: 0.6, y: 0.9, w: W - 1.2, h: 2.6, fontFace: HF, bold: true, fontSize: 96, color: c.ac === 'F2E4CE' ? c.fg : c.ac, align: 'center', valign: 'middle', fit: 'shrink' });
      if (s.subtitle) sl.addText(plain(s.subtitle), { x: 0.9, y: 3.6, w: W - 1.8, h: 1.2, fontFace: BF, fontSize: 26, color: c.fg, align: 'center', valign: 'top', fit: 'shrink' });
    } else if (lay === 'quote') {
      sl.addText('“' + plain(s.text ?? s.title) + '”', { x: 0.9, y: 0.9, w: W - 1.8, h: 3.2, fontFace: BF, italic: true, fontSize: 32, color: c.fg, valign: 'middle', fit: 'shrink' });
      if (s.by || s.title) sl.addText(plain(s.by ?? s.title), { x: 0.9, y: 4.2, w: W - 1.8, h: 0.6, fontFace: HF, bold: true, fontSize: 20, color: c.ac === 'F2E4CE' ? c.fg : c.ac });
    } else if (lay === 'two') {
      sl.addText(plain(s.title).toUpperCase(), { x: 0.6, y: 0.4, w: W - 1.2, h: 0.9, fontFace: HF, bold: true, fontSize: 32, color: c.fg, valign: 'middle', fit: 'shrink' });
      [s.left, s.right].forEach((side, k) => {
        if (!side) return; const x = 0.6 + k * ((W - 1.2) / 2 + 0.15), w = (W - 1.2) / 2 - 0.15;
        if (side.heading) sl.addText(plain(side.heading).toUpperCase(), { x, y: 1.5, w, h: 0.5, fontFace: HF, bold: true, fontSize: 20, color: c.ac === 'F2E4CE' ? c.fg : c.ac });
        sl.addText((side.bullets ?? []).map((b) => ({ text: plain(b), options: { bullet: { code: '25A0' }, breakLine: true } })), { x, y: 2.05, w, h: 3.0, fontFace: BF, fontSize: 18, color: c.fg, valign: 'top', paraSpaceAfter: 8, fit: 'shrink' });
      });
    } else {
      sl.addText(plain(s.title).toUpperCase(), { x: 0.6, y: 0.4, w: W - 1.2, h: 0.9, fontFace: HF, bold: true, fontSize: 32, color: c.fg, valign: 'middle', fit: 'shrink' });
      const items = (s.bullets ?? []).map((b) => ({ text: plain(b), options: { bullet: { code: '25A0' }, breakLine: true } }));
      if (items.length) sl.addText(items, { x: 0.6, y: 1.5, w: W - 1.2, h: 3.5, fontFace: BF, fontSize: items.length > 5 ? 20 : 24, color: c.fg, valign: 'top', paraSpaceAfter: 10, fit: 'shrink' });
      else if (s.text) sl.addText(plain(s.text), { x: 0.6, y: 1.5, w: W - 1.2, h: 3.5, fontFace: BF, fontSize: 24, color: c.fg, valign: 'top', fit: 'shrink' });
    }
    foot();
    if (s.notes) sl.addNotes(plain(s.notes));
  });
  return (await pres.write({ outputType: 'blob' })) as Blob;
}
