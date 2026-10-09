import { beforeEach, expect, it } from "vitest";
import { isSaved, openVault, savedIds, sealVault, toggleSaved } from "./saved";

beforeEach(() => localStorage.clear());

async function key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

it("toggles a post in and out of saved", () => {
  expect(isSaved("1")).toBe(false);
  toggleSaved("1");
  expect(isSaved("1")).toBe(true);
  expect(savedIds()).toEqual(["1"]);
  toggleSaved("1");
  expect(isSaved("1")).toBe(false);
  expect(savedIds()).toEqual([]);
});

it("keeps the newest save first", () => {
  toggleSaved("1");
  toggleSaved("2");
  expect(savedIds()).toEqual(["2", "1"]);
});

it("survives a corrupt value rather than throwing", () => {
  localStorage.setItem("mochi-saved", "not json");
  expect(savedIds()).toEqual([]);
  toggleSaved("3");
  expect(savedIds()).toEqual(["3"]);
});

/// The non-account key: ciphertext at rest, and only the same passkey's key
/// brings the list back.
it("seals a saved list so the ids are not readable in storage", async () => {
  const envelope = await sealVault(await key(), ["4", "2"]);
  expect(envelope.v).toBe(2);
  expect(JSON.stringify(envelope)).not.toContain("4");
});

it("opens a sealed list only with the key that sealed it", async () => {
  const same = await key();
  const envelope = await sealVault(same, ["4", "2"]);
  expect(await openVault(same, envelope)).toEqual(["4", "2"]);
  await expect(openVault(await key(), envelope)).rejects.toThrow();
});
