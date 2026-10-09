# The tMON faucet

Mochi lives on Monad testnet, and testnet MON (tMON) is what pays for gas: a
wallet cannot register a handle, post, or vote without it. A wallet that
arrives with none has no way to take its first step. `Faucet.sol` is the
contract that removes that first friction: one fixed claim, per wallet, once.

**Deployed:** `0x27292dd0e94b68d5d0567fd26081bac030502925` (block 69449856,
2026-10-09), verified on Sourcify, funded with 30 tMON. A wallet with no gas
of its own still needs a little MON to send the claim transaction itself —
the faucet gives the head start, not the first drop.

## What it does

- Holds a float of tMON that anyone can add to.
- Sends `3 tMON` to a wallet that has never claimed from it.
- Refuses a second claim from the same wallet, forever.
- Reverts — without spending the caller's one claim — when the float cannot
  cover another payout.

There is no owner and no admin, in keeping with the rest of the contracts.
Funding is open: anyone can send MON to the contract, and the `Funded` event
records it.

## What "new user" means here

A contract cannot see whether an address belongs to a person, so the rule is
the narrowest one it can enforce: **a wallet is eligible if it has never
claimed from this faucet.** That is the definition the product agreed to before
launch, and the client shows the same rule the contract enforces — a wallet
that has claimed reads "Already claimed" and the button is spent.

This is a testnet faucet, not an airdrop: the amount is small (enough for a
name and some posting), the float is finite, and the abuse model is the float
itself.

## Deploy and fund

From `contracts/` with `.env` set (`MONAD_TESTNET_RPC`, `PRIVATE_KEY`):

```bash
set -a && . ./.env && set +a
forge script script/DeployFaucet.s.sol:DeployFaucet \
  --rpc-url "$MONAD_TESTNET_RPC" --private-key "$PRIVATE_KEY" --broadcast
```

Then fund it. Thirty tMON covers ten first claims:

```bash
cast send <faucet-address> --value 30ether \
  --rpc-url "$MONAD_TESTNET_RPC" --private-key "$PRIVATE_KEY"
```

Put the address in the web app's environment as `NEXT_PUBLIC_FAUCET` and the
claim button appears on a signed-in wallet's own profile.

## Refill

Send more MON to the same address. The balance is public; keep an eye on it
while a demo is live. When it runs dry, claims revert as `Empty()` rather than
the contract promising funds it does not have.

## Checking it on chain

```bash
cast call <faucet-address> "claimed(address)(bool)" <wallet>
cast call <faucet-address> "CLAIM_AMOUNT()(uint256)"
cast balance <faucet-address>
```
