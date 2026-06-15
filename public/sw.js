/* oog.dev service worker — caches the app shell so it installs and loads offline-fast.
   Static GETs only; the WebSocket and /hook/* never go through here. */
const CACHE = "oog-v11";
const SHELL = [
  "/", "/index.html", "/styles.css", "/app.js", "/manifest.webmanifest",
  "/vendor/xterm.js", "/vendor/xterm.css", "/vendor/addon-fit.js",
  "/vendor/addon-search.js", "/vendor/qrcode.js",
  "/assets/claude-base.png", "/assets/claude-blink.png", "/assets/claude-talk.png",
  "/assets/favicon.png", "/assets/icon-192.png", "/assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/hook")) return; // never cache control traffic
  // network-first, fall back to cache (so updates land but offline still works)
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
  );
});

// ── web push ──
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || "oog.dev", {
    body: d.body || "", tag: d.tag || "oog", renotify: true,
    icon: "/assets/icon-192.png", badge: "/assets/icon-192.png", data: d,
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if ("focus" in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow("/");
  })());
});
