// Service worker Quatuor : rend le jeu utilisable hors ligne
const CACHE = "quatuor-v27";
const ASSETS = ["./", "./index.html", "./grilles.json", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "./fonts/bricolage.css", "./fonts/BricolageGrotesque-latin.woff2", "./fonts/BricolageGrotesque-latin-ext.woff2",
  "./mentions-legales.html", "./confidentialite.html", "./cgu.html",
  "./config-en-ligne.js", "./js/calculs.js", "./js/pseudos.js", "./js/telemetrie.js", "./js/en-ligne.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // Uniquement les fichiers du jeu : jamais les appels au serveur (Supabase) ni aux statistiques
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // Réseau d'abord (pour recevoir les mises à jour), cache en secours hors ligne
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
