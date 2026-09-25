import { defineConfig, devices } from "@playwright/test";

// The feed on a disposable local chain, with the real contracts and the real
// indexer (indexer/scripts/e2e-server.ts). Point at a deployed site instead
// with E2E_BASE_URL=https://social.example to check what users actually get.
const remote = process.env.E2E_BASE_URL;
if (!remote) process.env.E2E_LOCAL = "1";

export default defineConfig({
  testDir: "./e2e/social",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: remote ?? "http://127.0.0.1:3107", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  ...(remote
    ? {}
    : {
        webServer: {
          // The indexer is an npm project (package-lock.json).
          command: "npm --prefix ../indexer run e2e:serve",
          url: "http://127.0.0.1:3109/__ready",
          timeout: 300_000,
          reuseExistingServer: false,
        },
      }),
});
