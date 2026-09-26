import Database from "better-sqlite3";

export type Db = Database.Database;

/**
 * Chain tables store raw events. Counts and karma are derived at
 * read time by queries.ts. Invite and push tables hold local application state.
 *
 * Holding a running counter would make a rebuild depend on the order events
 * were applied in, which is exactly what the determinism test in Task 5 exists
 * to rule out. The counter is also the thing an indexer could quietly get
 * wrong, and ranking reads it.
 */
export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id          TEXT PRIMARY KEY,
      author      TEXT NOT NULL,
      text        TEXT NOT NULL,
      -- "" for a post with no image. A content address, never a fetched URL.
      media_uri   TEXT NOT NULL DEFAULT '',
      -- "0" for a top-level post, else the post this replies to.
      parent_id   TEXT NOT NULL DEFAULT '0',
      created_at  INTEGER NOT NULL,
      block       INTEGER NOT NULL,
      log_index   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS likes (
      post_id    TEXT NOT NULL,
      account    TEXT NOT NULL,
      active     INTEGER NOT NULL,
      block      INTEGER NOT NULL,
      log_index  INTEGER NOT NULL,
      -- The voter's weight at the moment they voted, straight off the Liked
      -- event. Karma sums these instead of counting votes 1-for-1.
      weight     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (post_id, account)
    );

    CREATE TABLE IF NOT EXISTS dislikes (
      post_id    TEXT NOT NULL,
      account    TEXT NOT NULL,
      active     INTEGER NOT NULL,
      block      INTEGER NOT NULL,
      log_index  INTEGER NOT NULL,
      weight     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (post_id, account)
    );

    CREATE TABLE IF NOT EXISTS communities (
      name TEXT PRIMARY KEY,
      creator TEXT NOT NULL,
      metadata_uri TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      created_block INTEGER NOT NULL,
      created_log_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS memberships (
      name TEXT NOT NULL,
      account TEXT NOT NULL,
      active INTEGER NOT NULL,
      block INTEGER NOT NULL,
      log_index INTEGER NOT NULL,
      PRIMARY KEY (name, account)
    );

    CREATE TABLE IF NOT EXISTS indexed_sources (
      address TEXT PRIMARY KEY,
      through_block INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS handles (
      address      TEXT PRIMARY KEY,
      handle       TEXT NOT NULL,
      metadata_uri TEXT
    );

    -- Web Push endpoints, keyed by endpoint because that is what the push
    -- service knows. The preferences ride along as JSON: a push is sent from
    -- here, not from the browser, so the server has to know what to send.
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint   TEXT PRIMARY KEY,
      address    TEXT NOT NULL,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      prefs      TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_push_address ON push_subscriptions (address);

    CREATE TABLE IF NOT EXISTS cursor (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      last_block INTEGER NOT NULL
    );

    -- Invite state is local application data, not a projection of chain logs.
    -- Keep it when rebuilding the event index.
    CREATE TABLE IF NOT EXISTS invite_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS invite_members (
      address TEXT PRIMARY KEY,
      invited_by TEXT REFERENCES invite_members(address),
      joined_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      owner TEXT REFERENCES invite_members(address),
      created_at INTEGER NOT NULL,
      used_at INTEGER,
      used_by TEXT UNIQUE REFERENCES invite_members(address)
    );
    CREATE INDEX IF NOT EXISTS idx_invite_owner ON invite_codes(owner);
    CREATE TABLE IF NOT EXISTS invite_sessions (
      token_hash TEXT PRIMARY KEY,
      code TEXT REFERENCES invite_codes(code),
      address TEXT REFERENCES invite_members(address),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invite_challenges (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      message TEXT NOT NULL,
      session_hash TEXT,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invite_challenge_expiry ON invite_challenges(expires_at);

    INSERT OR IGNORE INTO cursor (id, last_block) VALUES (1, 0);

    CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at DESC);
    -- Every candidate query filters replies out, and the permalink page asks
    -- for one parent's children.
    CREATE INDEX IF NOT EXISTS idx_posts_parent  ON posts (parent_id);
    CREATE INDEX IF NOT EXISTS idx_likes_post    ON likes (post_id) WHERE active = 1;
    CREATE INDEX IF NOT EXISTS idx_dislikes_post ON dislikes (post_id) WHERE active = 1;
    CREATE INDEX IF NOT EXISTS idx_memberships_account ON memberships (account) WHERE active = 1;
  `);

  migrate(db);

  return db;
}

/**
 * Brings an existing database up to the current schema in place.
 *
 * Dropping and re-indexing is not an option: Monad produces ~288,000 blocks a
 * day and the public RPC caps eth_getLogs at 100 blocks, so a rebuild after a
 * week is ~20,000 sequential requests.
 */
export function migrate(db: Db): void {
  const add = (table: string, column: string, decl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
      return true;
    }
    return false;
  };

  add("posts", "community", "TEXT NOT NULL DEFAULT ''");
  add("likes", "weight", "INTEGER NOT NULL DEFAULT 0");
  add("dislikes", "weight", "INTEGER NOT NULL DEFAULT 0");
  // Existing databases need the column before SQLite can build its index.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_community
    ON posts (community, created_at DESC) WHERE parent_id = '0'`);
}
