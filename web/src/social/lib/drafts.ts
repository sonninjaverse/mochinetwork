/**
 * Half-written posts, kept while the reader wanders off.
 *
 * Session storage, not local: a draft is for the visit it was typed in.
 * Restoring an abandoned reply days later would be a surprise, and a reply is
 * addressed at a specific post that may not even be on screen any more.
 *
 * Never synced anywhere. The text stays on the device until it is posted or
 * cleared, the same promise the saved list makes.
 */

const PREFIX = "mochi-draft:";

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function draftKey(scope: string): string {
  return PREFIX + scope;
}

export function readDraft(scope: string): string {
  try {
    return store()?.getItem(draftKey(scope)) ?? "";
  } catch {
    return "";
  }
}

export function writeDraft(scope: string, text: string) {
  try {
    if (text.length === 0) store()?.removeItem(draftKey(scope));
    else store()?.setItem(draftKey(scope), text);
  } catch {
    // A refused write costs the draft, not the post being written.
  }
}

export function clearDraft(scope: string) {
  writeDraft(scope, "");
}
