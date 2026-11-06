/**
 * Google Docs, Sheets and Slides, made live in the person's own Drive.
 * Sign-in is Google's own pop-up (Google Identity Services). The access it gives lasts about an hour and stays in this browser.
 * "make" only reaches files Coe creates. "read" also lets Coe read the person's existing Docs, Sheets and Slides.
 */
import { googleNow, links, setGoogle, type Google } from './links';

export const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();
export const googleAvailable = !!GOOGLE_CLIENT_ID;
const MAKE = 'https://www.googleapis.com/auth/drive.file';
const READ = ['https://www.googleapis.com/auth/documents.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/presentations.readonly'];

let script: Promise<void> | null = null;
const loadGsi = () => (script ??= new Promise<void>((res, rej) => {
  if ((window as any).google?.accounts?.oauth2) { res(); return; }
  const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => res(); s.onerror = () => { script = null; rej(new Error('Google could not be reached.')); };
  document.head.appendChild(s);
}));

/** Opens Google's pop-up. Must be called from a click. */
export async function connectGoogle(level: 'make' | 'read' = 'make'): Promise<Google> {
  if (!googleAvailable) throw new Error('Google is not set up for this site yet.');
  await loadGsi();
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: level === 'read' ? [MAKE, ...READ].join(' ') : MAKE,
      include_granted_scopes: true,
      callback: (r: { access_token?: string; expires_in?: number | string; error?: string; error_description?: string }) => {
        if (!r.access_token) { reject(new Error(r.error === 'access_denied' ? 'Google access was not allowed.' : r.error_description || 'Google did not give access.')); return; }
        const g: Google = { token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60_000, level, email: links().google?.email };
        setGoogle(g); resolve(g);
      },
      error_callback: (e: { type?: string }) => reject(new Error(e?.type === 'popup_closed' ? 'The Google window was closed.' : e?.type === 'popup_failed_to_open' ? 'The browser blocked the Google window. Allow pop-ups for this site and try again.' : 'Google did not give access.')),
    });
    client.requestAccessToken({ prompt: links().google ? '' : 'consent' });
  });
}
export function disconnectGoogle() {
  const g = links().google;
  try { (window as any).google?.accounts?.oauth2?.revoke?.(g?.token, () => {}); } catch { /* ignore */ }
  setGoogle(undefined);
}

async function api(url: string, init: RequestInit = {}, token?: string): Promise<any> {
  const t = token ?? googleNow()?.token; if (!t) throw new Error('Connect Google first (Settings > Connections), or press the Connect button.');
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) } });
  if (!r.ok) {
    let m = ''; try { m = (await r.json())?.error?.message || ''; } catch { /* none */ }
    if (r.status === 401) { setGoogle(undefined); throw new Error('Google access ran out. Connect Google again.'); }
    if (r.status === 403 && /not been used|disabled|enable/i.test(m)) throw new Error('A Google API is not switched on for this project yet. The owner needs to enable the Docs, Sheets and Slides APIs in Google Cloud.');
    if (r.status === 403 || r.status === 404) throw new Error(m || 'Google would not let Coe open that. It can only open files Coe made, unless you allow reading all your files.');
    throw new Error(m || `Google said no (${r.status}).`);
  }
  return r.json();
}

export const idFrom = (s: string): string => (String(s).match(/\/d\/([\w-]{15,})/) || String(s).match(/^([\w-]{25,})$/) || [])[1] || '';

// ---------------------------------------------------------------- Docs
interface Piece { text: string; style?: 'H1' | 'H2' | 'H3' | 'LI' | 'OL' | 'CODE'; bold: [number, number][]; links: [number, number, string][] }
/** A small Markdown reader: headings, bullet and numbered lists, bold, links, code blocks. Everything else is plain text. */
export function docPieces(md: string): Piece[] {
  const out: Piece[] = []; let code = false;
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    if (/^```/.test(raw)) { code = !code; continue; }
    let line = raw, style: Piece['style'];
    if (code) style = 'CODE';
    else if (/^#{1}\s/.test(line)) { style = 'H1'; line = line.replace(/^#\s+/, ''); }
    else if (/^##\s/.test(line)) { style = 'H2'; line = line.replace(/^##\s+/, ''); }
    else if (/^#{3,6}\s/.test(line)) { style = 'H3'; line = line.replace(/^#{3,6}\s+/, ''); }
    else if (/^\s*[-*•]\s+/.test(line)) { style = 'LI'; line = line.replace(/^\s*[-*•]\s+/, ''); }
    else if (/^\s*\d+[.)]\s+/.test(line)) { style = 'OL'; line = line.replace(/^\s*\d+[.)]\s+/, ''); }
    else if (/^\s*\|?[\s:|-]{3,}\|?\s*$/.test(line) && line.includes('-')) continue;      // a table's divider row
    else if (/^\s*\|.*\|\s*$/.test(line)) line = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join('   |   ');
    const p: Piece = { text: '', style, bold: [], links: [] };
    if (!code) {
      let rest = line;
      const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:[^)\s]+)\)|`([^`]+)`/;
      for (let m = re.exec(rest); m; m = re.exec(rest)) {
        p.text += rest.slice(0, m.index); const at = p.text.length;
        const t = m[1] ?? m[2] ?? m[4]; p.text += t;
        if (m[1]) p.bold.push([at, at + t.length]); if (m[2]) p.links.push([at, at + t.length, m[3]]);
        rest = rest.slice(m.index + m[0].length);
      }
      p.text += rest;
    } else p.text = line;
    out.push(p);
  }
  return out;
}

function docRequests(md: string, at: number): any[] {
  const ps = docPieces(md); if (!ps.length) return [];
  let text = '', pos = at; const reqs: any[] = [], marks: any[] = [];
  for (const p of ps) {
    const start = pos, body = p.text + '\n'; text += body; pos += body.length;
    const range = { startIndex: start, endIndex: pos };
    if (p.style === 'H1' || p.style === 'H2' || p.style === 'H3') marks.push({ updateParagraphStyle: { range, paragraphStyle: { namedStyleType: p.style === 'H1' ? 'HEADING_1' : p.style === 'H2' ? 'HEADING_2' : 'HEADING_3' }, fields: 'namedStyleType' } });
    if (p.style === 'CODE') marks.push({ updateTextStyle: { range: { startIndex: start, endIndex: pos - 1 }, textStyle: { weightedFontFamily: { fontFamily: 'Roboto Mono' }, backgroundColor: { color: { rgbColor: { red: .95, green: .95, blue: .95 } } } }, fields: 'weightedFontFamily,backgroundColor' } });
    for (const [a, b] of p.bold) marks.push({ updateTextStyle: { range: { startIndex: start + a, endIndex: start + b }, textStyle: { bold: true }, fields: 'bold' } });
    for (const [a, b, u] of p.links) marks.push({ updateTextStyle: { range: { startIndex: start + a, endIndex: start + b }, textStyle: { link: { url: u } }, fields: 'link' } });
  }
  reqs.push({ insertText: { location: { index: at }, text } });
  // Lists last, per run of items, so the text is already in place.
  let i = 0, p0 = at;
  const spans = ps.map((p) => { const s = p0; p0 += p.text.length + 1; return { s, e: p0, style: p.style }; });
  while (i < spans.length) {
    const st = spans[i].style;
    if (st === 'LI' || st === 'OL') { let j = i; while (j + 1 < spans.length && spans[j + 1].style === st) j++; marks.push({ createParagraphBullets: { range: { startIndex: spans[i].s, endIndex: spans[j].e }, bulletPreset: st === 'LI' ? 'BULLET_DISC_CIRCLE_SQUARE' : 'NUMBERED_DECIMAL_ALPHA_ROMAN' } }); i = j + 1; }
    else i++;
  }
  return [...reqs, ...marks];
}

export async function makeDoc(title: string, markdown: string): Promise<{ id: string; url: string }> {
  const d = await api('https://docs.googleapis.com/v1/documents', { method: 'POST', body: JSON.stringify({ title: title.slice(0, 200) || 'Untitled' }) });
  const requests = docRequests(markdown, 1);
  if (requests.length) await api(`https://docs.googleapis.com/v1/documents/${d.documentId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
  return { id: d.documentId, url: `https://docs.google.com/document/d/${d.documentId}/edit` };
}
export async function appendDoc(idOrUrl: string, markdown: string): Promise<{ id: string; url: string }> {
  const id = idFrom(idOrUrl); if (!id) throw new Error('That is not a Google Docs link.');
  const d = await api(`https://docs.googleapis.com/v1/documents/${id}?fields=body.content(endIndex)`);
  const end = Math.max(1, ((d.body?.content ?? [])[(d.body?.content?.length ?? 1) - 1]?.endIndex ?? 2) - 1);
  const requests = docRequests('\n' + markdown, end);
  await api(`https://docs.googleapis.com/v1/documents/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
  return { id, url: `https://docs.google.com/document/d/${id}/edit` };
}

// ---------------------------------------------------------------- Sheets
export interface SheetIn { name: string; rows: (string | number | boolean | null)[][] }
export async function makeSheet(title: string, sheets: SheetIn[]): Promise<{ id: string; url: string }> {
  const list = (sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }]).slice(0, 12).map((s, i) => ({ ...s, name: (s.name || `Sheet${i + 1}`).replace(/[\[\]*?:/\\]/g, ' ').slice(0, 90) }));
  const ss = await api('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', body: JSON.stringify({ properties: { title: title.slice(0, 200) || 'Untitled' }, sheets: list.map((s) => ({ properties: { title: s.name } })) }) });
  const data = list.filter((s) => s.rows.length).map((s) => ({ range: `'${s.name.replace(/'/g, "''")}'!A1`, values: s.rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : c))) }));
  if (data.length) await api(`https://sheets.googleapis.com/v4/spreadsheets/${ss.spreadsheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) });
  // A bold, frozen first row on each sheet, and columns that fit.
  const reqs: any[] = [];
  (ss.sheets as any[]).forEach((sh, i) => {
    const id = sh.properties.sheetId, cols = Math.max(1, ...list[i].rows.map((r) => r.length));
    if (!list[i].rows.length) return;
    reqs.push({ repeatCell: { range: { sheetId: id, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: .9, green: .93, blue: .9 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } });
    reqs.push({ updateSheetProperties: { properties: { sheetId: id, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });
    reqs.push({ autoResizeDimensions: { dimensions: { sheetId: id, dimension: 'COLUMNS', startIndex: 0, endIndex: cols } } });
  });
  if (reqs.length) await api(`https://sheets.googleapis.com/v4/spreadsheets/${ss.spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: reqs }) }).catch(() => {});
  return { id: ss.spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${ss.spreadsheetId}/edit` };
}

// ---------------------------------------------------------------- Slides
export interface SlideIn { title: string; bullets?: string[]; text?: string }
export async function makeSlides(title: string, slides: SlideIn[]): Promise<{ id: string; url: string }> {
  const list = slides.slice(0, 60);
  const p = await api('https://slides.googleapis.com/v1/presentations', { method: 'POST', body: JSON.stringify({ title: title.slice(0, 200) || 'Untitled' }) });
  const first = p.slides?.[0]?.objectId as string | undefined;
  const reqs: any[] = [];
  list.forEach((s, i) => {
    const cover = i === 0, t = `s${i}_t`, b = `s${i}_b`;
    reqs.push({ createSlide: { objectId: `s${i}`, slideLayoutReference: { predefinedLayout: cover ? 'TITLE' : 'TITLE_AND_BODY' }, placeholderIdMappings: [{ layoutPlaceholder: { type: cover ? 'CENTERED_TITLE' : 'TITLE', index: 0 }, objectId: t }, { layoutPlaceholder: { type: cover ? 'SUBTITLE' : 'BODY', index: 0 }, objectId: b }] } });
    reqs.push({ insertText: { objectId: t, text: (s.title || ' ').slice(0, 300) } });
    const body = (s.bullets?.length ? s.bullets.map((x) => String(x)).join('\n') : s.text || '').slice(0, 3000);
    if (body) { reqs.push({ insertText: { objectId: b, text: body } }); if (!cover && s.bullets?.length) reqs.push({ createParagraphBullets: { objectId: b, textRange: { type: 'ALL' }, bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE' } }); }
  });
  if (first) reqs.push({ deleteObject: { objectId: first } });
  if (reqs.length) await api(`https://slides.googleapis.com/v1/presentations/${p.presentationId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: reqs }) });
  return { id: p.presentationId, url: `https://docs.google.com/presentation/d/${p.presentationId}/edit` };
}

// ---------------------------------------------------------------- reading what is already there
export async function readGoogle(idOrUrl: string): Promise<{ kind: 'doc' | 'sheet' | 'slides'; title: string; text: string }> {
  const s = String(idOrUrl), id = idFrom(s); if (!id) throw new Error('That is not a link to a Google Doc, Sheet or Slides file.');
  if (/\/spreadsheets\//.test(s)) {
    const meta = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties.title`);
    let text = '';
    for (const sh of (meta.sheets as any[]).slice(0, 6)) {
      const v = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("'" + sh.properties.title.replace(/'/g, "''") + "'")}?majorDimension=ROWS`);
      text += `## ${sh.properties.title}\n` + ((v.values ?? []) as unknown[][]).slice(0, 400).map((r) => r.join('\t')).join('\n') + '\n\n';
    }
    return { kind: 'sheet', title: meta.properties.title, text };
  }
  if (/\/presentation\//.test(s)) {
    const p = await api(`https://slides.googleapis.com/v1/presentations/${id}`);
    const text = ((p.slides ?? []) as any[]).map((sl, i) => `## Slide ${i + 1}\n` + ((sl.pageElements ?? []) as any[]).flatMap((e) => (e.shape?.text?.textElements ?? []).map((t: any) => t.textRun?.content ?? '')).join('').trim()).join('\n\n');
    return { kind: 'slides', title: p.title, text };
  }
  const d = await api(`https://docs.googleapis.com/v1/documents/${id}`);
  const text = ((d.body?.content ?? []) as any[]).map((b) => (b.paragraph?.elements ?? []).map((e: any) => e.textRun?.content ?? '').join('')).join('');
  return { kind: 'doc', title: d.title, text };
}
