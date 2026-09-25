import { afterEach, expect, test, vi } from "vitest";
import { rpId } from "@/lib/wallet/mera-client";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test("an independent deployment uses its own hostname", () => {
  vi.stubGlobal("window", { location: { hostname: "demo.example" } });
  vi.stubEnv("NEXT_PUBLIC_RP_ID", "");
  expect(rpId()).toBe("demo.example");
});

test("subdomains can use a configured stable relying party", () => {
  vi.stubGlobal("window", { location: { hostname: "www.social.example" } });
  vi.stubEnv("NEXT_PUBLIC_RP_ID", " social.example ");
  expect(rpId()).toBe("social.example");
});

test.each(["localhost", "127.0.0.1"])("local development at %s ignores a production relying party", (hostname) => {
  vi.stubGlobal("window", { location: { hostname } });
  vi.stubEnv("NEXT_PUBLIC_RP_ID", "social.example");
  expect(rpId()).toBe(hostname);
});
