/** Real parsers, loaded only when needed. They give the exact place of the first syntax error. */
export type Kind = 'babel' | 'ts' | 'css' | 'html';
export interface Syn { line: number; col: number; message: string }

export async function syntaxError(code: string, kind: Kind): Promise<Syn | null | 'off'> {
  try {
    const prettier = await import('prettier/standalone');
    const plugins: unknown[] =
      kind === 'babel' ? [await import('prettier/plugins/babel'), await import('prettier/plugins/estree')]
      : kind === 'ts' ? [await import('prettier/plugins/typescript'), await import('prettier/plugins/estree')]
      : kind === 'css' ? [await import('prettier/plugins/postcss')]
      : [await import('prettier/plugins/html'), await import('prettier/plugins/babel'), await import('prettier/plugins/estree'), await import('prettier/plugins/postcss')];
    const parser = kind === 'babel' ? 'babel' : kind === 'ts' ? 'typescript' : kind;
    try { await prettier.format(code, { parser, plugins: plugins as never[] }); return null; }
    catch (e) {
      const err = e as { loc?: { start?: { line: number; column: number } }; message?: string };
      const message = String(err.message ?? 'Syntax error').split('\n')[0].replace(/\s*\(\d+:\d+\)\s*$/, '').trim();
      const l = err.loc?.start;
      return { line: l?.line ?? 1, col: l?.column ?? 1, message };
    }
  } catch { return 'off'; }
}

/** Turns a parser's message into plain words. */
export function explain(message: string): { title: string; why: string; idea: string } {
  const m = message;
  let t: RegExpExecArray | null;
  if ((t = /Unterminated string|string literal/i.exec(m))) return { title: 'Quote is not closed', why: 'A piece of text starts with a quote and never ends.', idea: 'Add the matching quote at the end of the text.' };
  if (/Unterminated template/i.test(m)) return { title: 'Backtick is not closed', why: 'A template string starts with ` and never ends.', idea: 'Add the closing ` at the end.' };
  if (/Missing semicolon/i.test(m)) return { title: 'Missing ;', why: 'A statement ends here without a ; or a new line.', idea: 'Add ; here, or put the next part on a new line.' };
  if (/already been declared/i.test(m)) return { title: m.replace(/\.$/, ''), why: 'Two things share one name in the same place.', idea: 'Rename one of them, or remove the second declaration.' };
  if (/outside of function/i.test(m)) return { title: 'return is outside a function', why: 'return only works inside a function.', idea: 'Move it inside a function, or remove it.' };
  if (/await/i.test(m)) return { title: 'await is outside an async function', why: 'await only works inside a function marked async.', idea: 'Add async before the function.' };
  if ((t = /expected\s*"([^"]+)"/i.exec(m)) || (t = /'([^']+)' expected/i.exec(m)) || (t = /expected\s+'([^']+)'/i.exec(m))) return { title: `Missing ${t[1]}`, why: `A ${t[1]} was expected here and not found.`, idea: `Add ${t[1]} here, or check the bracket just before it.` };
  if (/Unexpected end|end of (input|file)/i.test(m)) return { title: 'The code stops too early', why: 'Something is still open at the end: a bracket, quote or block.', idea: 'Add the missing closing bracket at the end.' };
  if (/Unexpected token|Unexpected character|Expression expected|Declaration or statement expected|Identifier expected|Unexpected keyword|Unexpected reserved/i.test(m)) return { title: 'Something here does not fit', why: 'This part is not valid where it sits.', idea: 'Look at the characters just before it. A missing comma, bracket or operator is the usual cause.' };
  if (/Unclosed block|Unclosed bracket/i.test(m)) return { title: 'A { or ( is never closed', why: 'A block starts and never ends.', idea: 'Add the closing } or ) where the block should end.' };
  if (/Unclosed string/i.test(m)) return { title: 'Quote is not closed', why: 'A piece of text starts with a quote and never ends.', idea: 'Add the matching quote.' };
  if (/Unknown word|CssSyntaxError/i.test(m)) return { title: 'Something here is not valid CSS', why: 'This part does not look like a rule or a property.', idea: 'Check for a missing ; { or } just before it.' };
  if (/closing tag/i.test(m)) return { title: 'A closing tag has no match', why: 'A closing tag does not match any open tag.', idea: 'Remove it, or add the opening tag.' };
  return { title: m.replace(/\.$/, '') || 'Syntax error', why: 'The parser could not read this part.', idea: 'Check the characters at and just before this spot.' };
}
