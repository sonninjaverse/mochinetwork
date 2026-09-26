import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db";

export const INVITES_PER_ACCOUNT = 3;
export const INVITE_SESSION_COOKIE = "mochi_invite";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const normalizeCode = (code: string) => code.trim().toLowerCase();
export const nowSeconds = () => Math.floor(Date.now() / 1000);

type Session = { token_hash: string; code: string | null; address: string | null; expires_at: number };
export type Challenge = { id: string; address: string; message: string; session_hash: string | null; expires_at: number };

/** Snapshot existing participants once; future accounts must come through an invite. */
export function initializeInvites(db: Db, bootstrapCodes: string[]): void {
  db.transaction(() => {
    if (!db.prepare("SELECT 1 FROM invite_meta WHERE key = 'migrated'").get()) {
      db.prepare(`INSERT OR IGNORE INTO invite_members (address, joined_at)
        SELECT lower(address), ? FROM (
          SELECT address FROM handles UNION SELECT author FROM posts
          UNION SELECT account FROM memberships
          UNION SELECT account FROM likes UNION SELECT account FROM dislikes
          UNION SELECT creator FROM communities
        ) WHERE address GLOB '0x*' AND length(address) = 42`).run(nowSeconds());
      db.prepare("INSERT INTO invite_meta (key, value) VALUES ('migrated', '1')").run();
    }
    // Former shared codes become single-use bootstrap invitations. INSERT OR
    // IGNORE never revives a used code on restart, even if it remains in .env.
    const insert = db.prepare("INSERT OR IGNORE INTO invite_codes (code, created_at) VALUES (?, ?)");
    for (const code of bootstrapCodes) if (code.trim()) insert.run(normalizeCode(code), nowSeconds());
  }).immediate();
}

export function issueCode(db: Db, owner: string | null = null): string {
  const code = `mochi-${randomBytes(6).toString("hex")}`;
  db.prepare("INSERT INTO invite_codes (code, owner, created_at) VALUES (?, ?, ?)")
    .run(code, owner, nowSeconds());
  return code;
}

export function inviteSession(db: Db, token: string | undefined): Session | undefined {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  return db.prepare("SELECT * FROM invite_sessions WHERE token_hash = ? AND expires_at > ?")
    .get(hashToken(token), nowSeconds()) as Session | undefined;
}

function createSession(db: Db, ttl: number, address: string | null, code: string | null): string {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO invite_sessions (token_hash, address, code, expires_at) VALUES (?, ?, ?, ?)")
    .run(hashToken(token), address, code, nowSeconds() + ttl);
  return token;
}

/** The update and cookie-session allocation commit together, including across processes. */
export function redeemInvite(db: Db, code: string, ttl: number): string | null {
  return db.transaction(() => {
    const result = db.prepare("UPDATE invite_codes SET used_at = ? WHERE code = ? AND used_at IS NULL")
      .run(nowSeconds(), normalizeCode(code));
    if (result.changes !== 1) return null;
    return createSession(db, ttl, null, normalizeCode(code));
  }).immediate();
}

export function createChallenge(db: Db, address: string, origin: string, token?: string): Challenge | null {
  const now = nowSeconds();
  db.prepare("DELETE FROM invite_challenges WHERE expires_at <= ?").run(now);
  db.prepare("DELETE FROM invite_sessions WHERE expires_at <= ?").run(now);
  const count = (db.prepare("SELECT count(*) AS n FROM invite_challenges").get() as { n: number }).n;
  if (count >= 5000) return null;
  const id = randomBytes(32).toString("hex");
  const expires_at = now + 300;
  const message = [
    `${new URL(origin).host} wants you to sign in to Mochi:`, address,
    "", "Confirm your account to access Mochi and your invitations. No transaction or gas fee.",
    "", `URI: ${origin}`, `Nonce: ${id}`, `Expires: ${new Date(expires_at * 1000).toISOString()}`,
  ].join("\n");
  const challenge = { id, address, message, session_hash: inviteSession(db, token)?.token_hash ?? null, expires_at };
  db.prepare("INSERT INTO invite_challenges (id, address, message, session_hash, expires_at) VALUES (@id, @address, @message, @session_hash, @expires_at)")
    .run(challenge);
  return challenge;
}

export function getChallenge(db: Db, id: string, token?: string): Challenge | undefined {
  const challenge = db.prepare("SELECT * FROM invite_challenges WHERE id = ? AND expires_at > ?")
    .get(id, nowSeconds()) as Challenge | undefined;
  if (challenge?.session_hash !== (inviteSession(db, token)?.token_hash ?? null)) return undefined;
  return challenge;
}

/** Called only after verifying the exact stored message with the claimed wallet. */
export function admitAccount(db: Db, challengeId: string, ttl: number, token?: string): string | null {
  return db.transaction(() => {
    // Verification is async; re-read everything under the write lock so a
    // concurrent request cannot reuse a challenge or bind two accounts.
    const challenge = getChallenge(db, challengeId, token);
    if (!challenge) return null;
    db.prepare("DELETE FROM invite_challenges WHERE id = ?").run(challengeId);
    const address = challenge.address;
    const session = inviteSession(db, token);
    const member = db.prepare("SELECT 1 FROM invite_members WHERE address = ?").get(address);
    if (!member) {
      if (!session?.code || session.address) return null;
      const invite = db.prepare("SELECT owner FROM invite_codes WHERE code = ? AND used_at IS NOT NULL AND used_by IS NULL")
        .get(session.code) as { owner: string | null } | undefined;
      if (!invite) return null;
      db.prepare("INSERT INTO invite_members (address, invited_by, joined_at) VALUES (?, ?, ?)")
        .run(address, invite.owner, nowSeconds());
      db.prepare("UPDATE invite_codes SET used_by = ? WHERE code = ?").run(address, session.code);
    } else if (session?.code && !session.address) {
      // A returning member does not count as a new referral. Give the inviter
      // their code back, and revoke this pending session below.
      db.prepare("UPDATE invite_codes SET used_at = NULL WHERE code = ? AND used_by IS NULL").run(session.code);
    }
    const count = (db.prepare("SELECT count(*) AS n FROM invite_codes WHERE owner = ?").get(address) as { n: number }).n;
    if (count === 0) for (let i = 0; i < INVITES_PER_ACCOUNT; i++) issueCode(db, address);
    if (session) db.prepare("DELETE FROM invite_sessions WHERE token_hash = ?").run(session.token_hash);
    return createSession(db, ttl, address, null);
  }).immediate();
}

export function invitationsFor(db: Db, address: string) {
  return db.prepare(`SELECT i.code, i.used_at AS usedAt, i.used_by AS usedBy, h.handle
    FROM invite_codes i LEFT JOIN handles h ON h.address = i.used_by
    WHERE i.owner = ? ORDER BY i.created_at, i.code`).all(address) as {
      code: string; usedAt: number | null; usedBy: string | null; handle: string | null;
    }[];
}
