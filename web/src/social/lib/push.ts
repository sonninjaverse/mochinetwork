import { apiFetch } from "./api";
import type { NotifyPrefs } from "./notify";

const BASE = process.env.NEXT_PUBLIC_INDEXER_URL;
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * Push, from the browser's side.
 *
 * The subscription is the browser's, not the account's: one endpoint per
 * install. The address and the preferences ride along so the indexer knows who
 * to tell and about what — it has no page open to ask.
 */

export type PushState = "unsupported" | "default" | "granted" | "denied";

export function isIos(): boolean {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Installed to the Home Screen, which is where iOS keeps web push. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone;
  return window.matchMedia?.("(display-mode: standalone)").matches || iosStandalone === true;
}

export function pushState(): PushState {
  if (typeof window === "undefined") return "unsupported";
  if (!VAPID_PUBLIC) return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  // iOS only exposes push to a Home Screen app; in a tab it reports as
  // unsupported so the settings can say why instead of offering a dead button.
  if (isIos() && !isStandalone()) return "unsupported";
  return Notification.permission as PushState;
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/// The application server key is base64url; the API wants raw bytes.
function keyBytes(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  // Allocated rather than Uint8Array.from: the subscribe call wants an
  // ArrayBuffer-backed view, and from() is typed to a shareable one.
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

async function postSubscribe(
  address: string,
  sub: PushSubscription,
  prefs: NotifyPrefs,
): Promise<boolean> {
  try {
    const json = sub.toJSON();
    const res = await apiFetch(`${BASE}/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        subscription: { endpoint: json.endpoint, keys: json.keys },
        prefs,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type EnableResult = { ok: true } | { ok: false; reason: string };

/** Ask, subscribe, and tell the indexer. The reason is shown to the reader. */
export async function enablePush(address: string, prefs: NotifyPrefs): Promise<EnableResult> {
  if (!("serviceWorker" in navigator)) {
    return { ok: false, reason: "This browser has no service worker." };
  }

  const reg = await registerWorker();
  if (!reg) return { ok: false, reason: "Could not register the service worker." };

  // iOS refuses to subscribe until the worker is active, not merely registered.
  await navigator.serviceWorker.ready.catch(() => {});

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notifications are blocked for this site." };
  }

  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: the DOM types want an ArrayBuffer-backed view and a plain
      // Uint8Array is typed to a possibly-shared buffer.
      applicationServerKey: keyBytes(VAPID_PUBLIC) as BufferSource,
    });
  } catch (e) {
    return { ok: false, reason: `Subscribe failed: ${(e as Error).message}` };
  }

  return (await postSubscribe(address, sub, prefs))
    ? { ok: true }
    : { ok: false, reason: "The server did not accept the subscription." };
}

/** Forget this browser: the subscription and the indexer's copy of it. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await sub.unsubscribe().catch(() => {});
  await apiFetch(`${BASE}/push/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
}

/** Keep the indexer's copy of the address and preferences current. */
export async function syncPush(address: string, prefs: NotifyPrefs): Promise<void> {
  const sub = await currentSubscription();
  if (sub) await postSubscribe(address, sub, prefs);
}
