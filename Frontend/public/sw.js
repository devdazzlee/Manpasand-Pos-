/* Manpasand POS — lightweight shell service worker (Sarwat-style offline till).
 * next-pwa is skipped on VPS builds; this file keeps HTML/JS/CSS available offline
 * after the till has been opened online once.
 */
const CACHE = "manpasand-pos-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["/", "/index.html", "/offline.html", "/manifest.json"].filter(Boolean)).catch(() => undefined),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache API — outbox + http_cache handle data.
  if (url.pathname.includes("/api/")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        if (res.ok && (url.origin === self.location.origin)) {
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          return (await caches.match("/offline.html")) || (await caches.match("/")) || Response.error();
        }
        return Response.error();
      }),
  );
});
