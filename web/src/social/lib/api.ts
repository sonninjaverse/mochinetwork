/**
 * Every call to the indexer.
 *
 * `credentials: "include"` is what carries the private gate's cookie across
 * origins — the site and API may run on different hosts, so a
 * same-origin default would drop it and every read would come back 401 on a
 * gated deployment. The cookie is scoped to the apex, so one sign-in opens
 * both ends.
 */
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { credentials: "include", ...init });
}
