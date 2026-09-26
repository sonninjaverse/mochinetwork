import { expect, test, type BrowserContext } from "@playwright/test";

async function authenticator(context: BrowserContext) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal",
    hasResidentKey: true, hasUserVerification: true, hasPrf: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  return page;
}

test("invite, create account, share, redeem once, and return with the same passkey", async ({ browser }, info) => {
  test.skip(process.env.E2E_INVITES !== "1", "requires the gated local fixture");
  test.setTimeout(120_000);
  const options = info.project.use;
  const ownerContext = await browser.newContext({ viewport: options.viewport, isMobile: options.isMobile });
  const friendContext = await browser.newContext({ viewport: options.viewport, isMobile: options.isMobile });
  try {
    const owner = await authenticator(ownerContext);
    await owner.goto(`http://localhost:3107/gate?code=e2e-${info.project.name}`);
    await expect(owner.getByTestId("gate-code")).toHaveValue(`e2e-${info.project.name}`);
    await owner.getByTestId("gate-submit").click();
    await expect(owner).toHaveURL("http://localhost:3107/");
    await owner.getByTestId("signup-submit").first().click();
    await expect(owner).toHaveURL(/\/0x[a-f0-9]+\/?$/i);
    await owner.getByTestId("invite-friends").filter({ visible: true }).last().click();
    await expect(owner.getByRole("dialog")).toContainText("3 invites left");
    const code = await owner.locator(".invite-card code").first().innerText();
    // A tall modal must remain usable on a phone.
    await expect(owner.getByRole("button", { name: "Copy link" }).last()).toBeInViewport();
    await owner.screenshot({ path: info.outputPath("invite-codes.png") });
    await owner.getByRole("button", { name: "Close", exact: true }).click();

    const friend = await authenticator(friendContext);
    await friend.goto(`http://localhost:3107/gate?code=${code}`);
    await friend.getByTestId("gate-submit").click();
    await expect(friend).toHaveURL("http://localhost:3107/");
    await friend.getByTestId("signup-submit").first().click();
    await expect(friend).toHaveURL(/\/0x[a-f0-9]+\/?$/i);
    const friendAddress = await friend.evaluate(() => localStorage.getItem("mochi-address"));
    await friend.getByTestId("invite-friends").filter({ visible: true }).last().click();
    await expect(friend.getByRole("dialog")).toContainText("3 invites left");
    await friend.getByRole("button", { name: "Close", exact: true }).click();

    const replay = await browser.newContext();
    try {
      const rejected = await replay.newPage();
      await rejected.goto(`http://localhost:3107/gate?code=${code}`);
      await rejected.getByTestId("gate-submit").click();
      await expect(rejected.getByTestId("gate-error")).toContainText("already been used");
    } finally { await replay.close(); }

    // Sign-out revokes the API session as well as the in-memory wallet key.
    await friend.getByTestId("sign-out").click();
    await expect(friend).toHaveURL("http://localhost:3107/gate");
    await friend.getByTestId("gate-sign-in").click();
    await expect(friend).toHaveURL("http://localhost:3107/");
    expect(await friend.evaluate(() => localStorage.getItem("mochi-address"))).toBe(friendAddress);
    await friend.goto("http://localhost:3107/popular");
    await expect(friend.locator("article").first()).toBeVisible();

    await owner.getByTestId("invite-friends").filter({ visible: true }).last().click();
    await expect(owner.getByRole("dialog")).toContainText("2 invites left");
    await expect(owner.getByRole("dialog")).toContainText("1 friend joined");
  } finally { await ownerContext.close(); await friendContext.close(); }
});
