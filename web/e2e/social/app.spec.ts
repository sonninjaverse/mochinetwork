import { expect, test } from "@playwright/test";
import { mnemonicToAccount } from "viem/accounts";

// alice as the local stack makes her (indexer/scripts/e2e-server.ts): the first
// account of Anvil's public fixture mnemonic.
const ALICE = mnemonicToAccount("test test test test test test test test test test test junk").address;

test.skip(!process.env.E2E_LOCAL, "needs the local stack");

test("every kind of page loads under a nonce CSP with no violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  for (const path of ["/", "/m/monad", "/alice", "/p/1"]) {
    const response = await page.goto(path);
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp, path).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp, path).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    // Not "networkidle": a social page polls the chain every 300ms for its
    // block counter, so the network never goes quiet. Give the page's own
    // requests time to be made, and to be refused if the policy refuses them.
    await page.waitForTimeout(1_500);
  }
  expect(violations).toEqual([]);
});

test("old social addresses still land", async ({ page }) => {
  await page.goto("/subs");
  await expect(page).toHaveURL(/127\.0\.0\.1:3107\/$/);
  await page.goto("/all");
  await expect(page).toHaveURL(/\/popular$/);
  await page.goto("/m/monad/");
  await expect(page).toHaveURL(/\/m\/monad$/);
  await page.goto("/alice");
  await expect(page.getByText("alice").first()).toBeVisible();
  // CloudFront's internal placeholders, which the app's routes refuse.
  await page.goto(`/a/${ALICE}`);
  await expect(page).toHaveURL(new RegExp(`127\\.0\\.0\\.1:3107/${ALICE}$`));
  await expect(page.getByText("alice").first()).toBeVisible();
  await page.goto("/u/alice/1");
  await expect(page).toHaveURL(/127\.0\.0\.1:3107\/alice\/1$/);
});

test("removed routes answer 404 and the home page has only social navigation", async ({ page }) => {
  const launchpad = await page.goto("/launchpad");
  expect(launchpad?.status()).toBe(404);
  const api = await page.goto("/api/launches");
  expect(api?.status()).toBe(404);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Launchpad" })).toHaveCount(0);
});

test("every brand image on the home page loads", async ({ page }) => {
  await page.goto("/");
  const brandImages = page.locator('img[src*="/brand/"]');
  await expect(brandImages.first()).toBeVisible();
  const count = await brandImages.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    expect(await brandImages.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
});
