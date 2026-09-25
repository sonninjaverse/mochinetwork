export const COMMUNITY_NAME = /^[a-z0-9_]{3,21}$/;
const TAG = /(?:^|\s)m\/([a-z0-9_]{3,21})(?=\s|$)/i;

/** Only standalone tokens count; links and punctuation are ordinary text. */
export function parseTag(text: string): string | null {
  return TAG.exec(text)?.[1].toLowerCase() ?? null;
}
