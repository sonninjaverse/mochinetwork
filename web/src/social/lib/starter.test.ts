import { afterEach, describe, expect, it, vi } from "vitest";
import { requestStarterMon } from "./starter";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestStarterMon", () => {
  it("posts the address to the indexer's drip route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await requestStarterMon("0xabc");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/drip$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ address: "0xabc" });
  });

  it("surfaces the server's refusal rather than pretending it worked", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "the starter float is empty" }), { status: 503 }),
        ),
    );

    await expect(requestStarterMon("0xabc")).rejects.toThrow("the starter float is empty");
  });
});
