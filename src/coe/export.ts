/** Taking a chat away: as a web page, or printed to PDF. Maths and diagrams come out as they look on screen. */
import { renderMarkdown, loadMath } from './markdown';
import { wordsOf } from './Blocks';
import type { Conv } from './store';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function pageCss(): string {
  let css = '';
  for (const sh of Array.from(document.styleSheets)) { try { for (const r of Array.from(sh.cssRules)) css += r.cssText + '\n'; } catch { /* a sheet from another site cannot be read */ } }
  return css;
}
const STYLE = `
@page { margin: 16mm; }
body { font: 15px/1.6 Georgia, 'Times New Roman', serif; color: #171717; background: #fff; max-width: 780px; margin: 0 auto; padding: 24px; }
h1 { font: 700 1.7rem/1.2 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; border-bottom: 4px solid #171717; padding-bottom: 8px; }
.m { margin: 18px 0; break-inside: avoid-page; } .who { font: 700 0.8rem 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.08em; background: #171717; color: #F2E4CE; display: inline-block; padding: 2px 8px; margin-bottom: 6px; }
.u .who { background: #B49A57; color: #171717; }
.body { border-left: 5px solid #337957; padding-left: 12px; } .u .body { border-color: #B49A57; }
pre { background: #f3ead7; padding: 10px; overflow: auto; white-space: pre-wrap; font-size: 0.82rem; border: 2px solid #171717; } code { font-family: ui-monospace, Menlo, Consolas, monospace; }
table { border-collapse: collapse; } td, th { border: 1px solid #171717; padding: 4px 8px; } img { max-width: 100%; }
.cx-code-head, [data-copy] { display: none; }
.foot { margin-top: 28px; font-size: 0.8rem; opacity: 0.6; }
`;
export async function chatPage(c: Conv, name: (m: Conv['messages'][number]) => string): Promise<string> {
  await loadMath();
  const body = c.messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.text || m.images?.length)).map((m) => {
    const words = m.role === 'assistant' ? wordsOf(m.text) : m.text;
    const pics = (m.images ?? []).map((i) => `<img alt="${esc(i.name)}" src="data:${i.type};base64,${i.data}" style="max-height:260px;margin:4px 6px 4px 0">`).join('');
    return `<section class="m ${m.role === 'user' ? 'u' : 'c'}"><div class="who">${esc(name(m))}</div><div class="body">${pics}${m.role === 'user' ? `<p>${esc(words).replace(/\n/g, '<br>')}</p>` : renderMarkdown(words)}</div></section>`;
  }).join('\n');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)}</title><style>${pageCss()}</style><style>${STYLE}</style></head><body><h1>${esc(c.title)}</h1><p class="foot">${esc(new Date(c.created).toLocaleString())}. Made with Coe at coe.pmcstudios.uk.</p>${body}</body></html>`;
}

/** Opens the print box for the chat, where "Save as PDF" is one of the choices. */
export async function printChat(c: Conv, name: (m: Conv['messages'][number]) => string) {
  const html = await chatPage(c, name);
  const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  await new Promise<void>((res) => { f.onload = () => res(); f.srcdoc = html; });
  await new Promise((r) => setTimeout(r, 350));   // let the fonts and maths settle
  f.contentWindow?.focus(); f.contentWindow?.print();
  window.setTimeout(() => f.remove(), 60000);
}
