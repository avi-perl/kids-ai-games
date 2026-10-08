const CACHE = 'fun-games-v13';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './01-hill-jumper/',
  './01-hill-jumper/index.html',
  './03-cosmic-sling/',
  './03-cosmic-sling/index.html',
  './04-times-sprint/',
  './04-times-sprint/index.html',
  './04-times-sprint/js/brain.js',
  './04-times-sprint/js/store.js',
  './04-times-sprint/js/report.js',
  './04-times-sprint/js/charts.js',
  './04-times-sprint/js/history.js',
  './04-times-sprint/js/sound.js',
  './04-times-sprint/js/app.js',
  './04-times-sprint/js/game.js',
  './04-times-sprint/js/screens.js',
  './05-keypad-lock/',
  './05-keypad-lock/index.html',
  './05-keypad-lock/door.jpg',
  './05-keypad-lock/js/lock-contract.js',
  './05-keypad-lock/js/lockey-2930-rules.js',
  './05-keypad-lock/js/lockey-2930-keypad.js',
  './05-keypad-lock/js/lockey-2930-lock.js',
  './05-keypad-lock/js/sound.js',
  './05-keypad-lock/js/door.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate: serve cache instantly, update in background
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const fetchPromise = fetch(e.request).then(res => {
        if (res && res.status === 200) cache.put(e.request, res.clone());
        return res;
      }).catch(() => null);
      return cached || fetchPromise;
    })
  );
});
