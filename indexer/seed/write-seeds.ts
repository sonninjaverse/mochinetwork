/**
 * Writes contracts/seeds.json from the anchor set.
 *
 * The deployer goes first so there is always one anchor whose key is in
 * contracts/.env, then the thirty named anchors.
 */
import { writeFileSync } from "node:fs";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { ANCHOR_OFFSET, ANCHORS } from "./anchors";

const key = process.env.TEAM_PRIVATE_KEY!;
const deployer = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);

const anchors = ANCHORS.map((handle, i) => ({
  handle,
  address: mnemonicToAccount(process.env.SEED_MNEMONIC!, { addressIndex: ANCHOR_OFFSET + i })
    .address,
}));

writeFileSync(
  "../contracts/seeds.json",
  `${JSON.stringify(
    {
      comment:
        "Depth-0 trust anchors: the deployer plus thirty team-controlled wallets derived at ANCHOR_OFFSET. Handles are invented rather than borrowed from real projects — the sybil defence rests on this set being trustworthy, so putting wallets we control behind identities we do not own would undermine the very mechanism it protects. Controlled anchors also vouch, which is what gives the graph a realistic depth distribution instead of everything hanging off one wallet.",
      seeds: [deployer.address, ...anchors.map((a) => a.address)],
    },
    null,
    2,
  )}\n`,
);

console.log(`deployer  ${deployer.address}`);
for (const a of anchors.slice(0, 6)) console.log(`  ${a.handle.padEnd(14)} ${a.address}`);
console.log(`  ... and ${anchors.length - 6} more`);
console.log(`\nWrote ../contracts/seeds.json with ${anchors.length + 1} anchors`);
