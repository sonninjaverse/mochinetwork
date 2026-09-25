import { expect, test } from "@playwright/test";

/**
 * Karma now lives on chain, in points where 100 is one whole vote, so these
 * assert the numbers the contract holds rather than a server's arithmetic.
 */
test("profile karma agrees with the same author's feed cards and replies", async ({ page }, testInfo) => {
  test.skip(process.env.E2E_LOCAL !== "1", "requires the local weighted-vote fixture");

  // alice: one like on each of two posts (+200) and a dislike on her reply
  // (-100).
  await page.goto("/alice/");
  await expect(page.getByTestId("karma")).toHaveText("100");
  await expect(page.getByText(/Cake day/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("profile.png"), fullPage: true });

  for (const badge of await page.getByTestId("author-karma").all()) {
    await expect(badge).toHaveText("100 karma");
  }

  await page.goto("/popular/");
  const card = page.locator("article").filter({ hasText: "Another useful post" });
  await expect(card.getByTestId("author-karma")).toHaveText("100 karma");
  await card.locator(".post-identity").click();
  await expect(page.getByTestId("karma")).toHaveText("100");

  await page.goto("/p/1/");
  const reply = page.locator("article").filter({ hasText: "A reply with negative karma" });
  await expect(reply.getByTestId("author-karma")).toHaveText("100 karma");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("a new profile displays zero karma", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "requires the local indexer");

  await page.goto("/0x000000000000000000000000000000000000dEaD/");
  await expect(page.getByTestId("karma")).toHaveText("0");
  await expect(page.getByText("No posts yet.")).toBeVisible();
});
