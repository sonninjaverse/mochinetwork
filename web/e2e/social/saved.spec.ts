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

test("a saved post shows on the Saved tab and unsaving removes it", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "requires the local fixture");

  await page.goto("/popular/");
  await signInAndFund(page);

  const card = page.locator("article").filter({ hasText: "A useful first post" });
  await card.getByTestId("save-button").click();

  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page.getByTestId("profile-saved").click();
  const saved = page.locator("article").filter({ hasText: "A useful first post" });
  await expect(saved).toBeVisible();

  // Unsaving from the list takes the row out of it right away.
  await saved.getByTestId("save-button").click();
  await expect(saved).toHaveCount(0);
});
