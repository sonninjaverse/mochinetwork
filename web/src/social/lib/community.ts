import { stringToHex } from "viem";

export const NAME_PATTERN = /^[a-z0-9_]{3,21}$/;
export const NAME_RULES = "3–21 characters: lowercase letters, digits, underscore.";
const TAG = /(?:^|\s)m\/([a-z0-9_]{3,21})(?=\s|$)/i;
export const isValidName = (name: string) => NAME_PATTERN.test(name);
export const toBytes32 = (name: string) => stringToHex(name, { size: 32 });
export const parseTag = (text: string): string | null => TAG.exec(text)?.[1].toLowerCase() ?? null;

export function stripTag(text: string, community?: string): string {
  const match = TAG.exec(text);
  if (!match || (community !== undefined && match[1].toLowerCase() !== community)) return text;
  const start = match.index + (match[0].startsWith("m/") || match[0].startsWith("M/") ? 0 : 1);
  return (text.slice(0, start) + text.slice(match.index + match[0].length)).trim();
}

/** The textarea holds exactly what will be signed, including its tag. */
export function withCommunity(text: string, name: string | null): string {
  const body = stripTag(text);
  return name ? `m/${name} ${body}` : body;
}

export type CommunityMetadata = { description: string; icon: string };
export function metadataURI(description: string, icon = ""): string {
  return `data:application/json,${encodeURIComponent(JSON.stringify({ description, icon }))}`;
}

export function readInlineMetadata(uri: string): CommunityMetadata | null {
  if (!uri.startsWith("data:application/json,") || uri.length > 16_384) return null;
  try {
    return cleanMetadata(JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length))));
  } catch { return null; }
}

export function cleanMetadata(data: unknown): CommunityMetadata {
  const value = data as Partial<CommunityMetadata> | null;
  const icon = typeof value?.icon === "string" && /^(https?:\/\/|ipfs:\/\/)/.test(value.icon) ? value.icon : "";
  return { description: typeof value?.description === "string" ? value.description.slice(0, 2000) : "", icon };
}
