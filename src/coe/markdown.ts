/** Replies are written in Markdown. This turns them into safe HTML, with a copy button on every block of code. */
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
        return `<div class="cx-code"><div class="cx-code-top"><span>${esc(l || 'code')}</span><button type="button" data-copy>Copy</button></div><pre><code>${esc(text)}</code></pre></div>`;
      },
      link({ href, title, text }: { href: string; title?: string | null; text: string }) {
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''} target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
    },
  });
  marked = m.marked; purify = p.default;
  purify.addHook('afterSanitizeAttributes', (node) => { if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); } });
}

export function renderMarkdown(text: string): string {
  if (!marked || !purify) return esc(text).replace(/\n/g, '<br>');
  try { return purify.sanitize(marked.parse(text, { async: false }) as string, { ADD_ATTR: ['data-copy', 'target'] }); }
  catch { return esc(text).replace(/\n/g, '<br>'); }
}
