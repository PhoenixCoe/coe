'use client';
/**
 * Places Coe shows. Two blocks share one set of cards:
 *   ```places {"title": "...", "places": [{"name": "...", "lat": 52.05, "lng": 1.15, "note": "why it is worth a look"}]}   the cards only (what you get for "the best places")
 *   ```map    {same}                                                                                                    a small map with a numbered pin for each place, and the same cards under it
 * After a places block Coe offers "Show me them on a map". Tiles come from OpenStreetMap. Drag to move, + and − to zoom, tap a pin or a card to find the place.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { findPhoto, recall, setPhoto, type PlaceInfo } from '@/lib/coe/places';

interface Place { name: string; lat: number; lng: number; note?: string; address?: string; kind?: string; url?: string }
interface Spec { title: string; places: Place[]; zoom?: number }
const T = 256, SHOW = 5;

function parse(code: string): Spec | null {
  try {
    const j = JSON.parse(code); const raw = Array.isArray(j) ? j : Array.isArray(j?.places) ? j.places : null; if (!raw) return null;
    const places: Place[] = raw.slice(0, 30).map((p: Record<string, unknown>) => ({
      name: String(p.name ?? '').slice(0, 90), lat: Number(p.lat), lng: Number(p.lng ?? p.lon),
      note: p.note ? String(p.note).slice(0, 300) : undefined, address: p.address ? String(p.address).slice(0, 200) : undefined, kind: p.kind ? String(p.kind).slice(0, 30) : undefined,
      url: typeof p.url === 'string' && /^https:\/\//i.test(p.url) ? p.url : undefined,
    })).filter((p: Place) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 85 && Math.abs(p.lng) <= 180);
    if (!places.length) return null;
    return { title: String(j?.title ?? '').slice(0, 100), places, zoom: Number.isFinite(Number(j?.zoom)) ? Number(j.zoom) : undefined };
  } catch { return null; }
}
const px = (lng: number, lat: number, z: number) => { const s = T * 2 ** z, r = (lat * Math.PI) / 180; return { x: ((lng + 180) / 360) * s, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s }; };
const unpx = (x: number, y: number, z: number) => { const s = T * 2 ** z, n = Math.PI - (2 * Math.PI * y) / s; return { lng: (x / s) * 360 - 180, lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) }; };

/** The zoom at which every place fits in the frame. */
function fit(ps: Place[], w: number, h: number): { lat: number; lng: number; z: number } {
  if (ps.length === 1) return { lat: ps[0].lat, lng: ps[0].lng, z: 15 };
  for (let z = 17; z >= 2; z--) {
    const xs = ps.map((p) => px(p.lng, p.lat, z).x), ys = ps.map((p) => px(p.lng, p.lat, z).y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    if (maxX - minX <= w - 110 && maxY - minY <= h - 110) { const c = unpx((minX + maxX) / 2, (minY + maxY) / 2, z); return { ...c, z }; }
  }
  return { lat: ps[0].lat, lng: ps[0].lng, z: 2 };
}

const Stars = ({ v }: { v: number }) => (
  <span className="pc-stars" role="img" aria-label={`${v.toFixed(1)} out of 5`}>
    <span className="pc-s0">{[0, 1, 2, 3, 4].map((i) => <UiIcon key={i} name="star" size={15} />)}</span>
    <span className="pc-s1" style={{ width: `${Math.max(0, Math.min(5, v)) * 20}%` }}>{[0, 1, 2, 3, 4].map((i) => <UiIcon key={i} name="star" size={15} />)}</span>
  </span>
);
const tried = new Set<string>();
const photoMem = new Map<string, { photo: string; by: string; summary?: string }>();
const today = (h?: string[]) => { if (!h?.length) return ''; const d = (new Date().getDay() + 6) % 7; return (h[d] ?? '').replace(/^[^:]+:\s*/, ''); };

export type Shown = Place & { info?: PlaceInfo };
const withInfo = (ps: Place[]): Shown[] => ps.map((p) => ({ ...p, info: recall(p.name, p.lat, p.lng) }));
/** Every place block in a reply (maps and cards), with whatever was found out about each place. */
export function mapPlaces(text: string): Shown[] {
  const out: Shown[] = [];
  for (const m of text.matchAll(/(?:^|\n)\s{0,3}`{3,}\s*(?:map|places)[^\n]*\n([\s\S]*?)\n\s{0,3}`{3,}/g)) { const sp = parse(m[1]); if (sp) out.push(...withInfo(sp.places)); }
  return out;
}

/**
 * One place, one card. Photo, name, what it is, rating, whether it is open, why it is worth a look, the address, and three buttons.
 * The full version (in "About this answer") adds the opening hours for the week, the phone, website and email as text, and where the details came from.
 * Anything we do not know is simply left out: there is no "no rating found".
 */
export function PlaceCard({ p, i, on = false, pick, full = false }: { p: Shown; i: number; on?: boolean; pick?: () => void; full?: boolean }) {
  const info = p.info, key = `${p.name}|${p.lat.toFixed(3)}`;
  const [found, setFound] = useState(photoMem.get(key) ?? null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (info?.photo || found || tried.has(key)) return;
    tried.add(key); const ctl = new AbortController();
    void findPhoto(info ?? { name: p.name, lat: p.lat, lng: p.lng, source: 'osm' }, ctl.signal).then((r) => { if (r) { photoMem.set(key, r); setFound(r); if (info) setPhoto(info, r.photo, r.by); } }).catch(() => {});
    return () => ctl.abort();
  }, [info, found, key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const photo = !bad ? (info?.photo ?? found?.photo) : undefined, by = info?.photo ? info.photoBy : found?.by;
  const phone = info?.phone, dial = phone?.replace(/[^\d+]/g, ''), site = info?.website ?? p.url, rating = info?.rating, kind = info?.kind ?? p.kind;
  const addr = info?.address ?? p.address, hrs = info?.hours, line = today(hrs), about = info?.summary ?? found?.summary;
  const host = (() => { try { return new URL(site ?? '').hostname.replace(/^www\./, ''); } catch { return site ?? ''; } })();
  const dir = info?.mapsUrl && info.source === 'google' ? info.mapsUrl : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  const sub = [kind, info?.price].filter(Boolean).join(' · ');
  const status = info?.closed ? info.closed.toLowerCase().replace(/_/g, ' ') : info?.open !== undefined ? (info.open ? 'Open now' : 'Closed now') : '';
  const good = !info?.closed && info?.open === true;
  const main = (
    <>
      <span className="pc-pic" aria-hidden>
        {photo ? <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <span className="pc-ph d">{p.name.trim().slice(0, 1)}</span>}
        <i className="pc-n d">{i + 1}</i>
        {full && photo && by && <span className="pc-by">Photo: {by}</span>}
      </span>
      <span className="pc-b">
        <b className="d pc-t">{p.name}</b>
        {(sub || status) && <span className="pc-k tx">{sub}{status && <em className={`pc-open d${good ? ' y' : ''}`}>{status}</em>}</span>}
        {rating !== undefined && <span className="pc-r"><Stars v={rating} /><b className="d">{rating.toFixed(1)}</b>{!!info?.reviews && <span className="tx">({info.reviews.toLocaleString('en-GB')})</span>}</span>}
        {p.note && <span className="pc-note tx">{p.note}</span>}
        {(line || (full && info?.hoursText)) && <span className="pc-hr tx"><UiIcon name="timer" size={14} />{line ? `Today ${line}` : `Hours: ${info?.hoursText}`}</span>}
        {addr && <span className="pc-a tx"><UiIcon name="place" size={14} /><span>{addr}</span></span>}
      </span>
    </>
  );
  return (
    <article className={`pc c${i % 5}${on ? ' on' : ''}${full ? ' pc-f' : ''}`} aria-label={p.name} data-pc={i}>
      {pick
        ? <button type="button" className="pc-main" onClick={pick} aria-label={`${p.name}. Show on the map.`}>{main}</button>
        : <div className="pc-main">{main}</div>}
      {full && (about || hrs || phone || info?.email || site) && (
        <div className="pc-more-d">
          {about && <p className="pc-about tx">{about}</p>}
          <ul className="pc-l">
            {phone && <li><UiIcon name="phone" size={15} /><a className="tx" href={`tel:${dial}`}>{phone}</a></li>}
            {site && <li><UiIcon name="link" size={15} /><a className="tx" href={site} target="_blank" rel="noopener noreferrer">{host}</a></li>}
            {info?.email && <li><UiIcon name="mail" size={15} /><a className="tx" href={`mailto:${info.email}`}>{info.email}</a></li>}
            {hrs && hrs.length > 1 && <li><UiIcon name="timer" size={15} /><details className="pc-hrs"><summary className="tx">Opening hours</summary><ul>{hrs.map((h) => <li key={h} className="tx">{h}</li>)}</ul></details></li>}
          </ul>
        </div>
      )}
      <div className="pc-acts">
        <a className="btn small gold" href={dir} target="_blank" rel="noopener noreferrer"><UiIcon name="out" size={14} />Directions</a>
        {phone && <a className="btn small" href={`tel:${dial}`}><UiIcon name="phone" size={14} />Call</a>}
        {site && <a className="btn small" href={site} target="_blank" rel="noopener noreferrer"><UiIcon name="link" size={14} />Website</a>}
      </div>
      {full && info && <p className="pc-src tx">{info.source === 'google' ? 'Details: Google Places' : 'Details: OpenStreetMap, added by volunteers'}. Check hours and details before you go.</p>}
    </article>
  );
}

/** The cards, five to start with. */
function Cards({ shown, sel, pick }: { shown: Shown[]; sel?: number; pick?: (i: number) => void }) {
  const [more, setMore] = useState(false);
  const list = more ? shown : shown.slice(0, SHOW);
  return (
    <>
      <div className="pc-list">{list.map((p, i) => <PlaceCard key={`${p.name}${i}`} p={p} i={i} on={sel === i} pick={pick ? () => pick(i) : undefined} />)}</div>
      {shown.length > SHOW && <button type="button" className="btn small pc-more" onClick={() => setMore(!more)}><UiIcon name="down" size={14} className={more ? 'flip' : ''} />{more ? 'Show fewer' : `Show all ${shown.length}`}</button>}
    </>
  );
}

const Wait = ({ text }: { text: string }) => <div className="map-wait tx"><UiIcon name="globe" size={18} />{text}</div>;
const Head = ({ title, n }: { title: string; n: number }) => <figcaption className="map-h"><span className="d">{title || 'Places'}</span><span className="tx">{n === 1 ? '1 place' : `${n} places`}</span></figcaption>;

/** Just the cards. No map, so there is nothing to work out: a clear list you can scan. */
export function PlacesBlock({ code, closed }: { code: string; closed: boolean }) {
  const spec = useMemo(() => (closed ? parse(code) : null), [code, closed]);
  if (!closed) return <Wait text="Finding the places…" />;
  if (!spec) return <div className="map-wait tx"><UiIcon name="alert" size={18} />Those places could not be shown. Each place needs a name and a position.</div>;
  return (
    <figure className="map flat pl" aria-label={spec.title || 'Places'}>
      <Head title={spec.title} n={spec.places.length} />
      <Cards shown={withInfo(spec.places)} />
    </figure>
  );
}

/** A small map with a numbered pin for each place, and the same cards under it. The place you pick gets its name on the map. */
export function MapBlock({ code, closed }: { code: string; closed: boolean }) {
  const spec = useMemo(() => (closed ? parse(code) : null), [code, closed]);
  const frame = useRef<HTMLDivElement>(null), fig = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ w: 640, h: 340 });
  const [view, setView] = useState<{ lat: number; lng: number; z: number } | null>(null);
  const [sel, setSel] = useState(-1);
  const [bad, setBad] = useState(0);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const el = frame.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 640, h: el.clientHeight || 340 })); ro.observe(el);
    return () => ro.disconnect();
  }, [spec]);
  useEffect(() => { if (spec) setView(fit(spec.places, size.w, size.h)); }, [spec, size.w < 400 ? 'narrow' : 'wide']);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!closed) return <Wait text="Drawing the map…" />;
  if (!spec) return <div className="map-wait tx"><UiIcon name="alert" size={18} />That map could not be drawn. The places need a name and a position.</div>;
  const v = view ?? fit(spec.places, size.w, size.h);
  const c = px(v.lng, v.lat, v.z), x0 = c.x - size.w / 2, y0 = c.y - size.h / 2;
  const n = 2 ** v.z;
  const tx0 = Math.floor(x0 / T), tx1 = Math.floor((x0 + size.w) / T), ty0 = Math.max(0, Math.floor(y0 / T)), ty1 = Math.min(n - 1, Math.floor((y0 + size.h) / T));
  const tiles: { x: number; y: number; k: string }[] = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tiles.push({ x: ((tx % n) + n) % n, y: ty, k: `${tx}/${ty}` });
  const zoom = (d: number, at?: { x: number; y: number }) => setView((o) => { const cur = o ?? v; const z = Math.max(2, Math.min(18, cur.z + d)); if (!at) return { ...cur, z }; const p = px(cur.lng, cur.lat, cur.z), k = 2 ** (z - cur.z), nx = (p.x - size.w / 2 + at.x) * k - at.x + size.w / 2, ny = (p.y - size.h / 2 + at.y) * k - at.y + size.h / 2; return { ...unpx(nx, ny, z), z }; });
  const shown = withInfo(spec.places);
  const find = (i: number) => {   // from a card: show the place on the map, and bring the map into view if the cards have scrolled it away
    setSel(i); const p = spec.places[i]; setView((o) => ({ lat: p.lat, lng: p.lng, z: Math.max(o?.z ?? 14, 14) }));
    const r = frame.current?.getBoundingClientRect(); if (r && (r.top < 56 || r.bottom > innerHeight)) frame.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const tap = (i: number) => {   // from a pin: pick the place, and bring its card into view
    setSel(i); fig.current?.querySelector(`[data-pc="${i}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const at = sel >= 0 ? spec.places[sel] : null, tag = at ? { q: px(at.lng, at.lat, v.z) } : null;
  const tagX = tag ? Math.min(Math.max(tag.q.x - x0, 80), Math.max(80, size.w - 80)) : 0, tagY = tag ? tag.q.y - y0 : 0;

  return (
    <figure ref={fig} className="map flat" aria-label={spec.title || 'Map'}>
      <Head title={spec.title} n={spec.places.length} />
      <div ref={frame} className="map-frame" role="application" aria-label="Map. Drag to move. Use the plus and minus buttons to zoom."
        onPointerDown={(e) => { if ((e.target as Element).closest('.map-pin, .map-ctl')) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, cx: x0 + size.w / 2, cy: y0 + size.h / 2 }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const m = unpx(d.cx - (e.clientX - d.x), d.cy - (e.clientY - d.y), v.z); setView({ lat: Math.max(-84, Math.min(84, m.lat)), lng: m.lng, z: v.z }); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoom(1, { x: e.clientX - r.left, y: e.clientY - r.top }); }}>
        {tiles.map((t) => <img key={t.k} className="map-tile" alt="" draggable={false} src={`https://tile.openstreetmap.org/${v.z}/${t.x}/${t.y}.png`} style={{ left: Number(t.k.split('/')[0]) * T - x0, top: t.y * T - y0 }} onError={() => setBad((b) => b + 1)} />)}
        {spec.places.map((p, i) => { const q = px(p.lng, p.lat, v.z); return (
          <button key={i} type="button" className={`map-pin${i === sel ? ' on' : ''}`} style={{ left: q.x - x0, top: q.y - y0 }} aria-label={`${i + 1}. ${p.name}`} aria-pressed={i === sel} onClick={() => tap(i)}><span className="d">{i + 1}</span></button>
        ); })}
        {at && <span className={`map-tag d${tagY < 70 ? ' below' : ''}`} style={{ left: tagX, top: tagY }} aria-hidden>{at.name}</span>}
        <div className="map-ctl">
          <button type="button" aria-label="Zoom in" onClick={() => zoom(1)}><UiIcon name="plus" size={18} /></button>
          <button type="button" aria-label="Zoom out" onClick={() => zoom(-1)}><span className="map-minus" aria-hidden /></button>
          <button type="button" aria-label="Show all places" onClick={() => { setSel(-1); setView(fit(spec.places, size.w, size.h)); }}><UiIcon name="expand" size={16} /></button>
        </div>
        {bad > 3 && <p className="map-off tx">The map picture could not load, but the places are listed below.</p>}
        <a className="map-attr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
      </div>
      <Cards shown={shown} sel={sel} pick={find} />
    </figure>
  );
}
