import { defineConfig } from "@playwright/test";
import social from "./playwright.social.config";

// Separate from the open feed suite: real passkeys and the real gated indexer,
// but only disposable local accounts and contracts.
process.env.E2E_INVITES = "1";
export default defineConfig({
  ...social,
  testMatch: "invites.spec.ts",
  use: { ...social.use, baseURL: "http://localhost:3107" },
});
