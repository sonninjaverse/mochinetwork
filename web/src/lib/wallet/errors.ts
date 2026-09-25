/**
 * Whether the reader simply said no.
 *
 * WebAuthn reports a cancelled or dismissed prompt as NotAllowedError, and a
 * navigation away from it as AbortError. Neither is a failure: deciding not to
 * sign is a decision, and answering it with a red message tells someone their
 * own choice went wrong.
 *
 * The name is checked down the cause chain because the libraries in between
 * wrap it — the message that reaches the UI is "Passkey assertion failed",
 * which says nothing about who stopped it.
 */
const CANCELLED = ["NotAllowedError", "AbortError"];

export function isUserCancelled(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; current && depth < 6; depth++) {
    if (typeof current === "object") {
      const e = current as { name?: string; message?: string; cause?: unknown };
      if (e.name && CANCELLED.includes(e.name)) return true;
      // Some wrappers keep only the text. Checked after the name, never
      // instead of it, so an unrelated message cannot silence a real failure.
      if (e.message && CANCELLED.some((n) => e.message!.includes(n))) return true;
      current = e.cause;
    } else {
      return false;
    }
  }

  return false;
}

/**
 * Monad's public RPC refusing a transaction it has the balance for.
 *
 * Measured on a freshly funded account: 0.5 MON in hand, a locked reserve of
 * 0.0098 MON, the balance reported identically at latest, safe and finalized,
 * eth_estimateGas answering happily — and eth_sendRawTransaction returning
 * -32000 "Signer had insufficient balance" anyway, three times running, before
 * the fourth attempt went through and was mined.
 *
 * Worth singling out because the answer is to try again, and because the
 * message viem puts in front of the reader for it is "Missing or invalid
 * parameters", which sends anyone debugging it in entirely the wrong
 * direction. The real text sits four levels down the cause chain.
 */
const SPURIOUS = "insufficient balance";

export function isMempoolRejection(error: unknown): boolean {
  return detailOf(error)?.toLowerCase().includes(SPURIOUS) ?? false;
}

/**
 * The line an RPC actually said, rather than viem's summary of it.
 *
 * viem's own message is a category — "Missing or invalid parameters." — and
 * the sentence explaining what the node objected to is carried on `details`,
 * several causes deep. Showing the summary is how a reader gets told nothing.
 */
export function detailOf(error: unknown): string | null {
  let current: unknown = error;

  for (let depth = 0; current && depth < 8; depth++) {
    if (typeof current !== "object") return null;
    const e = current as { details?: string; cause?: unknown };
    if (typeof e.details === "string" && e.details.length > 0) return e.details;
    current = e.cause;
  }

  return null;
}

/**
 * What to put in front of the reader when a transaction does not go through.
 *
 * viem's own message is a category — "Missing or invalid parameters." — and
 * the sentence the node said is several causes deeper. Monad's is translated
 * rather than quoted: telling someone their funded wallet is empty is
 * misleading when the node's own retry cache is the thing refusing.
 */
export function explainError(error: unknown): string {
  if (isMempoolRejection(error)) {
    return "The network turned that transaction away. Try again in a moment.";
  }
  return (
    detailOf(error) ??
    (error instanceof Error ? error.message.split("\n")[0] : "That did not go through")
  );
}
