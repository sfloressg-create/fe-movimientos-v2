/* Fiorella Movimientos — Service Worker */
var CACHE = "fe-movimientos-v2"; // ⚠️ Sube este número cada vez que actualices la app

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

  // Las llamadas a Apps Script / Netlify functions SIEMPRE van a la red (datos en vivo)
  if (url.indexOf("script.google.com") >= 0 ||
      url.indexOf("googleusercontent") >= 0 ||
      url.indexOf("/.netlify/functions/") >= 0) {
    return;
  }

  // Para todo lo demás (el index.html, css, etc.): RED PRIMERO.
  // Así cada vez que haya internet, se trae la versión más reciente del archivo.
  // Solo si no hay internet, usa lo que tenga guardado en caché.
  e.respondWith(
    fetch(e.request).then(function(r) {
      return caches.open(CACHE).then(function(c) {
        if (e.request.method === "GET") c.put(e.request, r.clone());
        return r;
      });
    }).catch(function() {
      return caches.match(e.request).then(function(resp) {
        return resp || caches.match("./index.html");
      });
    })
  );
});
