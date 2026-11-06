/**
 * Business and place details. They come from real sources only: Google Places through Coe's server when the owner has switched it on
 * (ratings, phone, website, hours, photo), otherwise OpenStreetMap (phone, website, hours when someone has added them) and a careful
 * Wikipedia photo match. The details are kept here, and the map cards read them from here, so the AI never has to write a rating or a phone number.
 */
import type { CoeSettings } from './settings';
import { modeOf } from './settings';

export interface PlaceInfo {
  name: string; lat: number; lng: number; kind?: string; address?: string;
  rating?: number; reviews?: number; price?: string; phone?: string; website?: string; email?: string;
  hours?: string[]; hoursText?: string; open?: boolean; summary?: string; mapsUrl?: string; closed?: string;
  photo?: string; photoBy?: string; wikipedia?: string; wikidata?: string;
  source: 'google' | 'osm';
}

const KEY = 'pmc:coe:places', MAX = 80;
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
export const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h));
};

let mem: PlaceInfo[] | null = null;
const load = (): PlaceInfo[] => { if (mem) return mem; try { const j = JSON.parse(localStorage.getItem(KEY) || '[]'); mem = Array.isArray(j) ? j : []; } catch { mem = []; } return mem!; };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(load().slice(-MAX))); } catch { /* storage blocked */ } };

/** Remember what was found. A newer look-up of the same place replaces the old one, keeping a photo if the new one has none. */
export function remember(list: PlaceInfo[]) {
  const all = load();
  for (const p of list) {
    const i = all.findIndex((o) => norm(o.name) === norm(p.name) && metres(o, p) < 400);
    if (i >= 0) { const old = all[i]; all[i] = { ...old, ...p, photo: p.photo ?? old.photo, photoBy: p.photo ? p.photoBy : old.photoBy }; } else all.push(p);
  }
  mem = all.slice(-MAX); save();
}
/** The details we hold for a place the AI put on a map: the same name (or one inside the other) and within about a mile and a half. */
export function recall(name: string, lat: number, lng: number): PlaceInfo | undefined {
  const n = norm(name); if (!n) return undefined;
  let best: PlaceInfo | undefined, bd = 1500;
  for (const p of load()) {
    const m = norm(p.name); if (!m) continue;
    if (!(m === n || m.includes(n) || n.includes(m))) continue;
    const d = metres(p, { lat, lng }); if (d < bd) { bd = d; best = p; }
  }
  return best;
}
export function setPhoto(p: PlaceInfo, photo: string, by: string) { const all = load(); const o = all.find((x) => norm(x.name) === norm(p.name) && metres(x, p) < 400); if (o) { o.photo = photo; o.photoBy = by; save(); } }

// ---------------------------------------------------------------- Coe's server (Google Places), when switched on
let serverOk: boolean | null = null;
const base = (s: CoeSettings) => s.serverUrl.trim().replace(/\/+$/, '');
async function viaServer(s: CoeSettings, q: string, near: [number, number] | null, radius: number, limit: number, signal?: AbortSignal): Promise<PlaceInfo[] | null> {
  if (serverOk === false || modeOf(s) !== 'server' || !base(s)) return null;
  try {
    const { serverPost } = await import('./billing');
    const r = await serverPost<{ places: (Omit<PlaceInfo, 'source' | 'photo'> & { photo?: string; website?: string })[] }>(s, '/places', { query: q, near: near ?? undefined, radius_km: radius, limit });
    serverOk = true;
    return (r.places || []).map((p) => ({ ...p, photo: p.photo ? (p.photo.startsWith('/') ? base(s) + p.photo : p.photo) : undefined, photoBy: p.photo ? 'Google' : undefined, source: 'google' as const }));
  } catch (e) {
    const err = e as { kind?: string; status?: number; message?: string }; if ((e as Error).name === 'AbortError') throw e;
    if (err.status === 501 || err.status === 404 || /not switched on/i.test(err.message || '')) serverOk = false;
    return null;                                    // anything else: fall back to OpenStreetMap
  }
}

// ---------------------------------------------------------------- OpenStreetMap
type Row = { display_name?: string; name?: string; lat: string; lon: string; category?: string; type?: string; extratags?: Record<string, string>; address?: Record<string, string> };
const nice = (s?: string) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : undefined);
const ok = (u?: string) => { if (!u) return undefined; const v = u.trim(); const w = /^https?:\/\//i.test(v) ? v : /^[\w.-]+\.[a-z]{2,}/i.test(v) ? 'https://' + v : ''; return w || undefined; };
async function viaOsm(q: string, near: [number, number] | null, radius: number, limit: number, signal?: AbortSignal): Promise<PlaceInfo[]> {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', q); u.searchParams.set('format', 'jsonv2'); u.searchParams.set('limit', String(limit)); u.searchParams.set('addressdetails', '1'); u.searchParams.set('extratags', '1'); u.searchParams.set('namedetails', '1');
  if (near && near.every(Number.isFinite)) { const d = Math.max(1, Math.min(200, radius)) / 111; u.searchParams.set('viewbox', [near[1] - d, near[0] + d, near[1] + d, near[0] - d].join(',')); }
  const r = await fetch(u, { signal, headers: { 'accept-language': 'en-GB,en;q=0.8' } });
  if (!r.ok) throw new Error('busy');
  const rows: Row[] = await r.json();
  return rows.map((p): PlaceInfo => {
    const t = p.extratags ?? {}, a = p.address ?? {};
    const road = [a.house_number, a.road].filter(Boolean).join(' '), town = a.city || a.town || a.village || a.suburb, address = [road, town, a.postcode].filter(Boolean).join(', ') || p.display_name || undefined;
    return {
      name: p.name || p.display_name?.split(',')[0] || 'Place', lat: Number(p.lat), lng: Number(p.lon), kind: nice(t.cuisine ? `${t.cuisine.split(';')[0].replace(/_/g, ' ')} ${p.type?.replace(/_/g, ' ') ?? ''}`.trim() : p.type),
      address, phone: t.phone || t['contact:phone'], website: ok(t.website || t['contact:website'] || t.url), email: t.email || t['contact:email'], hoursText: t.opening_hours,
      wikipedia: t.wikipedia, wikidata: t.wikidata, source: 'osm',
    };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/** Look places up, keep what was found for the map cards, and return it. */
export async function lookupPlaces(s: CoeSettings, q: string, o: { near?: [number, number] | null; radius?: number; limit?: number; signal?: AbortSignal } = {}): Promise<PlaceInfo[]> {
  const near = o.near ?? null, radius = o.radius ?? 15, limit = Math.max(1, Math.min(8, o.limit ?? 5));
  const g = await viaServer(s, q, near, radius, limit, o.signal);
  const list = g && g.length ? g : await viaOsm(q, near, radius, limit, o.signal);
  remember(list);
  return list;
}

// ---------------------------------------------------------------- a photo, only when we are sure it is the right place
const wiki = async (path: string, signal?: AbortSignal) => { const r = await fetch(path, { signal }); if (!r.ok) throw new Error('wiki'); return r.json(); };
const words = (s: string) => norm(s).split(' ').filter((w) => w.length > 1 && !['the', 'and', 'of', 'ltd', 'limited', 'plc'].includes(w));

/** Wikipedia's picture of the place. It uses the OpenStreetMap link to Wikipedia when there is one; otherwise it searches, and accepts a page only when its title is the place's own name. */
export async function findPhoto(p: PlaceInfo, signal?: AbortSignal): Promise<{ photo: string; by: string; summary?: string } | null> {
  try {
    let title = '', lang = 'en';
    if (p.wikipedia && /^[a-z-]{2,8}:/.test(p.wikipedia)) { lang = p.wikipedia.slice(0, p.wikipedia.indexOf(':')); title = p.wikipedia.slice(lang.length + 1); }
    if (!title) {
      const j = await wiki(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(p.name)}&srlimit=3&format=json&origin=*`, signal);
      const want = words(p.name); if (!want.length) return null;
      const hit = (j?.query?.search ?? []).find((x: { title: string }) => { const have = words(x.title.replace(/\(.*?\)/g, '')); return have.length && want.every((w) => have.includes(w)) && have.every((w) => want.includes(w)); });
      if (!hit) return null; title = hit.title;
    }
    const j = await wiki(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, signal);
    const src: string | undefined = j?.thumbnail?.source; if (!src || !/^https:\/\//.test(src)) return null;
    return { photo: src, by: 'Wikipedia', summary: typeof j?.description === 'string' ? j.description : undefined };
  } catch (e) { if ((e as Error).name === 'AbortError') throw e; return null; }
}
