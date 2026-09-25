import { expect, test, type Page } from "@playwright/test";

const OTHER = "0x000000000000000000000000000000000000dEaD";

async function signInAndFund(page: Page): Promise<string> {
  await page.getByTestId("sign-in").first().click();
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();

  const address = (await page.evaluate(() => localStorage.getItem("mochi-address"))) as string;
  const res = await page.request.post("http://127.0.0.1:8547", {
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "anvil_setBalance",
      params: [address, "0x56BC75E2D63100000"],
    },
  });
  expect((await res.json()).error).toBeUndefined();
  return address;
}

test("claim username opens a dialog and closes on Escape", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "writes only to the disposable local chain");

  await page.goto("/");
  await signInAndFund(page);
  await page.getByRole("link", { name: "Profile", exact: true }).click();

  await page.getByTestId("claim-username").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // Opened to type, so the field takes focus.
  await expect(page.getByTestId("handle-input")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("deposit shows the account, withdraw sends MON, and the profile is in the nav", async ({
  page,
}) => {
  test.skip(process.env.E2E_LOCAL !== "1", "writes only to the disposable local chain");

  await page.goto("/");
  const address = await signInAndFund(page);

  // Reachable from the rail on a wide screen and the bar on a phone.
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Profile", exact: true }).click();

  await page.getByTestId("deposit").click();
  await expect(page.getByTestId("deposit-qr")).toBeVisible();
  await expect(page.getByTestId("copy-address")).toContainText(address);
  await page.keyboard.press("Escape");

  await page.getByTestId("withdraw").click();
  await page.getByTestId("withdraw-to").fill("not-an-address");
  await page.getByTestId("withdraw-amount").fill("0.001");
  await expect(page.getByText("That is not a valid address.")).toBeVisible();

  await page.getByTestId("withdraw-to").fill(OTHER);
  await page.getByTestId("withdraw-send").click();
  await expect(page.getByRole("heading", { name: "Sent" })).toBeVisible({ timeout: 30_000 });
});
