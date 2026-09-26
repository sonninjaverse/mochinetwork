/** Operator-only command. Run on the indexer host; never expose this as an API. */
import { openDb } from "../src/db";
import { issueCode } from "../src/invites";

const count = Number(process.argv[2] ?? "3");
if (!Number.isInteger(count) || count < 1 || count > 100) {
  throw new Error("Usage: npm run invites -- [count between 1 and 100]");
}
const db = openDb(process.env.DB_PATH ?? "./mochi.db");
try {
  const codes = db.transaction(() => Array.from({ length: count }, () => issueCode(db))).immediate();
  // Intentional operator output. Do not commit these codes or put them in CI logs.
  console.log(codes.join("\n"));
} finally { db.close(); }
