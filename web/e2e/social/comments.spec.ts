import { expect, test, type Page } from "@playwright/test";

async function signInAndFund(page: Page) {
  await page.getByTestId("sign-in").first().click();
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
  const address = await page.evaluate(() => localStorage.getItem("mochi-address"));
  const res = await page.request.post("http://127.0.0.1:8547", {
    data: { jsonrpc: "2.0", id: 1, method: "anvil_setBalance", params: [address, "0x56BC75E2D63100000"] },
  });
  expect((await res.json()).error).toBeUndefined();
}

/** Needs the local fixture, which writes a reply to a reply to nest. */
test("a reply to a reply renders nested and collapses", async ({ page }, testInfo) => {
  test.skip(process.env.E2E_LOCAL !== "1", "requires the local thread fixture");

  await page.goto("/p/1/");
  const nested = page.locator("article").filter({ hasText: "A nested reply to the reply" });
  await expect(nested).toBeVisible();

  // Depth is the point: the second reply hangs inside the first, not beside it.
  await expect(page.locator(".comment .comment")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Best" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("thread.png"), fullPage: true });

  // The first toggle is the outer comment's; collapsing it takes the nested
  // reply with it.
  await page.getByRole("button", { name: "Collapse comment" }).first().click();
  await expect(nested).toHaveCount(0);
});

/** Replying under a comment, not on another page. */
test("an inline reply lands under the comment it answers", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "writes only to the disposable local chain");

  await page.goto("/p/1/");
  await signInAndFund(page);

  const text = `inline ${Date.now()}`;
  const first = page.locator(".comment").first();
  // The first comment also contains its nested reply's button, so take the
  // outermost one.
  await first.getByTestId("inline-reply").first().click();
  await first.locator("textarea").first().fill(text);
  await first.getByTestId("composer-submit").first().click();

  await expect(page.locator(".comment").filter({ hasText: text })).toBeVisible({ timeout: 30_000 });
});
