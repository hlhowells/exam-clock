/*
 * Exam Clock – offline support.
 * Serves the app from the cache straight away (so a dropped Wi-Fi connection
 * never stops the clock loading) and refreshes the cache in the background.
 * Change CACHE when you publish an update so old copies are replaced.
 */
var CACHE = 'exam-clock-v2';
var FILES = [
  './',
  'index.html',
  'display.html',
  'guide.html',
  'css/editor.css',
  'css/display.css',
  'js/core.js',
  'js/csv.js',
  'js/editor.js',
  'js/display.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || fresh;
    });
  }));
});
