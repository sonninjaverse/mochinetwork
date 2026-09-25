/**
 * Push delivery for the app.
 *
 * Served as-is from the site root — no build step — so it can be updated
 * without shipping a new bundle. A push arrives here even when no tab is open,
 * which is the whole point: the indexer sends it, not the page.
 *
 * It also owns the Home Screen icon's badge. The page sets the true count when
 * it is open; with the app closed, each push carries that count forward so the
 * number does not sit at whatever it was last time.
 */

const BADGE_CACHE = "mochi-badge";
const BADGE_KEY = "/unread";

async function readBadge() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const res = await cache.match(BADGE_KEY);
    return Number(res ? await res.text() : 0) || 0;
  } catch (e) {
    return 0;
  }
}

async function writeBadge(count) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.put(BADGE_KEY, new Response(String(count)));
  } catch (e) {
    // Private mode, or no cache storage. The icon just does not change.
  }

  const nav = self.navigator;
  if (!nav) return;
  if (count > 0) await nav.setAppBadge?.(count).catch(() => {});
  else await nav.clearAppBadge?.().catch(() => {});
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // A push with no body is still worth showing something for.
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || "Mochi Network", {
        body: data.body || "",
        tag: data.tag,
        data: { url: data.url || "/" },
        icon: "/brand/icons/mochi-192.png",
        badge: "/brand/icons/mochi-192.png",
      });
      await writeBadge((await readBadge()) + 1);
    })(),
  );
});

/// The page posts the real count after it loads; the worker stores it.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "badge") {
    event.waitUntil(writeBadge(Number(event.data.count) || 0));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
