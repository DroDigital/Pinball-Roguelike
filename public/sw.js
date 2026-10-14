// Offline support: precache the app shell, its hashed assets and their fonts on install, serve
// them cache-first, and fetch pages network-first so a new build is picked up when online.
// Bump the version when the shell changes shape.
const CACHE = 'ball-and-chain-v3';
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
      // Stylesheets name their fonts; the woff2 files are all a modern browser asks for.
      for (const css of assets.filter((a) => a.endsWith('.css'))) {
        const base = new URL(css, location.href);
        const text = await (await cache.match(css))?.text();
        const fonts = [...(text ?? '').matchAll(/url\(([^)]+\.woff2)\)/g)].map(
          (m) => new URL(m[1].replace(/["']/g, ''), base).href,
        );
        await cache.addAll(fonts);
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
