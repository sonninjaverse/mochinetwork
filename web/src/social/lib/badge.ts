/**
 * The number on the app icon.
 *
 * The Badging API is what an installed app shows on its Home Screen icon. iOS
 * only supports it for a Home Screen app; elsewhere the calls are absent and
 * this does nothing. The count is also mirrored to the service worker so a
 * push arriving with the app closed can carry it forward.
 */
type BadgingNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function setBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as BadgingNavigator;

  if (count > 0) void nav.setAppBadge?.(count).catch(() => {});
  else void nav.clearAppBadge?.().catch(() => {});

  // The worker does not share this page's memory, so it is told directly. If
  // it does not control the page yet the message is simply not sent; the
  // icon still reflects the count set above.
  navigator.serviceWorker?.controller?.postMessage({ type: "badge", count });
}
