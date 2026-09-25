# Mochi Network contracts

A social network on Monad whose **feed ranking is a public contract you can
read, fork and swap**. This directory contains the registries, the on-chain karma
and community ledgers, and every shipped ranking algorithm. The social app,
indexer, and handbook live alongside it in the [Mochi Network repository](../README.md).

Deployed on Monad testnet. Source is readable
straight from [Sourcify](https://repo.sourcify.dev/10143/0x894a39b3Fc34106c0B4724aab8cbB459b8184D46/)
without cloning anything.

## The whole idea, in one interface

```solidity
function rank(address viewer, uint256[] calldata candidateIds)
    external view
    returns (uint256[] memory orderedIds, uint256[] memory scores);
```

A client sends the candidate posts and a viewer; the contract sends back the
order. It is an `eth_call`, so switching algorithms costs nothing, needs no
wallet, and works signed out.

Nothing about deploying your own needs our permission. **[Write your own feed
algorithm](docs/writing-an-algorithm.md)** is the guide, with a worked example
that is deployed and rankable today.

## Deployed

| Contract | Address |
|---|---|
| IdentityRegistry | `0xa67ef35974bc8874318d249b6e74c7bd5870d1db` |
| PostRegistry | `0x894a39b3Fc34106c0B4724aab8cbB459b8184D46` |
| AlgorithmRegistry | `0xFA1Db0d75b316579099eAf0A986690B68f9e8b21` |

Four algorithms and the rest of the addresses are in [DEPLOYED.md](DEPLOYED.md).
Chain id 10143.

## Setup

From the repository root:

```bash
git submodule update --init --recursive
cd contracts
forge test
```

Over a hundred tests, including a Wilson-score parity check against Reddit's
own output and an invariant that a ranking contract never reverts.

## Rules that are not style preferences

- **Post text never enters storage.** It lives in calldata and event data. Only
  what a ranking contract reads belongs in storage.
- **No admin functions anywhere.** No owner, no upgrade path, no `addSeed`.
- **`rank()` must never revert.** A reverting algorithm renders as a blank feed
  with nothing to explain it, and algorithms are deployed by strangers.
- **Votes are weighted by karma, and karma is on chain.** `PostRegistry` keeps
  the whole ledger: a vote is worth the voter's `weightOf`, a like or dislike
  moves the author's `karmaOf` by that much, and voting on your own post is
  refused. A fresh account starts at one per cent of a vote and earns its way
  up, so a ring of new wallets is worth a hundredth of what it would be with a
  whole vote each — [why that works](docs/how-the-feed-works.md).

## Layout

| Path | Purpose |
|---|---|
| `src/interfaces/IFeedAlgorithm.sol` | The contract every algorithm implements |
| `src/` | The registries: identity, posts and karma, communities, algorithms |
| `src/CommunityRegistry.sol` | Community names and public membership; [design](docs/communities.md) |
| `src/algorithms/` | Shipped ranking algorithms, four of them Reddit's |
| `src/examples/` | A standalone example to copy |
| `docs/` | How the feed works, and how to write your own algorithm |
| `DEPLOYED.md` | Addresses and what was verified on chain |

## License

MIT.
