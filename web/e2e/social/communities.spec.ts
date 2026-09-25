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

test("browse, search, community feeds, sorting and signed-out Home", async ({ page }, testInfo) => {
  test.skip(process.env.E2E_LOCAL !== "1", "requires the local community fixture");
  await page.goto("/");
  await page.getByRole("link", { name: "browse communities", exact: false }).last().click();
  await expect(page.getByRole("heading", { name: "Communities", exact: true })).toBeVisible();
  await page.getByLabel("Find a community").fill("missing");
  await expect(page.getByText("No communities match that name.")).toBeVisible();
  await page.getByLabel("Find a community").fill("monad");
  await page.getByRole("link", { name: "m/monad", exact: true }).click();
  await expect(page.getByRole("heading", { name: "m/monad" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "A useful first post" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "outside any community" })).toHaveCount(0);
  await expect(page.locator(".post-body").filter({ hasText: "m/monad" })).toHaveCount(0);
  await page.getByTestId("feed-control").click();
  await page.getByTestId("algorithm-Chrono").click();
  await expect(page.getByTestId("feed-control")).toHaveText(/Chrono/);
  await expect(page.locator("article").first()).toContainText("Another useful post");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath("community.png"), fullPage: true });
  await page.goto("/m/not_registered/");
  await expect(page.getByText("This community does not exist.")).toBeVisible();
});

test("the whole community card opens it, not only its name", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "requires the local community fixture");
  await page.goto("/m/");
  const card = page.locator(".community-header").filter({
    has: page.getByRole("heading", { name: "m/monad", exact: true }),
  });
  await card.locator(".community-counts").click();
  await expect(page.getByTestId("community-posts")).toBeVisible();
});

test("create, join, post, read on Home and leave", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "writes only to the disposable local chain");
  const name = `test_${Date.now().toString(36)}`;
  const body = `A new conversation in ${name}`;
  await page.goto("/m/");
  await signInAndFund(page);
  await page.getByText("Create a community", { exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Description", { exact: true }).fill("Our local community");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(`Created m/${name}`);
  await page.getByRole("status").getByRole("link").click();
  await expect(page.getByText("Our local community", { exact: true })).toBeVisible();
  // A burner holds its key only within one document. Sign in on this page for writes.
  await page.evaluate(() => localStorage.removeItem("mochi-address"));
  await page.reload();
  await signInAndFund(page);
  await page.getByTestId("community-join").click();
  await expect(page.getByTestId("community-join")).toHaveText("Leave");
  // The composer is behind Create post now, prefilled with the community.
  await page.getByTestId("create-post").click();
  await expect(page.getByTestId("composer-community")).toHaveText(`m/${name}`);
  await page.getByTestId("composer-input").fill(body);
  await page.getByTestId("composer-submit").click();
  await expect(page.getByTestId("modal")).toHaveCount(0);

  // On chain before the indexer has it, so it appears as a placeholder...
  const waiting = page.getByText("on chain, waiting to be indexed");
  await expect(waiting).toBeVisible();
  // ...and resolves itself once the indexer catches up, with nothing pressed.
  await expect(waiting).toHaveCount(0, { timeout: 30_000 });
  const posted = page.locator("article").filter({ hasText: body });
  await expect(posted).toBeVisible();
  // Your own post cannot be voted on: the answer comes when the button is
  // pressed, not as a standing line.
  await expect(posted.getByTestId("own-vote-note")).toHaveCount(0);
  await posted.getByTestId("like-button").click();
  await expect(posted.getByTestId("own-vote-note")).toBeVisible();

  await expect.poll(async () => {
    const r = await page.request.get(`http://127.0.0.1:3109/candidates?strategy=community&community=${name}`);
    return (await r.json()).ids.length;
  }).toBe(1);
  // Tabs use client navigation, retaining the current signing session.
  await page.getByRole("link", { name: "Home", exact: true }).first().click();
  await expect(page.locator("article").filter({ hasText: body })).toBeVisible();
  // Let the feed settle: on a phone the nav is remounted while it loads, and a
  // click that lands mid-mount is reported as an unstable element.
  await page.waitForTimeout(600);
  await page.getByRole("link", { name: "Communities", exact: true }).first().click();
  // Joined, so it lives under Your communities, not Explore.
  await page.getByTestId("communities-mine").click();
  const row = page.locator(".community-header").filter({ has: page.getByRole("heading", { name: `m/${name}`, exact: true }) });
  await expect(row).toBeVisible();
  // Leave from the community's own page: the card no longer carries a button.
  await row.locator(".community-counts").click();
  await expect(page.getByTestId("community-join")).toHaveText("Leave");
  await page.getByTestId("community-join").click();
  await expect(page.getByTestId("community-join")).toHaveText("Join");
  await page.getByRole("link", { name: "Home", exact: true }).first().click();
  await expect(page.getByText("No posts from your communities yet")).toBeVisible();
  await expect(page.locator("article").filter({ hasText: body })).toHaveCount(0);
});

test("the directory splits into your communities and explore", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "writes only to the disposable local chain");
  await page.goto("/m/monad/");
  await signInAndFund(page);
  await page.getByTestId("community-join").click();
  await expect(page.getByTestId("community-join")).toHaveText("Leave");

  // Client navigation keeps the signing session, unlike a reload.
  await page.getByRole("link", { name: "Communities", exact: true }).first().click();
  // Explore is the landing tab, so the search is the first thing offered.
  await expect(page.getByLabel("Find a community")).toBeVisible();

  await page.getByTestId("communities-mine").click();
  const joined = page.locator(".community-header").filter({ has: page.getByRole("heading", { name: "m/monad", exact: true }) });
  await expect(joined).toBeVisible();

  // Explore offers what is left to join, so the joined one is gone from it.
  await page.getByTestId("communities-explore").click();
  await expect(page.getByLabel("Find a community")).toBeVisible();
  await expect(joined).toHaveCount(0);
});

test("a community's composer is already addressed, and membership survives reload", async ({ page }) => {
  test.skip(process.env.E2E_LOCAL !== "1", "writes only to the disposable local chain");
  await page.goto("/m/monad/");
  await signInAndFund(page);
  await page.getByTestId("create-post").click();
  // On a community, posting is posting there: the text is addressed for you and
  // there is no community to choose.
  await expect(page.getByTestId("composer-community")).toHaveText("m/monad");
  await expect(page.getByTestId("composer-input")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Post community" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("modal")).toHaveCount(0);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("link", { name: "Browse communities", exact: true }).first().click();
  // The card opens it; Join lives on the page, not on the card.
  const card = page.locator(".community-header").filter({ has: page.getByRole("heading", { name: "m/monad", exact: true }) });
  await card.locator(".community-counts").click();
  await page.getByTestId("community-join").click();
  await expect(page.getByTestId("community-join")).toHaveText("Leave");

  // Membership survives a reload, and the page says so where it is.
  await page.reload();
  await expect(page.getByTestId("community-join")).toHaveText("Leave");
});
