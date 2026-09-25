import { describe, expect, it } from "vitest";
import { detailOf, isMempoolRejection, isUserCancelled } from "@/lib/wallet/errors";

describe("isUserCancelled", () => {
  it("recognises a dismissed passkey prompt", () => {
    expect(isUserCancelled(new DOMException("denied", "NotAllowedError"))).toBe(true);
  });

  it("recognises navigating away from one", () => {
    expect(isUserCancelled(new DOMException("gone", "AbortError"))).toBe(true);
  });

  /// What actually reaches the UI: the libraries in between wrap it, and the
  /// outer message says nothing about who stopped it.
  it("finds it underneath a wrapper", () => {
    const wrapped = new Error("Passkey assertion failed", {
      cause: new DOMException("denied", "NotAllowedError"),
    });
    expect(isUserCancelled(wrapped)).toBe(true);
  });

  it("finds it two wrappers deep", () => {
    const inner = new DOMException("denied", "NotAllowedError");
    expect(isUserCancelled(new Error("a", { cause: new Error("b", { cause: inner }) }))).toBe(true);
  });

  /// A real failure must still be reported. Silence is only for a decision.
  it("does not swallow an actual error", () => {
    expect(isUserCancelled(new Error("insufficient funds"))).toBe(false);
    expect(isUserCancelled(new Error("Passkey assertion failed"))).toBe(false);
    expect(isUserCancelled(null)).toBe(false);
    expect(isUserCancelled("nope")).toBe(false);
  });

  /// A cause chain that points at itself must not hang the page.
  it("gives up rather than looping forever", () => {
    const e: { name: string; cause?: unknown } = { name: "Whatever" };
    e.cause = e;
    expect(isUserCancelled(e)).toBe(false);
  });
});

describe("isMempoolRejection", () => {
  /// The shape viem actually hands over: its own summary on top, the node's
  /// sentence carried on `details` several causes down.
  const monadRefusal = Object.assign(new Error("Missing or invalid parameters."), {
    cause: Object.assign(new Error("Missing or invalid parameters."), {
      cause: Object.assign(new Error("RPC Request failed."), {
        details: "Signer had insufficient balance",
      }),
    }),
  });

  it("recognises Monad turning a funded account away", () => {
    expect(isMempoolRejection(monadRefusal)).toBe(true);
  });

  it("does not claim an ordinary revert", () => {
    const reverted = Object.assign(new Error("execution reverted"), {
      cause: { details: "execution reverted: HandleTaken()" },
    });
    expect(isMempoolRejection(reverted)).toBe(false);
  });

  it("is false for a cancelled prompt, which is not the RPC's doing", () => {
    expect(isMempoolRejection(Object.assign(new Error("x"), { name: "NotAllowedError" }))).toBe(false);
  });

  it("survives a chain that ends in nothing", () => {
    expect(isMempoolRejection(null)).toBe(false);
    expect(isMempoolRejection(new Error("plain"))).toBe(false);
  });

  /// The reason this exists: viem's summary is a category, not a cause.
  it("digs the node's own sentence out from under viem's summary", () => {
    expect(detailOf(monadRefusal)).toBe("Signer had insufficient balance");
    expect(monadRefusal.message).toBe("Missing or invalid parameters.");
  });

  it("returns null when nothing said anything", () => {
    expect(detailOf(new Error("plain"))).toBe(null);
  });
});
