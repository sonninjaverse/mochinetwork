import { beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db";
import { createServer } from "../src/server";

const KEY = `0x${"11".repeat(32)}`;
const ADDRESS = "0x5dBF1ea2Fad87A3f7F15609D5dC4A8DFF9b64969";

const post = (body: unknown) =>
  new Request("http://localhost/drip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const app = () => createServer(openDb(":memory:"));

beforeEach(() => {
  process.env.DRIP_PRIVATE_KEY = KEY;
});

describe("starter drip", () => {
  it("says so when no drip wallet is configured", async () => {
    delete process.env.DRIP_PRIVATE_KEY;
    const res = await app().fetch(post({ address: ADDRESS }));
    expect(res.status).toBe(503);
  });

  it("refuses a malformed address", async () => {
    const res = await app().fetch(post({ address: "not-an-address" }));
    expect(res.status).toBe(400);
  });

  /// The rule the database enforces: one drip per address, ever. A replay is
  /// answered without touching the chain, so it costs nothing to be asked.
  it("answers a second request for the same address without sending again", async () => {
    const db = openDb(":memory:");
    db.prepare(
      "INSERT INTO starter_drips (address, tx_hash, amount, created_at) VALUES (?, ?, ?, ?)",
    ).run(ADDRESS.toLowerCase(), "0xdead", "0.05", Date.now());

    const res = await createServer(db).fetch(post({ address: ADDRESS }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, already: true });
  });

  it("does not read the address case as a different wallet", async () => {
    const db = openDb(":memory:");
    db.prepare(
      "INSERT INTO starter_drips (address, tx_hash, amount, created_at) VALUES (?, ?, ?, ?)",
    ).run(ADDRESS.toLowerCase(), "0xdead", "0.05", Date.now());

    const lower = ADDRESS.toLowerCase();
    const res = await createServer(db).fetch(post({ address: lower }));
    expect(await res.json()).toEqual({ ok: true, already: true });
  });
});
