/* Coe service worker. It lets the app open without a connection: your chats and study cards already live on this device.
   Pages are fetched fresh whenever you are online, so a new version is never held back. */
const V = 'coe-7';   // a new name clears every saved copy from older versions the next time Coe opens
const WAIT = 4500;   // on a weak connection, a saved copy is better than a page that never opens
const MAX = 220;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(['/', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function keep(req, res) {
  if (!res || !res.ok || res.type === 'opaque') return;
  const c = await caches.open(V); await c.put(req, res);
  const ks = await c.keys(); if (ks.length > MAX) for (const k of ks.slice(0, ks.length - MAX)) await c.delete(k);
}

self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== self.location.origin) return;   // the AI server, the account and other sites are never cached
  if (r.mode === 'navigate') {
    const saved = async () => (await caches.match(r, { ignoreSearch: true })) || (await caches.match('/'));
    // no-cache: ask the server whether the page changed (a short check), so a page the phone kept for ten minutes can never point at files a new version has already replaced
    const net = fetch(r, { cache: 'no-cache' }).then((res) => { e.waitUntil(keep(r, res.clone())); return res; });
    net.catch(() => {});
    const late = new Promise((ok) => setTimeout(async () => ok(await saved() || null), WAIT));
    e.respondWith(Promise.race([net, late]).then((res) => res || net).catch(async () => (await saved()) || Response.error()));
    return;
  }
  if (u.pathname.startsWith('/_next/static/') || u.pathname.startsWith('/fonts/')) {   // these file names change whenever the content does
    // A file that stalls on a weak connection fails after a while instead of hanging forever, so the app can try it again.
    const get = () => new Promise((ok, no) => { const t = setTimeout(() => no(new Error('slow')), 25000); fetch(r).then((res) => { clearTimeout(t); e.waitUntil(keep(r, res.clone())); ok(res); }, (err) => { clearTimeout(t); no(err); }); });
    e.respondWith(caches.match(r).then((m) => m || get()));
    return;
  }
  e.respondWith(fetch(r).then((res) => { e.waitUntil(keep(r, res.clone())); return res; }).catch(async () => (await caches.match(r)) || Response.error()));
});

/* Pressing a "reply is ready" notification brings Coe to the front (or opens it). */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('/');
  }));
});
