'use client';
/**
 * A small map Coe can draw: ```map {"title": "...", "places": [{"name": "...", "lat": 52.05, "lng": 1.15, "note": "..."}]}
 * Tiles come from OpenStreetMap. You can drag it, zoom with the buttons, and tap a pin or a place in the list.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { UiIcon } from '@/ui/icons';
import { findPhoto, recall, setPhoto, type PlaceInfo } from '@/lib/coe/places';

interface Place { name: string; lat: number; lng: number; note?: string; address?: string; kind?: string; url?: string }
interface Spec { title: string; places: Place[]; zoom?: number }
const T = 256;

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
const today = (h?: string[]) => { if (!h?.length) return ''; const d = (new Date().getDay() + 6) % 7; return h[d] ?? ''; };

export type Shown = Place & { info?: PlaceInfo };
/** Every map block in a reply, with whatever was found out about each place. */
export function mapPlaces(text: string): Shown[] {
  const out: Shown[] = [];
  for (const m of text.matchAll(/(?:^|\n)\s{0,3}`{3,}\s*map[^\n]*\n([\s\S]*?)\n\s{0,3}`{3,}/g)) { const sp = parse(m[1]); if (sp) for (const p of sp.places) out.push({ ...p, info: recall(p.name, p.lat, p.lng) }); }
  return out;
}

/** One place. The small version is a row you can scan; the full version (in the Info window) has every detail and the buttons. */
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
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  const sub = [kind, info?.price].filter(Boolean).join(' · ');
  const rate = rating !== undefined
    ? <div className="pc-r"><Stars v={rating} /><b className="d">{rating.toFixed(1)}</b>{!!info?.reviews && <span className="tx">({info.reviews.toLocaleString('en-GB')})</span>}</div>
    : <p className="pc-nr tx">No rating found</p>;
  const pic = (
    <span className="pc-pic" aria-hidden>
      {photo ? <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <span className="pc-ph d">{p.name.trim().slice(0, 1)}</span>}
      <i className="pc-n d">{i + 1}</i>{full && photo && by && <span className="pc-by">Photo: {by}</span>}
    </span>
  );
  if (!full) return (
    <button type="button" className={`pc pc-s c${i % 5}${on ? ' on' : ''}`} onClick={pick} aria-label={`${p.name}. Show on the map.`}>
      {pic}
      <span className="pc-m">
        <b className="d pc-t">{p.name}</b>
        {sub && <span className="pc-k tx">{sub}</span>}
        {rate}
        {addr && <span className="pc-a tx">{addr}</span>}
      </span>
    </button>
  );
  return (
    <article className={`pc pc-f c${i % 5}`} aria-label={p.name}>
      {pic}
      <div className="pc-b">
        <h4 className="d pc-t">{p.name}</h4>
        <p className="pc-k tx">{sub}{info?.open !== undefined && <b className={`pc-open d${info.open ? ' y' : ''}`}>{info.open ? 'Open now' : 'Closed now'}</b>}{info?.closed && <b className="pc-open d">{info.closed.toLowerCase().replace(/_/g, ' ')}</b>}</p>
        {rate}
        {about && <p className="pc-about tx">{about}</p>}
        {p.note && <p className="pc-note tx">{p.note}</p>}
        <ul className="pc-l">
          {addr && <li><UiIcon name="place" size={15} /><span className="tx">{addr}</span></li>}
          {phone && <li><UiIcon name="phone" size={15} /><a className="tx" href={`tel:${dial}`}>{phone}</a></li>}
          {site && <li><UiIcon name="link" size={15} /><a className="tx" href={site} target="_blank" rel="noopener noreferrer">{host}</a></li>}
          {info?.email && <li><UiIcon name="mail" size={15} /><a className="tx" href={`mailto:${info.email}`}>{info.email}</a></li>}
          {(line || info?.hoursText) && <li><UiIcon name="timer" size={15} />{hrs && hrs.length > 1
            ? <details className="pc-hrs"><summary className="tx">{line}</summary><ul>{hrs.map((h) => <li key={h} className="tx">{h}</li>)}</ul></details>
            : <span className="tx">{line || info?.hoursText}</span>}</li>}
        </ul>
        <div className="pc-acts">
          {phone && <a className="btn small" href={`tel:${dial}`}><UiIcon name="phone" size={14} />Call</a>}
          {site && <a className="btn small" href={site} target="_blank" rel="noopener noreferrer"><UiIcon name="link" size={14} />Website</a>}
          <a className="btn small" href={info?.mapsUrl && info.source === 'google' ? info.mapsUrl : dir} target="_blank" rel="noopener noreferrer"><UiIcon name="out" size={14} />{info?.mapsUrl ? 'Google Maps' : 'Directions'}</a>
          <a className="btn small" href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`} target="_blank" rel="noopener noreferrer"><UiIcon name="globe" size={14} />Map</a>
        </div>
        {info && <p className="pc-src tx">{info.source === 'google' ? 'Details: Google Places' : 'Details: OpenStreetMap, added by volunteers'}. Check hours and details before you go.</p>}
      </div>
    </article>
  );
}

export function MapBlock({ code, closed }: { code: string; closed: boolean }) {
  const spec = useMemo(() => (closed ? parse(code) : null), [code, closed]);
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 340 });
  const [view, setView] = useState<{ lat: number; lng: number; z: number } | null>(null);
  const [sel, setSel] = useState(0);
  const [bad, setBad] = useState(0);
  const [more, setMore] = useState(false);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const el = frame.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 640, h: el.clientHeight || 340 })); ro.observe(el);
    return () => ro.disconnect();
  }, [spec]);
  useEffect(() => { if (spec) setView(fit(spec.places, size.w, size.h)); }, [spec, size.w < 400 ? 'narrow' : 'wide']);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!closed) return <div className="map-wait tx"><UiIcon name="globe" size={18} />Drawing the map…</div>;
  if (!spec) return <div className="map-wait tx"><UiIcon name="alert" size={18} />That map could not be drawn. The places need a name and a position.</div>;
  const v = view ?? fit(spec.places, size.w, size.h);
  const c = px(v.lng, v.lat, v.z), x0 = c.x - size.w / 2, y0 = c.y - size.h / 2;
  const n = 2 ** v.z;
  const tx0 = Math.floor(x0 / T), tx1 = Math.floor((x0 + size.w) / T), ty0 = Math.max(0, Math.floor(y0 / T)), ty1 = Math.min(n - 1, Math.floor((y0 + size.h) / T));
  const tiles: { x: number; y: number; k: string }[] = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tiles.push({ x: ((tx % n) + n) % n, y: ty, k: `${tx}/${ty}` });
  const zoom = (d: number, at?: { x: number; y: number }) => setView((o) => { const cur = o ?? v; const z = Math.max(2, Math.min(18, cur.z + d)); if (!at) return { ...cur, z }; const p = px(cur.lng, cur.lat, cur.z), k = 2 ** (z - cur.z), nx = (p.x - size.w / 2 + at.x) * k - at.x + size.w / 2, ny = (p.y - size.h / 2 + at.y) * k - at.y + size.h / 2; return { ...unpx(nx, ny, z), z }; });
  const focus = (i: number) => { setSel(i); const p = spec.places[i]; setView((o) => ({ lat: p.lat, lng: p.lng, z: Math.max(o?.z ?? 14, 14) })); };
  const shown: Shown[] = spec.places.map((p) => ({ ...p, info: recall(p.name, p.lat, p.lng) }));

  return (
    <figure className="map" aria-label={spec.title || 'Map'}>
      {spec.title && <figcaption className="map-h d"><UiIcon name="globe" size={18} />{spec.title}</figcaption>}
      <div ref={frame} className="map-frame" role="application" aria-label="Map. Drag to move. Use the plus and minus buttons to zoom."
        onPointerDown={(e) => { if ((e.target as Element).closest('.map-pin, .map-ctl')) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, cx: x0 + size.w / 2, cy: y0 + size.h / 2 }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const m = unpx(d.cx - (e.clientX - d.x), d.cy - (e.clientY - d.y), v.z); setView({ lat: Math.max(-84, Math.min(84, m.lat)), lng: m.lng, z: v.z }); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoom(1, { x: e.clientX - r.left, y: e.clientY - r.top }); }}>
        {tiles.map((t) => <img key={t.k} className="map-tile" alt="" draggable={false} src={`https://tile.openstreetmap.org/${v.z}/${t.x}/${t.y}.png`} style={{ left: Number(t.k.split('/')[0]) * T - x0, top: t.y * T - y0 }} onError={() => setBad((b) => b + 1)} />)}
        {spec.places.map((p, i) => { const q = px(p.lng, p.lat, v.z); return (
          <button key={i} type="button" className={`map-pin${i === sel ? ' on' : ''}`} style={{ left: q.x - x0, top: q.y - y0 }} aria-label={`${i + 1}. ${p.name}`} onClick={() => setSel(i)}><span className="d">{i + 1}</span></button>
        ); })}
        <div className="map-ctl">
          <button type="button" aria-label="Zoom in" onClick={() => zoom(1)}><UiIcon name="plus" size={18} /></button>
          <button type="button" aria-label="Zoom out" onClick={() => zoom(-1)}><span className="map-minus" aria-hidden /></button>
          <button type="button" aria-label="Show all places" onClick={() => setView(fit(spec.places, size.w, size.h))}><UiIcon name="expand" size={16} /></button>
        </div>
        {bad > 3 && <p className="map-off tx">The map picture could not load, but the places are listed below.</p>}
        <a className="map-attr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
      </div>
      <div className="pc-grid">
        {(more ? shown : shown.slice(0, 6)).map((p, i) => <PlaceCard key={`${p.name}${i}`} p={p} i={i} on={i === sel} pick={() => focus(i)} />)}
      </div>
      {shown.length > 6 && <button type="button" className="btn small pc-more" onClick={() => setMore(!more)}><UiIcon name="down" size={14} className={more ? 'flip' : ''} />{more ? 'Show fewer' : `Show all ${shown.length}`}</button>}
    </figure>
  );
}
