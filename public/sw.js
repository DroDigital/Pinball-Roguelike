// Offline support: precache the app shell and its hashed assets on install, serve them
// cache-first, and fetch pages network-first so a new build is picked up when online.
// Bump CACHE whenever the sample bank (public/sfx) changes: its files are served cache-first.
const CACHE = 'ball-and-chain-v4';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // The built page names its hashed scripts and styles: cache those too.
      const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
      const assets = [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)].map((m) => m[1]);
      await cache.addAll(assets);
      // The sample bank (tools/build-sfx.mjs lists its files). Sound is optional: a failure here
      // must not stop the app shell from installing, and the game falls back to synthesis.
      try {
        const files = await (await fetch('./sfx/files.json', { cache: 'no-store' })).json();
        await cache.addAll(files.map((f) => `./sfx/${f}`));
      } catch {
        // offline play still works; sounds are cached as they are first fetched
      }
      // Fonts and images named inside the built stylesheets.
      for (const css of assets.filter((a) => a.endsWith('.css'))) {
        const base = new URL(css, location.href);
        const text = await (await fetch(css)).text();
        const refs = [...text.matchAll(/url\(([^)]+)\)/g)]
          .map((m) => m[1].replace(/['"]/g, ''))
          .filter((u) => !u.startsWith('data:'))
          .map((u) => new URL(u, base).href);
        await cache.addAll(refs);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
