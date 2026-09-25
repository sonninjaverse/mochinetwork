import type { CommunityActivity, Notification } from "./notifications";

/**
 * What a reader wants to be told about, kept on their own device.
 *
 * Notifications are a view of the chain, not a stored fact, so the only state
 * is this preference. It never leaves the browser: there is no account on a
 * server to attach it to, and someone else's inbox is not ours to write.
 */

/** A whole vote's worth of weight. Below it a vote is closer to noise. */
export const MEANINGFUL_WEIGHT = 100;

/** A post that has earned a whole vote is worth telling a community about. */
export const HOT_LIKES = 100;

export type VoteLevel = "off" | "meaningful" | "all";
export type SubLevel = "off" | "hot" | "all";

export type NotifyPrefs = {
  /** Replies to your posts and comments. */
  replies: boolean;
  /** Votes on what you wrote. */
  votes: VoteLevel;
  /** Per community, by name. Missing means the default, "hot". */
  communities: Record<string, SubLevel>;
};

export const DEFAULT_PREFS: NotifyPrefs = {
  replies: true,
  votes: "meaningful",
  communities: {},
};

const KEY = "mochi-notify-prefs";
const EVENT = "mochi-notify-prefs-change";

/** The level for one community, defaulting to "hot" until it is set. */
export function subLevel(prefs: NotifyPrefs, name: string): SubLevel {
  return prefs.communities[name] ?? "hot";
}

/** Whether a vote of this weight is worth telling the reader about. */
export function voteAllowed(level: VoteLevel, weight: number | null): boolean {
  if (level === "off") return false;
  if (level === "all") return true;
  return (weight ?? 0) >= MEANINGFUL_WEIGHT;
}

/** Which of the communities the reader is in should be polled at all. */
export function watchedCommunities(prefs: NotifyPrefs, joined: string[]): string[] {
  return joined.filter((name) => subLevel(prefs, name) !== "off");
}

/** One line in the bell, from any source. */
export type Notice = {
  kind: "reply" | "like" | "dislike" | "post";
  actor: string;
  actorHandle: string | null;
  postId: string | null;
  replyId: string | null;
  /** Set on a community post. */
  community: string | null;
  text: string | null;
  block: number;
};

const fromPersonal = (n: Notification): Notice => ({
  kind: n.kind,
  actor: n.actor,
  actorHandle: n.actorHandle,
  postId: n.postId,
  replyId: n.replyId,
  community: null,
  text: n.text,
  block: n.block,
});

const fromActivity = (a: CommunityActivity): Notice => ({
  kind: "post",
  actor: a.author,
  actorHandle: a.handle,
  postId: a.id,
  replyId: null,
  community: a.community,
  text: a.text,
  block: a.block,
});

/**
 * Merge both sources into the list a reader should see, newest first.
 *
 * Pure, so the rules live in one place and are tested there: the bell only
 * renders what this returns.
 */
export function noticesFrom(
  personal: Notification[],
  activity: CommunityActivity[],
  prefs: NotifyPrefs,
  viewer: string,
): Notice[] {
  const me = viewer.toLowerCase();

  const people = personal
    .filter((n) => (n.kind === "reply" ? prefs.replies : voteAllowed(prefs.votes, n.weight)))
    .map(fromPersonal);

  const subs = activity
    .filter((a) => a.author.toLowerCase() !== me)
    .filter((a) => {
      const level = subLevel(prefs, a.community);
      if (level === "off") return false;
      if (level === "all") return true;
      return a.weightedLikes >= HOT_LIKES;
    })
    .map(fromActivity);

  return [...people, ...subs].sort((a, b) => b.block - a.block);
}

export const unreadNotices = (items: Notice[], seen: number) =>
  items.filter((n) => n.block > seen).length;

export function loadPrefs(): NotifyPrefs {
  try {
    return normalize(JSON.parse(window.localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: NotifyPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
    // The bell and a community's own control both write this, so one has to
    // hear the other without a reload.
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // A private window. The defaults stand for this session.
  }
}

export function onPrefsChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Anything read back could be from an older shape or a hand-edited value. */
function normalize(raw: unknown): NotifyPrefs {
  const value = (raw ?? {}) as Partial<NotifyPrefs>;
  return {
    replies: typeof value.replies === "boolean" ? value.replies : DEFAULT_PREFS.replies,
    votes:
      value.votes === "off" || value.votes === "all" || value.votes === "meaningful"
        ? value.votes
        : DEFAULT_PREFS.votes,
    communities:
      value.communities && typeof value.communities === "object" ? { ...value.communities } : {},
  };
}
