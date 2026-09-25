// Assembles a self-contained Node.js release with assets and a COMMIT marker.
// Next traces runtime dependencies but leaves public/ and .next/static separate.
// Usage: node scripts/assemble-release.mjs [webDir]   (default: this app)
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const standalone = join(web, ".next", "standalone");
const release = join(web, "release");

function fail(message) {
  console.error(`assemble-release: ${message}`);
  process.exit(1);
}

// Once copying has started, a refused release must not stay behind for a
// deploy to pick up.
function discard(message) {
  rmSync(release, { recursive: true, force: true });
  fail(message);
}

// server.js sits at the top of standalone unless Next traced from a directory
// above the app, in which case standalone mirrors the path down to it. The
// shallowest one outside node_modules and .next is the app's.
function findServerDir(top) {
  const queue = [top];
  while (queue.length > 0) {
    const dir = queue.shift();
    const server = join(dir, "server.js");
    if (existsSync(server) && statSync(server).isFile()) return dir;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next") queue.push(join(dir, entry.name));
    }
  }
  return null;
}

// A symlink that is absolute, or climbs out of the release, works on this
// machine and dangles on the VPS.
function escapingLinks(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = readlinkSync(path);
      const resolved = resolve(dirname(path), target);
      const inside = !isAbsolute(target) && (resolved === release || resolved.startsWith(release + sep));
      if (!inside || !existsSync(path)) found.push(`${relative(release, path)} -> ${target}`);
    } else if (entry.isDirectory()) {
      escapingLinks(path, found);
    }
  }
  return found;
}

// Next copies .env and .env.production beside server.js. .env.production is
// committed and holds only public values; any other env file is somebody's
// secrets, and under public/ it would be served to anyone.
function strayEnvFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) strayEnvFiles(path, found);
    else if (entry.name.startsWith(".env") && entry.name !== ".env.production") found.push(relative(release, path));
  }
  return found;
}

function builtCommit() {
  try {
    const sha = execFileSync("git", ["-C", web, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(sha)) return sha;
  } catch {
    // Reported below.
  }
  return fail(`cannot tell which commit this is: \`git rev-parse HEAD\` failed in ${web}. A release must record its commit.`);
}

if (!existsSync(standalone)) {
  fail(`no server.js: ${standalone} does not exist. Run \`pnpm build\` first; next.config.ts must set output: "standalone".`);
}
const serverDir = findServerDir(standalone);
if (!serverDir) fail(`no server.js under ${standalone}. The standalone build is incomplete; refusing to assemble a release without a server.`);
const statics = join(web, ".next", "static");
if (!existsSync(statics)) fail(`${statics} is missing. A release without it serves pages with no scripts or styles.`);
const commit = builtCommit();

rmSync(release, { recursive: true, force: true });
// verbatimSymlinks: pnpm's node_modules is relative links into .pnpm, and
// Node would otherwise rewrite them as absolute paths on this disk.
cpSync(serverDir, release, { recursive: true, verbatimSymlinks: true });
cpSync(statics, join(release, ".next", "static"), { recursive: true });
const pub = join(web, "public");
if (existsSync(pub)) cpSync(pub, join(release, "public"), { recursive: true, verbatimSymlinks: true });

const strays = strayEnvFiles(release);
if (strays.length > 0) {
  discard(`refusing to ship env files other than .env.production:\n  ${strays.join("\n  ")}`);
}

const escaping = escapingLinks(release);
if (escaping.length > 0) {
  discard(
    `the release links outside itself, so it would break once copied to the VPS:\n  ${escaping.slice(0, 10).join("\n  ")}\n` +
      "Next probably traced from a directory above web/; pin outputFileTracingRoot in next.config.ts.",
  );
}

writeFileSync(join(release, "COMMIT"), `${commit}\n`);

const from = relative(web, serverDir);
console.log(`Assembled ${relative(process.cwd(), release) || release} at ${commit} from ${from} (+ .next/static${existsSync(pub) ? ", public" : ""})`);
