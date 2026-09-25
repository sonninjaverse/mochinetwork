import { CONTRACTS, communityRegistryAbi, postRegistryAbi, postReplyAbi } from "./contracts";
import { publicClient } from "./chain";
import { isValidName, toBytes32 } from "./community";
import { getWallet } from "@/lib/wallet";

async function communityWrite(functionName: "create" | "join" | "leave" | "setMetadata", name: string, uri?: string) {
  if (!CONTRACTS.communityRegistry) throw new Error("Communities are not available yet.");
  if (!isValidName(name)) throw new Error("Use 3–21 lowercase letters, digits or underscores.");
  const hash = await getWallet().write({ address: CONTRACTS.communityRegistry, abi: communityRegistryAbi,
    functionName, args: uri === undefined ? [toBytes32(name)] : [toBytes32(name), uri] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error("The community change was not confirmed.");
}

export const createCommunity = (name: string, uri: string) => communityWrite("create", name, uri);
export const joinCommunity = (name: string) => communityWrite("join", name);
export const leaveCommunity = (name: string) => communityWrite("leave", name);
export const setCommunityMetadata = (name: string, uri: string) => communityWrite("setMetadata", name, uri);

export async function likePost(id: bigint): Promise<void> {
  await getWallet().write({
    address: CONTRACTS.postRegistry,
    abi: postRegistryAbi,
    functionName: "like",
    args: [id],
  });
}

/**
 * Vote a post down.
 *
 * Weighted exactly like a like, so a downvoted account can no more bury
 * someone than promote them. Reddit's Best and Controversial sorts are
 * meaningless without this signal.
 */
export async function dislikePost(id: bigint): Promise<void> {
  await getWallet().write({
    address: CONTRACTS.postRegistry,
    abi: postRegistryAbi,
    functionName: "dislike",
    args: [id],
  });
}

/**
 * Replies to a post.
 *
 * parentId is on chain rather than inferred by the client, because ranking
 * contracts have to be able to tell a reply from a post — one that cannot
 * would drop fragments of conversations into the feed as top-level content.
 */
export async function replyToPost(
  parentId: bigint,
  text: string,
  mediaURI = "",
): Promise<void> {
  await getWallet().write({
    address: CONTRACTS.postRegistry,
    abi: postReplyAbi as never,
    functionName: "reply",
    args: [Number(parentId), text, mediaURI],
  });
}

