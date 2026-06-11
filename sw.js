/* Fiorella Movimientos — Service Worker */
var CACHE = "fe-movimientos-v1";
var ARCHIVOS = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return c.addAll(ARCHIVOS).catch(function(){});
    })
  );
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(e) {
  var url = e.request.url;
  // Las llamadas a Apps Script SIEMPRE van a la red (datos en vivo)
  if (url.indexOf("script.google.com") >= 0 || url.indexOf("googleusercontent") >= 0) {
    return;
  }
  // El resto: primero cache, luego red
  e.respondWith(
    caches.match(e.request).then(function(resp) {
      return resp || fetch(e.request).then(function(r) {
        return caches.open(CACHE).then(function(c) {
          if (e.request.method === "GET") c.put(e.request, r.clone());
          return r;
        });
      });
    }).catch(function() {
      return caches.match("./index.html");
    })
  );
});
