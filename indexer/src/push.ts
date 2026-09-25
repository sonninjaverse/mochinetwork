import webpush from "web-push";
import type { Db } from "./db";
import type { AppliedEvent } from "./decode";

/**
 * Web Push, so a reader hears about something with the app closed.
 *
 * The preference lives on the reader's device, but a push is sent from here —
 * there is no browser awake to ask — so a copy of it rides along with the
 * subscription. That copy is the only reason this file knows what a "hot post"
 * is; the client's own rules live in web/lib/notify.ts and must agree.
 */

/** A whole vote's worth of weight, the same threshold the client uses. */
export const MEANINGFUL_WEIGHT = 100;

export type PushPrefs = {
  replies?: boolean;
  votes?: "off" | "meaningful" | "all";
  communities?: Record<string, "off" | "hot" | "all">;
};

export function wantsReply(prefs: PushPrefs): boolean {
  return prefs.replies !== false;
}

export function wantsVote(prefs: PushPrefs, weight: number): boolean {
  const level = prefs.votes ?? "meaningful";
  if (level === "off") return false;
  if (level === "all") return true;
  return weight >= MEANINGFUL_WEIGHT;
}

export function subLevel(prefs: PushPrefs, name: string): "off" | "hot" | "all" {
  return prefs.communities?.[name] ?? "hot";
}

export type Subscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Called once at startup. A missing key pair leaves push simply off. */
export function configurePush(): void {
  if (!pushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

export function saveSubscription(db: Db, address: string, sub: Subscription, prefs: PushPrefs): void {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, address, p256dh, auth, prefs, created_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET
       address = excluded.address, p256dh = excluded.p256dh,
       auth = excluded.auth, prefs = excluded.prefs`,
  ).run(
    sub.endpoint,
    address.toLowerCase(),
    sub.keys.p256dh,
    sub.keys.auth,
    JSON.stringify(prefs ?? {}),
    Math.floor(Date.now() / 1000),
  );
}

export function syncPrefs(db: Db, address: string, prefs: PushPrefs): void {
  db.prepare("UPDATE push_subscriptions SET prefs = ? WHERE address = ?").run(
    JSON.stringify(prefs ?? {}),
    address.toLowerCase(),
  );
}

export function removeSubscription(db: Db, endpoint: string): void {
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export type Row = { endpoint: string; address: string; p256dh: string; auth: string; prefs: string };

type Payload = { title: string; body: string; url: string; tag: string };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function who(db: Db, address: string): string {
  const row = db.prepare("SELECT handle FROM handles WHERE address = ?").get(address) as
    | { handle: string }
    | undefined;
  return row?.handle ?? short(address);
}

/** Trim to something a lock screen can show in one line. */
const cut = (text: string, n = 140) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

function rows(db: Db): Row[] {
  return db.prepare("SELECT endpoint, address, p256dh, auth, prefs FROM push_subscriptions").all() as Row[];
}

function prefsOf(row: Row): PushPrefs {
  try {
    return JSON.parse(row.prefs) as PushPrefs;
  } catch {
    return {};
  }
}

async function send(db: Db, row: Row, payload: Payload): Promise<void> {
  if (!pushConfigured()) return;
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(payload),
    );
  } catch (e) {
    // A gone endpoint is the push service saying this browser is finished.
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) removeSubscription(db, row.endpoint);
  }
}

/**
 * Which endpoints should hear about this event, and what each should be told.
 *
 * One entry per endpoint, not per account: an account with two devices has two
 * rows, and each device is told once. Returning the row itself is what keeps
 * the caller from sending to every endpoint of the account for each of them.
 */
export function recipients(
  rows: Row[],
  db: Db,
  event: Exclude<AppliedEvent, null>,
): { row: Row; payload: Payload }[] {
  const out: { row: Row; payload: Payload }[] = [];
  const postUrl = (id: string) => `/p/${id}/`;

  if (event.kind === "post") {
    if (event.parentId === "0") {
      // A new post in a community: only the watchers who asked for every post.
      const payload: Payload = {
        title: `${who(db, event.author)} posted in m/${event.community}`,
        body: cut(event.text.replace(/^m\/\S+\s*/, "")),
        url: postUrl(event.id),
        tag: `post-${event.id}`,
      };
      for (const row of rows) {
        if (!event.community) continue;
        if (row.address === event.author) continue;
        if (subLevel(prefsOf(row), event.community) === "all") out.push({ row, payload });
      }
      return out;
    }

    // A reply: tell whoever wrote the post it answers.
    const parent = db.prepare("SELECT author FROM posts WHERE id = ?").get(event.parentId) as
      | { author: string }
      | undefined;
    if (!parent || parent.author === event.author) return out;
    const payload: Payload = {
      title: `${who(db, event.author)} replied to you`,
      body: cut(event.text),
      url: postUrl(event.id),
      tag: `reply-${event.id}`,
    };
    for (const row of rows) {
      if (row.address !== parent.author) continue;
      if (wantsReply(prefsOf(row))) out.push({ row, payload });
    }
    return out;
  }

  // A vote.
  if (event.account !== event.author) {
    const payload: Payload = {
      title:
        event.vote === "like"
          ? `${who(db, event.account)} liked your post`
          : `${who(db, event.account)} disagreed with your post`,
      body: "",
      url: postUrl(event.id),
      tag: `vote-${event.id}-${event.account}`,
    };
    for (const row of rows) {
      if (row.address !== event.author) continue;
      if (wantsVote(prefsOf(row), event.weight)) out.push({ row, payload });
    }
  }

  // The vote that carried a community post past a whole one is its own news.
  if (event.crossedHot && event.community) {
    const post = db.prepare("SELECT text FROM posts WHERE id = ?").get(event.id) as
      | { text: string }
      | undefined;
    const payload: Payload = {
      title: `${who(db, event.author)} is hot in m/${event.community}`,
      body: cut((post?.text ?? "").replace(/^m\/\S+\s*/, "")),
      url: postUrl(event.id),
      tag: `hot-${event.id}`,
    };
    for (const row of rows) {
      if (row.address === event.author || row.address === event.account) continue;
      if (subLevel(prefsOf(row), event.community) === "hot") out.push({ row, payload });
    }
  }

  return out;
}

/**
 * Send whatever this event deserves. Called after the cache transaction, so a
 * slow push service never holds up ingestion.
 */
export async function dispatch(db: Db, event: Exclude<AppliedEvent, null>): Promise<void> {
  if (!pushConfigured()) return;
  const all = rows(db);
  for (const { row, payload } of recipients(all, db, event)) await send(db, row, payload);
}
