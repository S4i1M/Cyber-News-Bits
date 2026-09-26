/* ══════════════════════════════════════════════════════════════════
   SERVICE WORKER — offline support for Cyber News Bits
   · Pages:        network-first, cache fallback (works offline)
   · Site assets:  stale-while-revalidate
   · News APIs:    stale-while-revalidate → last feed readable offline
   ══════════════════════════════════════════════════════════════════ */
var CACHE = 'cnb-site-v2';

var PRECACHE = [
  './',
  'index.html',
  'article.html',
  'about.html',
  'services.html',
  'css/style.css',
  'js/theme.js',
  'js/main.js',
  'js/news.js',
  'js/article.js',
  'image-removebg-preview.png',
  'img/logo-removebg-preview.png',
  'assets/favicon.ico'
];

var API_HOSTS = [
  'api.rss2json.com',
  'api.allorigins.win',
  'hn.algolia.com',
  'api.codetabs.com'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // add individually so one failure doesn't kill the whole install
      return Promise.all(PRECACHE.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { /* skip */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  var isApi = API_HOSTS.indexOf(url.hostname) !== -1;

  /* Pages — network-first, fall back to cache when offline */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function (r) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return r;
      }).catch(function () {
        return caches.match(e.request).then(function (m) {
          return m || caches.match('./');
        });
      })
    );
    return;
  }

  /* News APIs — stale-while-revalidate: last successful feed works offline */
  if (isApi) {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        var net = fetch(e.request).then(function (r) {
          if (r && r.ok) {
            var copy = r.clone();
            caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          }
          return r;
        }).catch(function () { return cached; });
        return cached || net;
      })
    );
    return;
  }

  /* Own assets + fonts + card-image services — stale-while-revalidate */
  var isAsset = url.origin === self.location.origin ||
    /fonts\.(googleapis|gstatic)\.com/.test(url.hostname) ||
    /kit\.fontawesome\.com/.test(url.hostname) ||
    /image\.thum\.io/.test(url.hostname) ||
    /\.google\.com$/.test(url.hostname) ||
    /\.gstatic\.com$/.test(url.hostname);

  if (isAsset) {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        var net = fetch(e.request).then(function (r) {
          if (r && (r.ok || r.type === 'opaque')) {
            var copy = r.clone();
            caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          }
          return r;
        }).catch(function () { return cached; });
        return cached || net;
      })
    );
  }
  /* everything else (article source proxies, images) → plain network */
});
