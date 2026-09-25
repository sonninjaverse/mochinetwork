/**
 * Depth-0 trust anchors for the demo network.
 *
 * These are wallets the team controls, derived at a dedicated offset. Unlike
 * real ecosystem addresses, controlled anchors can vouch for accounts, which is
 * what gives the graph a realistic depth distribution instead of everything
 * hanging off one wallet.
 *
 * The names are invented. Borrowing real project names would put addresses we
 * control behind identities we do not own, and the sybil defence rests entirely
 * on the anchor set being trustworthy — a judge who recognised a name, checked
 * it, and found our own wallet would have every reason to discount the whole
 * mechanism.
 */
export const ANCHOR_OFFSET = 20_000;

export const ANCHORS = [
  "parallelport", "lumenswap", "driftbridge", "nettlefi", "quaylabs",
  "orbitvault", "saltmarket", "pinebase", "harborsync", "vertexmint",
  "tidalpool", "blueforge", "canopydao", "emberlend", "flintstake",
  "grovenode", "hollowdex", "ironquay", "junipernet", "kelpyield",
  "larkbridge", "mosswap", "northgate", "opalpay", "pebblefi",
  "quiltnode", "riverkeep", "stonepath", "thistledao", "umbrastake",
] as const;

export const ANCHOR_COUNT = ANCHORS.length;

/// One post per anchor so the named accounts actually appear in the feed.
/// Without these the handles exist on chain but nobody ever sees them.
export const ANCHOR_POSTS: Record<string, string> = {
  parallelport: "shipped v2 of the router. 40% fewer calls per swap. changelog in the repo.",
  lumenswap: "pool depth crossed a number we did not expect this quarter. thanks everyone.",
  driftbridge: "post mortem is up. the outage was ours, the fix is live, here is what we changed.",
  nettlefi: "we are removing a feature. usage was 0.3% and it made everything else slower.",
  quaylabs: "hiring one engineer. small team, no meetings before noon, ship weekly.",
  orbitvault: "audit report published. two mediums, both fixed, links in the thread.",
  saltmarket: "fee switch is off and staying off until governance actually votes on it.",
  pinebase: "docs rewrite done. every page now has a runnable example.",
  harborsync: "sub second on the new endpoint. the old one stays up for 90 days.",
  vertexmint: "we were wrong about the pricing model. new one is simpler and cheaper.",
  tidalpool: "maintenance window sunday 02:00 UTC, about twenty minutes.",
  blueforge: "open sourced the indexer we built internally. it is not pretty but it works.",
  canopydao: "proposal 14 passed. treasury diversification starts next week.",
  emberlend: "raised the borrow cap. risk parameters in the forum post.",
  flintstake: "validator set expanded to 40. decentralisation is a slow grind.",
  grovenode: "free tier now includes websockets. no card required.",
  hollowdex: "orderbook migration complete. no downtime, which surprised us too.",
  ironquay: "we are not launching a token. people keep asking.",
  junipernet: "testnet reset scheduled. export anything you care about.",
  kelpyield: "strategy retired. funds are withdrawable, nothing is locked.",
  larkbridge: "added three chains. the fourth broke everything so it waits.",
  mosswap: "gas optimisation shaved 18k per swap. small but it adds up.",
  northgate: "incident resolved. root cause was a config change nobody reviewed.",
  opalpay: "settlement now clears in one block. this took a year.",
  pebblefi: "we simplified the fee structure. one number instead of four.",
  quiltnode: "rate limits raised across all plans. same price.",
  riverkeep: "backup and restore is finally automatic. sorry it took so long.",
  stonepath: "deprecating the v1 API in March. migration guide is in the docs.",
  thistledao: "quorum reached for the first time in months. good turnout.",
  umbrastake: "slashing insurance is live. details and limits in the post.",
};
