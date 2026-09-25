import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

const WEB = join(__dirname, "..", "..");
const SKIP = new Set(["node_modules", ".next", "release", "tests", "e2e", "public", "docs"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|mjs)$/.test(name) ? [path] : [];
  });
}

const rel = (file: string) => relative(WEB, file);

// adapter.ts: "nothing else in the app imports mera or constructs a key".
test("only src/lib/wallet touches mera or makes a key", () => {
  const offenders = sources(WEB)
    .filter((file) => !rel(file).startsWith("src/lib/wallet/"))
    .filter((file) =>
      /@category-labs\/mera|generatePrivateKey|privateKeyToAccount|mnemonicToAccount/.test(readFileSync(file, "utf8")),
    );
  expect(offenders.map(rel)).toEqual([]);
});

test("no extension-wallet stack is left", () => {
  const offenders = sources(WEB).filter((file) =>
    /from ["'](wagmi|@wagmi\/|@reown\/|@tanstack\/react-query)/.test(readFileSync(file, "utf8")),
  );
  expect(offenders.map(rel)).toEqual([]);
});
