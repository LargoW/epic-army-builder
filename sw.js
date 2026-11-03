// Network-first with a short timeout, falling back to the cache: fresh when online, usable offline.
const CACHE = "eab-v1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "ui/app.js", "ui/style.css", "ui/messages.de.js",
  "engine/engine.js", "engine/exchange.js", "vendor/qrcode.js", "data/index.json", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

// Shell plus every army listed in the index, so a fresh install works offline right away.
async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL);
  const index = await (await fetch("data/index.json")).json();
  await c.addAll(index.armies.flatMap((a) => [`data/${a.id}.json`, `data/${a.id}.profiles.json`]));
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([
        fetch(req),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
      ]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return cache.match("index.html");
      return Response.error();
    }
  })());
});
