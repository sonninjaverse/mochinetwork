# Deployed contracts — Monad testnet

**Chain id 10143 · redeployed 2026-09-18 · explorer https://testnet.monadscan.com**

Every contract below is verified on Sourcify with an `exact_match` on both
creation and runtime bytecode, so the source can be read without cloning:
`https://repo.sourcify.dev/10143/<address>/`

> **No follow graph.** Vote weight is derived from karma, and karma is kept by
> `PostRegistry` itself — see below. Identity and Community were deployed at
> block **63285812** by `script/Deploy.s.sol`; the karma-aware half (posts and
> the sorts that read them) was last redeployed at block **63656426** by
> `script/RedeployPosts.s.sol`, which leaves Identity and Community in place.

`PostRegistry` holds an immutable reference to `CommunityRegistry`, and
`postToCommunity` refuses a post from an account that has not joined. A post
carries its community as a `bytes32` field — the text is only text now — and a
reply inherits its parent's community, so commenting does not require joining.
The limits the client used to enforce alone are on chain too: post text at 1024
bytes, `mediaURI` at 256, metadata at 8 KB, and a handle's alphabet.

| Contract | Address | Deployed |
|---|---|---|
| IdentityRegistry | `0xa67ef35974bc8874318d249b6e74c7bd5870d1db` | 63285812 |
| CommunityRegistry | `0x41c19889a3218000482a1cd6e13640edcd16cf32` | 63285812 |
| PostRegistry | `0x894a39b3Fc34106c0B4724aab8cbB459b8184D46` | 63656426 |
| ChronoFeed | `0x77b9fE5CBAB95453f5aAAB24d3c2de874B62E484` | 63656426 |
| HotFeed | `0xC52462A8d74c8E1A76D7d53e0e5CA32fF1c75f40` | 63656426 |
| BestFeed | `0x58298dFb756Ca8400d1d36F8268E4786C9a64d9B` | 63656426 |
| ControversialFeed | `0x76953BcFd5AB00aAd3f0c0Fee0bAbaf92031985D` | 63656426 |
| AlgorithmRegistry | `0xFA1Db0d75b316579099eAf0A986690B68f9e8b21` | 63656426 |

Default feed slot: HotFeed. BestFeed takes the second slot.
Four algorithms registered. No contract has an admin function.

### Karma and vote weight are on chain

`PostRegistry.karmaOf(account)` is the signed sum of weighted votes an account
has received — 100 points to a whole vote. `PostRegistry.weightOf(account)`
turns that karma into the weight of the account's next vote, and **a fresh
account starts at 1, not 100**: everyone may vote on day one, but a stranger's
vote is one per cent of one until the room trusts it. 50 karma (fifty distinct
accounts having upvoted your writing) is a whole vote; 5,000 is the cap at two.
Karma below zero is silenced outright: the vote is worth nothing until the room
upvotes the account back above zero, so a heavily downvoted account cannot be
its own rescue. That is the sybil defence — a ring spends a hundred wallets per
unit of influence instead of two. `like` and `dislike` write both karma and the
weighted counts, and a vote on your own post is refused. There is no
reputation service to trust: the number a client shows is the number the
ranking contracts used.

## Verified on chain

```
karmaOf(0x...dEaD)                -> 0        no votes received yet
weightOf(0x...dEaD)               -> 1        a fresh account's vote is one per cent
weightOf(negative karma)          -> 0        silenced until upvoted back above zero
algorithmCount()                  -> 4
algorithmOf(anyone, SLOT_FEED)    -> HotFeed
rank(viewer, [1])                 -> scored, no revert
```

`evm_version = "shanghai"` is accepted by Monad. No opcode fallback to `paris` needed.

## Real cost on Monad testnet

Gas price at deployment: **102 gwei**.

| Action | Gas | Cost |
|---|---|---|
| Deploy every contract | ~4.5M | ~0.5 MON |
| `post` | 67,146 | 0.00695 MON |
| `like` | 99,492 | ~0.0102 MON |

Gas figures above were measured at deployment and are not a current fee estimate.

## Redeploying

Full deploy, including Identity and Community:

```bash
cd contracts
set -a && . ./.env && set +a
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$MONAD_TESTNET_RPC" --private-key "$PRIVATE_KEY" --broadcast
```

Redeploy only posts and the sorts, keeping handles and communities:

```bash
forge script script/RedeployPosts.s.sol:RedeployPosts \
  --rpc-url "$MONAD_TESTNET_RPC" --private-key "$PRIVATE_KEY" --broadcast
```

## Toolchain

- Foundry 1.7.1, solc 0.8.24, `evm_version = "shanghai"`
- `forge-std` pinned at v1.16.2 as a git submodule
- Run `forge test` for the current test suite

A fresh clone needs the submodule:

```bash
git submodule update --init --recursive
```
