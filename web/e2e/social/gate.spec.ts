import { expect, test } from "@playwright/test";

/**
 * Runs only against a gated deployment, which is why it is opt-in: it needs
 * both the real site and one of its access codes.
 *
 *   E2E_BASE_URL=https://social.example E2E_GATE_CODE=... npx playwright test e2e/gate.spec.ts
 */
test("a wrong code is refused and a right one opens the app", async ({ page }) => {
  const code = process.env.E2E_GATE_CODE;
  test.skip(!code, "set E2E_GATE_CODE to run against a gated deployment");

  // Everything at the edge sends a visitor with no cookie here.
  await page.goto("/");
  await expect(page).toHaveURL(/\/gate(\?|$)/);

  await page.getByTestId("gate-code").fill("definitely-not-the-code");
  await page.getByTestId("gate-submit").click();
  await expect(page.getByText("That code was not accepted.")).toBeVisible();

  // The cookie is scoped to the apex, so the API accepts it for the same
  // reader without a second entry.
  await page.getByTestId("gate-code").fill(code!);
  await page.getByTestId("gate-submit").click();
  await expect(page.locator("article").first()).toBeVisible({ timeout: 60_000 });
});
