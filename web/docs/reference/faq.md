# FAQ

## Why 14 downvotes but karma of −602?

Because **14 is the number of people, while karma is total weight**. Each person has
a weight from 0 to 200 depending on their own karma, so one vote can be worth 1, 25,
or 100 points. Add to that the fact that karma is a **whole-account** total, not for
a single post. Details and a worked example with a table are in
[Karma and weight](/guide/karma).

## My name's edge shows a different number than the vote button's edge?

Correct. The vote button's edge is the **raw difference** `likeCount − dislikeCount`
(number of people). The name's edge is **weighted karma**. To get a number that
matches karma, add `weightedLikes − weightedDislikes`.

## Why is a vote worth 0 when karma is negative?

An account that the whole room downvoted should not still be able to "save" itself by
going off to vote on others. It is not locked out forever: once others upvote it back
above 0, its weight recovers immediately. Karma of exactly 0 still gets weight 1, so
a new wallet is not muted.

## Isn't one person one vote fairer?

With one person one vote, **2 clone wallets = 1 real person**. Here a new wallet is
worth 0.01 votes, so a ring needs ~100 wallets to equal one ordinary vote. The
tradeoff is intentional: stay fair to newcomers, but raise the price of a sybil
attack by two orders of magnitude.

## Can the indexer manipulate the feed?

No. The indexer only chooses **which posts** are considered; **order** is an
`eth_call` to the contracts. It has no secret weights and does not score. Delete the
indexer and it rebuilds from the chain.

## Who can delete my post?

No one. No contract has an admin function, and `CommunityRegistry` cannot delete
posts or ban accounts.

## Can I write my own ranking algorithm?

Yes, no permission needed. Deploy the contract, paste the address into the feed
picker, or `register` it and set it as the default. See
[Writing your own algorithm](/algorithms/writing).

## What if I lose my device / passkey?

The account **is the passkey** on the device. There is no email or password to
recover. Passkeys are scoped to their WebAuthn relying party. Keep the configured
`NEXT_PUBLIC_RP_ID` stable; a passkey cannot authenticate on an unrelated host.

## Where are saved posts stored?

On **your device** (localStorage), not on-chain. It is a private bookmark, and
putting it on-chain would both cost fees and publicize what you read.

## How do I fund my account?

Deposit MON from a wallet you control. Open your profile and use **Deposit**,
which shows the account address (and a QR code) to copy; **Withdraw** sends MON
from the account to any address you name. The account is a wallet derived from
your passkey, so the address is yours alone.
