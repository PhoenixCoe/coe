/** Replies are written in Markdown. This turns them into safe HTML, with a copy button on every block of code. */
import { fxClass, isBox, isColour, isEffect } from './fx';
type Marked = typeof import('marked');
type Purify = typeof import('dompurify');
let marked: Marked['marked'] | null = null, purify: Purify['default'] | null = null;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function loadMarkdown() {
  if (marked && purify) return;
  const [m, p] = await Promise.all([import('marked'), import('dompurify')]);
  m.marked.use({
    gfm: true, breaks: false,
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const l = (lang || '').split(/\s+/)[0].replace(/[^\w+#.-]/g, '');
        const run = /^(js|javascript|mjs|node)$/i.test(l) ? 'js' : /^(py|python|python3)$/i.test(l) ? 'py' : '';
        return `<div class="cx-code"><div class="cx-code-top"><span>${esc(l || 'code')}</span><span class="cx-code-btns">${run ? `<button type="button" data-run="${run}">Run</button>` : ''}<button type="button" data-copy>Copy</button></span></div><pre><code>${esc(text)}</code></pre></div>`;
      },
      link({ href, title, text }: { href: string; title?: string | null; text: string }) {
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''} target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
      // A picture: from the web (https), or one already in this chat, called pic:1, pic:2 and so on.
      image({ href, title, text }: { href: string; title?: string | null; text: string }) {
        const pic = /^pic:(\d{1,3})$/.exec(href.trim());
        if (pic) return `<img class="cx-img" data-pic="${pic[1]}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''}>`;
        if (!/^https:\/\//i.test(href.trim()) && !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(href.trim())) return esc(text);
        return `<img class="cx-img" src="${esc(href.trim())}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''}>`;
      },
    },
  });
  marked = m.marked; purify = p.default;
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
    // Only the looks Coe is meant to use: text effects, the boxes, and the code and picture frames. Nothing else can restyle the page.
    if (node.hasAttribute?.('class')) {
      const keep = (node.getAttribute('class') ?? '').split(/\s+/).filter((c) => fxClass(c) || /^cx-(code|code-top|code-btns|img)$/.test(c) || /^language-[\w+#.-]+$/.test(c) || c === 'sr');
      if (keep.length) node.setAttribute('class', keep.join(' ')); else node.removeAttribute('class');
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') ?? '';
      if (src && !/^https:\/\//i.test(src) && !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) node.removeAttribute('src');
      if (!src && !node.hasAttribute('data-pic')) node.remove?.();
      else { node.setAttribute('class', 'cx-img'); node.setAttribute('loading', 'lazy'); node.setAttribute('decoding', 'async'); node.setAttribute('referrerpolicy', 'no-referrer'); }
    }
  });
}

// ---------------------------------------------------------------- maths: $x^2$ inline, $$ ... $$ on its own. Drawn by KaTeX, which loads only when a reply has some.
let katex: typeof import('katex').default | null = null;
export const hasMath = (t: string) => /\$[^\s$][^$\n]*[^\s$\\]\$|\$\$[\s\S]+?\$\$|\\\(|\\\[/.test(t);
export async function loadMath() { if (katex) return; await import('katex/dist/katex.min.css'); katex = (await import('katex')).default; try { await import('katex/contrib/mhchem'); } catch { /* chemistry is an extra */ } }
/** One equation drawn as HTML, for the maths keyboard. */
export function texHtml(tex: string, display: boolean): string { if (!katex) return ''; try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html', trust: false, strict: 'ignore' }); } catch { return esc(tex); } }
function withMath(text: string): { text: string; put: (html: string) => string } {
  if (!katex || !hasMath(text)) return { text, put: (h) => h };
  const k = katex, bits: string[] = [];
  const draw = (tex: string, display: boolean) => { try { bits.push(k.renderToString(tex.trim(), { displayMode: display, throwOnError: false, output: 'htmlAndMathml', trust: false, maxExpand: 1000, strict: 'ignore' })); } catch { bits.push(esc(tex)); } return `@@M${bits.length - 1}@@`; };
  // Leave code alone.
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  const out = parts.map((p, i) => i % 2 ? p : p
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => draw(t, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => draw(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => draw(t, false))
    .replace(/(^|[^\\$\w])\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$(?![\w$])/g, (_, pre, t) => (/^\d/.test(t) && !/[\\^_{}=+\-*/]/.test(t) ? _ : pre + draw(t, false))));
  return { text: out.join(''), put: (h) => h.replace(/@@M(\d+)@@/g, (_, n) => bits[+n] ?? '') };
}

/** A picture drawn with SVG code, made safe: no scripts, no outside links. */
export function cleanSvg(code: string): string | null {
  if (!purify) return null;
  const s = purify.sanitize(code, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['script', 'foreignObject', 'iframe'], FORBID_ATTR: ['onload', 'onclick', 'onerror'] });
  return /<svg[\s>]/i.test(s) ? s : null;
}

// ---------------------------------------------------------------- text effects: [words]{.pop .gold} and ::: centre / key / tip ... :::
const letters = (t: string) => Array.from(t).slice(0, 40).map((ch) => (ch === ' ' ? '<i class="fx-sp"> </i>' : `<i class="fx-l">${esc(ch)}</i>`)).join('');
function inlineFx(p: string): string {
  return p.replace(/\[([^\[\]\n]{1,200}?)\]\{((?:\s*\.[a-z-]+)+)\s*\}/g, (all, inner: string, spec: string) => {
    const names = spec.split('.').map((x) => x.trim()).filter(Boolean);
    const fx = names.filter(isEffect).slice(0, 3), col = names.filter(isColour).slice(0, 1);
    if (!fx.length && !col.length) return inner;
    const cls = ['fx-s', ...fx.map((n) => 'fx-' + n), ...col.map((n) => 'fx-' + n)].join(' ');
    const split = fx.some((n) => n === 'wave' || n === 'bounce') && /^[^*_`<>\\$@\[\]]{1,40}$/.test(inner);
    return split ? `<span class="${cls}"><span class="sr">${esc(inner)}</span><span aria-hidden="true">${letters(inner)}</span></span>` : `<span class="${cls}">${inner}</span>`;
  });
}
function blockFx(p: string): string {
  return p
    .replace(/^[ \t]{0,3}:::[ \t]*([a-z][a-z -]*?)[ \t]*$/gm, (all, spec: string) => {
      const names = spec.split(/\s+/).filter(Boolean);
      const box = names.filter(isBox).slice(0, 2), fx = names.filter(isEffect).slice(0, 2), col = names.filter(isColour).slice(0, 1);
      if (!box.length && !fx.length && !col.length) return all;
      const cls = ['fx-box', ...box.map((n) => 'fx-' + n), ...fx.map((n) => 'fx-' + n), ...col.map((n) => 'fx-' + n)].join(' ');
      return `\n<div class="${cls}">\n\n`;
    })
    .replace(/^[ \t]{0,3}:::[ \t]*$/gm, '\n\n</div>\n');
}
/** Applies the text effects everywhere except inside code. */
export function withEffects(text: string): string {
  if (!/:::|\]\{/.test(text)) return text;
  return text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]+`)/g).map((p, i) => (i % 2 ? p : inlineFx(blockFx(p)))).join('');
}

export function renderMarkdown(text: string, effects = true): string {
  if (!marked || !purify) return esc(text).replace(/\n/g, '<br>');
  try {
    const m = withMath(text);
    const src = effects ? withEffects(m.text) : m.text.replace(/^[ \t]{0,3}:::.*$/gm, '').replace(/\[([^\[\]\n]{1,200}?)\]\{(?:\s*\.[a-z-]+)+\s*\}/g, '$1');
    return m.put(purify.sanitize(marked.parse(src, { async: false }) as string, { ADD_ATTR: ['data-copy', 'data-run', 'data-pic', 'target', 'aria-hidden'], FORBID_ATTR: ['style'], FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'button'].filter((t) => t !== 'button') }));
  }
  catch { return esc(text).replace(/\n/g, '<br>'); }
}
