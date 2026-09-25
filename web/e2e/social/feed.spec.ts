import { expect, test, type Page } from "@playwright/test";

/**
 * Against a deployed site these run over real seeded data; locally they run
 * over whatever the indexer in .env.local points at. Either way they assert
 * behaviour, never specific posts.
 */

const control = (page: Page) => page.getByTestId("feed-control");

/** Opens the feed control and returns the text of the current top post. */
async function openControl(page: Page): Promise<string> {
  const first = page.locator("article").first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  const before = await first.innerText();
  await control(page).click();
  await expect(page.getByRole("heading", { name: /Order them by|Ranked by/ })).toBeVisible();
  return before;
}

/**
 * The claim the whole project rests on: ranking is a view call, so switching
 * the sort reorders the feed with no wallet and no gas. This runs signed out on
 * purpose — if it needed an account, the claim would be false.
 */
test("switching the sort reorders the feed while signed out", async ({ page }) => {
  await page.goto("/popular/");
  await openControl(page);

  // New is chronological; Best is vote-driven, so with any voted post on the
  // page the two cannot agree on the top one.
  await page.getByTestId("algorithm-Chrono").click();
  await expect(control(page)).toHaveText(/Chrono/);
  const chronological = await page.locator("article").first().innerText();

  await page.getByTestId("algorithm-Best").click();
  await expect(control(page)).toHaveText(/Best/);

  await expect
    .poll(async () => page.locator("article").first().innerText(), { timeout: 30_000 })
    .not.toBe(chronological);
});

test("the ranking contract can be read from the page", async ({ page }) => {
  await page.goto("/popular/");
  await openControl(page);

  await page.getByTestId("view-source").click();
  // Either the bundled source or the address to read on the explorer. Both
  // keep the promise; claiming only the first would make the test brittle.
  await expect(
    page.locator("pre.source, p.source-missing").first(),
  ).toBeVisible({ timeout: 15_000 });
});

/**
 * Which posts are considered is fixed by the page, not offered as a control:
 * Home draws from your communities, Popular and All from everything. A source
 * chip would let any of them be turned into the others.
 */
test("the feed offers no candidate-source control", async ({ page }) => {
  await page.goto("/popular/");
  await openControl(page);
  await expect(page.getByRole("heading", { name: "Show me" })).toHaveCount(0);
  await expect(page.locator("[data-testid^='strategy-']")).toHaveCount(0);
});

/**
 * Opening a post is client navigation, not a page load. A value parked on the
 * window survives a soft navigation and is gone after a reload, which is the
 * only way to tell them apart from inside the browser.
 */
test("opening a post keeps the document alive", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "requires the local feed fixture");
  await page.goto("/popular/");
  const card = page.locator("article").filter({ has: page.locator(".post-body") }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });

  await page.evaluate(() => {
    (window as unknown as { kept?: boolean }).kept = true;
  });
  await card.locator(".post-body").click();

  await expect(page).toHaveURL(/\/0x[0-9a-f]+\/\d+\/?$/i);
  expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
});

/// Home without an account has nothing to draw from, so it says so.
test("home asks a signed-out reader to join a community", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".feed-gate")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("article")).toHaveCount(0);
  await expect(
    page.locator(".feed-gate").getByRole("link", { name: /browse communities/i }),
  ).toBeVisible();
});

/**
 * Writes a real post to the chain, so it is opt-in: E2E_WRITE=1. Left out of a
 * normal run because against the deployed site it would leave test junk in the
 * feed people are looking at.
 */
test("passkey sign-in, post, and the post appears in the feed", async ({ page }) => {
  test.skip(process.env.E2E_WRITE !== "1", "writes to chain; set E2E_WRITE=1");

  // Chrome can emulate an authenticator, which is the only way to exercise
  // WebAuthn without a human fingerprint. Set up before the page loads.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      hasPrf: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto("/");
  await page.getByRole("button", { name: /create account/i }).click();

  // Sign-up asks for a name before it creates anything: the contract refuses a
  // second register, so this is the only one this account will ever have.
  await page.getByTestId("signup-handle").fill(`e2e${Date.now() % 100000}`);
  await page.getByTestId("signup-submit").click();

  // Sign-up lands on the profile; the composer is behind Create post on a feed.
  await page.goto("/");
  await page.getByTestId("create-post").click();
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 90_000 });

  const text = `e2e ${Date.now()}`;
  await page.getByTestId("composer-input").fill(text);
  await page.getByTestId("composer-submit").click();

  // Generous relative to a ~300ms block, but a testnet RPC can stall.
  await expect(page.getByText(text)).toBeVisible({ timeout: 60_000 });
});
