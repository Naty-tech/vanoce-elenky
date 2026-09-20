/* ============================================================================
 *  Service worker – umožňuje spuštění aplikace i bez připojení.
 *
 *  Při každé úpravě souborů aplikace zvyšte CACHE_VERSION (v2, v3, …),
 *  aby si telefony stáhly novou verzi.
 * ==========================================================================*/
var CACHE_VERSION = 'darky-v5';

var SHELL = [
  './',
  'index.html',
  'styles.css',
  'config.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // Jednotlivě, aby jeden chybějící soubor neshodil celou instalaci.
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE_VERSION ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  // Volání databáze (jiná doména) necháváme vždy projít na síť.
  if (url.origin !== self.location.origin) return;

  // Nejdřív síť (aby se změny projevily), při výpadku sáhneme do cache.
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
