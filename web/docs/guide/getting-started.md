# Enter the app and create a wallet

## Network

| | |
|---|---|
| Chain id | `10143` (Monad testnet) |
| RPC | `https://testnet-rpc.monad.xyz` |
| Explorer | [testnet.monadscan.com](https://testnet.monadscan.com) |
| Local app | `http://localhost:3000` |
| Local API | `http://localhost:8787` |

## Open the app

Use the Open app link in this handbook. For local setup, follow
[Running and deploying Mochi](/reference/deploy).

The invite gate is optional and disabled by default. If a deployment enables it,
the team supplies an invite code; the handbook never contains gate codes or keys.

## An account is a passkey

No email, no password. Each account is a **passkey (WebAuthn)**:

- The key is created on your own device (Touch ID, Windows Hello, security key).
- From the passkey, the client derives a deterministic **wallet**, used to sign transactions.
- Passkeys are scoped to the host where they were created. A deployment can set
  `NEXT_PUBLIC_RP_ID` to a stable parent host for multiple subdomains.

Use HTTPS or localhost. Existing passkeys cannot be used on an unrelated host.

## Address and name

An account can be referenced in two ways:

- **Address** `0x…` — always exists, never changes.
- **Handle** `alice` — a 3–15 character string, only lowercase letters, digits and
  `_`. The narrow alphabet is intentional: uppercase and lookalike characters are
  where impersonation starts.

Renaming **returns the old name** in the same transaction, so no one can hold two
names and no name gets stuck.

## Gas

Posting, voting, and creating communities are all on-chain transactions, so they
need MON. **Deposit** MON from any wallet you control: your profile shows the
account address and a QR code to send to, and **Withdraw** sends MON back out to
an address you name. Everything here is gas — no server pays on your behalf.

If your account runs out of MON midway, the transaction won't go through; top it
up from the same screen.

## Next steps

- [Karma and weight](/guide/karma) — understand why each person's vote weighs differently.
- [Voting](/guide/voting).
