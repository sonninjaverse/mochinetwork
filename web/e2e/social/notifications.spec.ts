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

test("notification settings live on the device and survive a reload", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "writes only to the disposable local chain");

  await page.goto("/");
  await signInAndFund(page);

  await page.getByTestId("bell").click();
  await page.getByTestId("bell-settings").click();
  await expect(page.getByTestId("pref-replies-on")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("pref-votes-meaningful")).toHaveAttribute("aria-pressed", "true");
  // The device section is present whatever the browser allows.
  await expect(page.getByText("This device")).toBeVisible();

  await page.getByTestId("pref-replies-off").click();
  await page.getByTestId("pref-votes-all").click();
  await expect(page.getByTestId("pref-replies-off")).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await page.getByTestId("bell").click();
  await page.getByTestId("bell-settings").click();
  await expect(page.getByTestId("pref-replies-off")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("pref-votes-all")).toHaveAttribute("aria-pressed", "true");
});

test("a community's notification level is set on its own page", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "writes only to the disposable local chain");

  await page.goto("/m/monad/");
  await signInAndFund(page);
  await page.getByTestId("community-join").click();
  await expect(page.getByTestId("community-join")).toHaveText("Leave");

  // Hot until it is set, and it lives beside Join rather than in the bell.
  await expect(page.getByTestId("sub-notify-hot")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("sub-notify-all").click();
  await expect(page.getByTestId("sub-notify-all")).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByTestId("sub-notify-all")).toHaveAttribute("aria-pressed", "true");
});
