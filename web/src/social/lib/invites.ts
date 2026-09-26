import { getWallet } from "@/lib/wallet";
import { apiFetch } from "./api";

const BASE = process.env.NEXT_PUBLIC_INDEXER_URL;
export type Invite = { code: string; usedAt: number | null; usedBy: string | null; handle: string | null };
export type Invitations = { address: string; allowance: number; remaining: number; joined: number; codes: Invite[] };
export type GateStatus = { enabled: boolean; open: boolean; address: string | null };

async function json<T>(path: string, body?: unknown): Promise<T> {
  if (!BASE) throw new Error("The invite service is not configured.");
  const response = await apiFetch(`${BASE}${path}`, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not reach the invite service. Please try again.");
  return data;
}

export const gateStatus = () => json<GateStatus>("/gate/status");

export async function endInviteSession(): Promise<boolean> {
  if (!(await gateStatus()).enabled) return false;
  await json("/gate/logout", {});
  return true;
}

/** The server verifies a fresh, single-use wallet proof; an address alone never grants invites. */
export async function confirmInviteAccount(): Promise<boolean> {
  const status = await gateStatus();
  if (!status.enabled) return false;
  const wallet = getWallet();
  // signIn deliberately has no create-account fallback.
  await wallet.signIn();
  const address = await wallet.getAccount();
  if (status.address?.toLowerCase() === address.toLowerCase() && status.open) return true;
  const challenge = await json<{ id: string; message: string }>("/gate/challenge", { address });
  const signature = await wallet.signMessage(challenge.message);
  await json("/gate/session", { id: challenge.id, signature });
  return true;
}

export async function loadInvitations(): Promise<Invitations> {
  if (!await confirmInviteAccount()) throw new Error("Invitations are not enabled on this deployment.");
  const result = await json<Invitations>("/gate/invites");
  if (result.address.toLowerCase() !== getWallet().rememberedAddress()?.toLowerCase()) {
    throw new Error("The account changed. Open your invitations again.");
  }
  return result;
}
