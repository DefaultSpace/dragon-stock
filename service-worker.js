/* Stok Takip — Service Worker v4.5 */
const CACHE_NAME = "stok-takip-v4.5";
const META_CACHE = "dragon-stock-meta"; // sayfa ile SW arasında paylaşılan küçük durum
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
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== META_CACHE).map(k => caches.delete(k)))
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
        .catch(() => {
          if (cached) return cached;
          // Çevrimdışıyken yalnızca sayfa gezinmeleri index'e düşsün
          if (event.request.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        });
      return cached || fetched;
    })
  );
});

/* ─── Sabah Hatırlatıcısı (Periodic Background Sync) ─────────────── */
const META_KEY = "./app-meta.json";

async function readMeta() {
  try {
    const c = await caches.open(META_CACHE);
    const r = await c.match(META_KEY);
    return r ? await r.json() : {};
  } catch (e) { return {}; }
}

async function writeMeta(meta) {
  try {
    const c = await caches.open(META_CACHE);
    await c.put(META_KEY, new Response(JSON.stringify(meta)));
  } catch (e) {}
}

function swTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

self.addEventListener("periodicsync", event => {
  if (event.tag === "daily-return-reminder") event.waitUntil(morningReminder());
});

async function morningReminder() {
  const meta = await readMeta();
  const now = new Date();
  if (now.getHours() < 9) return;                    // sabah 9'dan önce bildirim yok
  if (meta.lastReminderDate === swTodayKey()) return; // günde en fazla 1 kez
  if (!meta.dueCount) return;                         // iade bekleyen parça yoksa sus
  await self.registration.showNotification("🌅 Günaydın! Arızalı iadeleri verdin mi?", {
    body: meta.summary || `${meta.dueCount} parça depoya iade bekliyor.`,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: "morning-reminder",
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: "./" }
  });
  meta.lastReminderDate = swTodayKey();
  await writeMeta(meta);
}

/* ─── Push Notification Support ──────────────────────────────────── */
self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, icon } = data;
    event.waitUntil(
      self.registration.showNotification(title || "Stok Takip", {
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
  const title = data.title || "Stok Takip";
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
