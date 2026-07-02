/* Shadow Stock — Service Worker v4.0 */
const CACHE_NAME = "shadow-stock-v4.1";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/system-icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        APP_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`Precache atlandı (bulunamadı?): ${url}`, err)
          )
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Stale-while-revalidate: önbellekten anında göster, arka planda güncelle.
   Böylece GitHub'a atılan yeni sürüm bir sonraki açılışta gelir. */
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetched = fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));
      return cached || fetched;
    })
  );
});

/* ─── Push Notification Support ──────────────────────────────────── */
self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, icon } = data;
    event.waitUntil(
      self.registration.showNotification(title || "Shadow Stock", {
        body: body || "",
        icon: icon || "./icons/system-icon.svg",
        badge: "./icons/system-icon.svg",
        tag: tag || "shadow-stock",
        renotify: true,
        vibrate: [180, 80, 180],
        data: { url: data.url || "./" }
      })
    );
  }
});

self.addEventListener("push", event => {
  const data = event.data?.json() ?? {};
  const title = data.title || "Shadow Stock";
  const options = {
    body:  data.body  || "Bildirim alındı.",
    icon:  data.icon  || "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag:   data.tag   || "shadow-stock",
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(wins => {
      const url = event.notification.data?.url || "/";
      for (const win of wins) {
        if (win.url.includes(url) && "focus" in win) return win.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
