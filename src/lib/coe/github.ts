/**
 * GitHub, through a token the person gives (kept in this browser) or the one from signing in with GitHub.
 * Reading runs straight away. Anything that changes a repository waits for the person to press a button.
 */
import { links, setGithub } from './links';

const API = 'https://api.github.com';
const hdr = (t: string) => ({ authorization: `Bearer ${t}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' });
const token = () => links().github?.token ?? '';

async function gh(path: string, init: RequestInit = {}, t = token()): Promise<any> {
  if (!t) throw new Error('GitHub is not connected. Add a token in Settings > Connections.');
  const r = await fetch(path.startsWith('http') ? path : API + path, { ...init, headers: { ...hdr(t), ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string> | undefined) } });
  if (!r.ok) {
    let m = ''; try { m = (await r.json())?.message || ''; } catch { /* none */ }
    if (r.status === 401) { setGithub(undefined); throw new Error('GitHub did not accept the token. It may have expired. Add a new one in Settings > Connections.'); }
    if (r.status === 403 && /rate limit/i.test(m)) throw new Error('GitHub says too many requests. Try again in a minute.');
    if (r.status === 403 || r.status === 404) throw new Error((m || 'Not found') + '. The token may not have access to that repository, or may need permission to write.');
    if (r.status === 422) throw new Error(m || 'GitHub could not use that.');
    throw new Error(m || `GitHub said no (${r.status}).`);
  }
  return r.status === 204 ? null : r.json();
}

/** Checks a token and keeps it. */
export async function connectGithub(t: string, kind: 'token' | 'signin' = 'token') {
  const tok = t.trim(); if (!tok) throw new Error('Paste a token first.');
  const u = await gh('/user', {}, tok);
  setGithub({ token: tok, login: u.login, kind }); return u.login as string;
}

const utf8 = (b64: string) => { const bin = atob(b64.replace(/\s/g, '')), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); };
const b64 = (s: string) => { const u = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < u.length; i += 8192) bin += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(bin); };
const repoOk = (r: unknown) => { const s = String(r || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''); if (!/^[\w.-]+\/[\w.-]+$/.test(s)) throw new Error('Name the repository as owner/name.'); return s; };

export async function repos(): Promise<string> {
  const l = await gh('/user/repos?sort=updated&per_page=40&affiliation=owner,collaborator,organization_member');
  return (l as any[]).map((r) => `${r.full_name}${r.private ? ' (private)' : ''} - ${r.description || 'no description'} [default branch ${r.default_branch}]`).join('\n') || 'No repositories.';
}

export async function tree(repo: string, ref = ''): Promise<string> {
  const r = repoOk(repo); const info = await gh(`/repos/${r}`); const br = ref || info.default_branch;
  const t = await gh(`/repos/${r}/git/trees/${encodeURIComponent(br)}?recursive=1`);
  const files = (t.tree as any[]).filter((x) => x.type === 'blob').map((x) => `${x.path} (${x.size ?? 0})`);
  return `${r} @ ${br}: ${files.length} files${t.truncated ? ' (list cut short)' : ''}\n` + files.slice(0, 500).join('\n');
}

export async function readFile(repo: string, path: string, ref = ''): Promise<string> {
  const r = repoOk(repo); const p = String(path || '').replace(/^\/+/, '');
  const j = await gh(`/repos/${r}/contents/${p.split('/').map(encodeURIComponent).join('/')}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`);
  if (Array.isArray(j)) return j.map((x) => `${x.type === 'dir' ? '[dir] ' : ''}${x.path}`).join('\n');
  if (j.encoding !== 'base64') throw new Error('That file is too big to read here.');
  const text = utf8(j.content);
  return text.length > 60000 ? text.slice(0, 60000) + `\n[... cut: ${text.length - 60000} more characters]` : text;
}

export async function searchCode(q: string, repo = ''): Promise<string> {
  const r = repo ? ' repo:' + repoOk(repo) : ' user:' + (links().github?.login ?? '');
  const j = await gh(`/search/code?per_page=15&q=${encodeURIComponent(q + r)}`);
  return (j.items as any[]).map((i) => `${i.repository.full_name}: ${i.path}`).join('\n') || 'Nothing found.';
}

export interface Change { path: string; content?: string; delete?: boolean }
export interface CommitIn { repo: string; branch?: string; message: string; files: Change[]; pr?: { title: string; body?: string; base?: string } }

/** One commit with every file in it. A branch that does not exist is made from the default branch. */
export async function commit(a: CommitIn): Promise<{ url: string; pr?: string }> {
  const r = repoOk(a.repo); const info = await gh(`/repos/${r}`); const base = a.pr?.base || info.default_branch;
  const branch = (a.branch || info.default_branch).replace(/^refs\/heads\//, '');
  if (!a.files?.length) throw new Error('There are no files to commit.');
  let head: any;
  try { head = await gh(`/repos/${r}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`); }
  catch (e) {
    if (branch === info.default_branch) throw e;
    const from = await gh(`/repos/${r}/git/ref/heads/${encodeURIComponent(base)}`);
    head = await gh(`/repos/${r}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: from.object.sha }) });
  }
  const parent = await gh(`/repos/${r}/git/commits/${head.object.sha}`);
  const entries: any[] = [];
  for (const f of a.files.slice(0, 60)) {
    const path = f.path.replace(/^\/+/, ''); if (!path || path.includes('..')) throw new Error('A file path is not allowed: ' + f.path);
    if (f.delete) entries.push({ path, mode: '100644', type: 'blob', sha: null });
    else { const bl = await gh(`/repos/${r}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: b64(f.content ?? ''), encoding: 'base64' }) }); entries.push({ path, mode: '100644', type: 'blob', sha: bl.sha }); }
  }
  const tr = await gh(`/repos/${r}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }) });
  const c = await gh(`/repos/${r}/git/commits`, { method: 'POST', body: JSON.stringify({ message: a.message.slice(0, 500), tree: tr.sha, parents: [head.object.sha] }) });
  await gh(`/repos/${r}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
  let pr: string | undefined;
  if (a.pr && branch !== base) { const p = await gh(`/repos/${r}/pulls`, { method: 'POST', body: JSON.stringify({ title: a.pr.title.slice(0, 250), body: a.pr.body ?? '', head: branch, base }) }); pr = p.html_url; }
  return { url: `https://github.com/${r}/commit/${c.sha}`, pr };
}

export async function openIssue(repo: string, title: string, body = ''): Promise<string> {
  const j = await gh(`/repos/${repoOk(repo)}/issues`, { method: 'POST', body: JSON.stringify({ title: title.slice(0, 250), body }) });
  return j.html_url;
}
export async function openPull(repo: string, title: string, head: string, base: string, body = ''): Promise<string> {
  const r = repoOk(repo); const info = await gh(`/repos/${r}`);
  const j = await gh(`/repos/${r}/pulls`, { method: 'POST', body: JSON.stringify({ title: title.slice(0, 250), body, head, base: base || info.default_branch }) });
  return j.html_url;
}
