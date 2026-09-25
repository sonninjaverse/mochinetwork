// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import nextConfig from "../next.config";

const SCRIPT = join(__dirname, "..", "scripts", "assemble-release.mjs");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A web directory with a build in it, inside a git checkout unless told not to.
function web(files: Record<string, string>, { git = true } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "mochi-release-"));
  dirs.push(dir);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  if (git) {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "build"], { cwd: dir });
  }
  return dir;
}

const head = (dir: string) => execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();

const assemble = (dir: string) => spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });

// The VPS runs `node server.js` out of a release directory; there is no
// `next start` and no source tree there.
test("the build is a standalone server", () => {
  expect(nextConfig.output).toBe("standalone");
});

// Next picks its trace root by looking for lockfiles upwards, so a stray one
// above web/ on some machine would move server.js down a mirrored path.
test("the trace root is pinned to the app, so every machine builds the same layout", () => {
  expect(nextConfig.outputFileTracingRoot).toBe(join(__dirname, ".."));
});

// These used to come from public/_headers, which only Workers read. Middleware
// skips /_next/static, so next.config is the only place a static file can get
// them.
test("every response, static files included, carries the static security headers", async () => {
  const rules = await nextConfig.headers!();
  const all = rules.find((rule) => rule.source === "/:path*");
  expect(all?.headers).toEqual(
    expect.arrayContaining([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ]),
  );
});

test("a release is the standalone server plus its static assets and public files", () => {
  const dir = web({
    ".next/standalone/server.js": "server",
    ".next/standalone/package.json": "{}",
    ".next/standalone/.next/server/app/page.js": "page",
    ".next/standalone/node_modules/next/package.json": "{}",
    ".next/static/chunks/main.js": "chunk",
    "public/brand/mochi-mark-small.svg": "<svg/>",
  });
  const run = assemble(dir);
  expect(run.status, run.stderr).toBe(0);
  for (const path of [
    "server.js",
    "package.json",
    ".next/server/app/page.js",
    "node_modules/next/package.json",
    ".next/static/chunks/main.js",
    "public/brand/mochi-mark-small.svg",
  ]) {
    expect(existsSync(join(dir, "release", path)), path).toBe(true);
  }
});

// pnpm's node_modules is a tree of relative symlinks into .pnpm. Resolving
// them to absolute paths would point the VPS at the build machine's disk.
test("node_modules symlinks stay relative, so the release still works once copied elsewhere", () => {
  const dir = web({
    ".next/standalone/server.js": "server",
    ".next/standalone/node_modules/.pnpm/next@15/node_modules/next/package.json": "{}",
    ".next/static/chunks/main.js": "chunk",
    "public/favicon.svg": "<svg/>",
  });
  symlinkSync(".pnpm/next@15/node_modules/next", join(dir, ".next/standalone/node_modules/next"));
  const run = assemble(dir);
  expect(run.status, run.stderr).toBe(0);
  const link = join(dir, "release/node_modules/next");
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(readlinkSync(link)).toBe(".pnpm/next@15/node_modules/next");
});

// When Next traces from a directory above web/, standalone mirrors the path
// down to the app and server.js sits there, with the app's node_modules.
test("a server.js nested under a higher trace root becomes the release root", () => {
  const dir = web({
    ".next/standalone/home/ci/repo/web/server.js": "server",
    ".next/standalone/home/ci/repo/web/node_modules/next/package.json": "{}",
    ".next/standalone/home/ci/repo/web/.next/server/app/page.js": "page",
    ".next/static/chunks/main.js": "chunk",
    "public/favicon.svg": "<svg/>",
  });
  const run = assemble(dir);
  expect(run.status, run.stderr).toBe(0);
  for (const path of ["server.js", "node_modules/next/package.json", ".next/server/app/page.js", ".next/static/chunks/main.js", "public/favicon.svg"]) {
    expect(existsSync(join(dir, "release", path)), path).toBe(true);
  }
});

// With pnpm under a higher root, the app's node_modules are links up into the
// root's .pnpm, which is not part of the release.
test("a release whose links point outside it is refused", () => {
  const dir = web({
    ".next/standalone/node_modules/.pnpm/next@15/node_modules/next/package.json": "{}",
    ".next/standalone/repo/web/server.js": "server",
    ".next/static/chunks/main.js": "chunk",
    "public/favicon.svg": "<svg/>",
  });
  mkdirSync(join(dir, ".next/standalone/repo/web/node_modules"));
  symlinkSync("../../../node_modules/.pnpm/next@15/node_modules/next", join(dir, ".next/standalone/repo/web/node_modules/next"));
  const run = assemble(dir);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain("node_modules/next -> ../../../node_modules/.pnpm/next@15/node_modules/next");
  expect(existsSync(join(dir, "release"))).toBe(false);
});

// The commit marker identifies the checkout used to build the release.
test("a release records the commit it was built from", () => {
  const dir = web({ ".next/standalone/server.js": "server", ".next/static/chunks/main.js": "chunk", "public/favicon.svg": "<svg/>" });
  const run = assemble(dir);
  expect(run.status, run.stderr).toBe(0);
  expect(readFileSync(join(dir, "release/COMMIT"), "utf8").trim()).toBe(head(dir));
});

test("outside a git checkout there is no commit to record, so there is no release", () => {
  const dir = web(
    { ".next/standalone/server.js": "server", ".next/static/chunks/main.js": "chunk", "public/favicon.svg": "<svg/>" },
    { git: false },
  );
  const run = assemble(dir);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(/commit/i);
  expect(existsSync(join(dir, "release"))).toBe(false);
});

// Next copies env files next to server.js. .env.production is committed and
// public; anything else (.env, .env.local) is a developer's secrets, and
// public/ is served to anyone who asks.
test("a release carrying any env file but .env.production is refused", () => {
  for (const stray of [".next/standalone/.env", ".next/standalone/.env.local", "public/.env.production.local"]) {
    const dir = web({
      ".next/standalone/server.js": "server",
      ".next/standalone/.env.production": "NEXT_PUBLIC_X=1",
      ".next/static/chunks/main.js": "chunk",
      "public/favicon.svg": "<svg/>",
      [stray]: "SECRET=1",
    });
    const run = assemble(dir);
    expect(run.status, stray).not.toBe(0);
    expect(run.stderr).toContain(stray.replace(/^\.next\/standalone\//, ""));
    expect(existsSync(join(dir, "release"))).toBe(false);
  }
});

test(".env.production alone is shipped", () => {
  const dir = web({
    ".next/standalone/server.js": "server",
    ".next/standalone/.env.production": "NEXT_PUBLIC_X=1",
    ".next/static/chunks/main.js": "chunk",
    "public/favicon.svg": "<svg/>",
  });
  const run = assemble(dir);
  expect(run.status, run.stderr).toBe(0);
  expect(existsSync(join(dir, "release/.env.production"))).toBe(true);
});

test("without a server.js it fails loudly rather than shipping an empty release", () => {
  const unbuilt = { ".next/static/chunks/main.js": "chunk", "public/favicon.svg": "<svg/>" };
  for (const files of [unbuilt, { ...unbuilt, ".next/standalone/package.json": "{}" }]) {
    const dir = web(files);
    const run = assemble(dir);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/server\.js/);
    expect(existsSync(join(dir, "release"))).toBe(false);
  }
});

test("a rebuild replaces the previous release instead of layering onto it", () => {
  const dir = web({
    ".next/standalone/server.js": "server",
    ".next/static/chunks/main.js": "chunk",
    "public/favicon.svg": "<svg/>",
    "release/.next/static/chunks/stale.js": "old",
  });
  const run = assemble(dir);
  expect(run.status, run.stderr).toBe(0);
  expect(existsSync(join(dir, "release/.next/static/chunks/main.js"))).toBe(true);
  expect(existsSync(join(dir, "release/.next/static/chunks/stale.js"))).toBe(false);
});
