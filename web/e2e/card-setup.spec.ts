// Created with Claude Code (2026-11-08). Card setup and autopay (US-10, Figma
// Flow C 477:1493), as a real signed-in student on the local stack: Home's
// autopay row, the setup list, the issuer's steps and link outs, "Did you
// turn on autopay?", "Autopay is on", every Back, reloads, and the saves read
// back from the API.
import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function approvedStudent(page: Page, journey: string, card: { id: string; name: string } = DISCOVER) {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail(journey), checkA11y);
  const created = await page.request.post("/api/v1/applications", {
    data: { cardId: card.id, cardName: card.name, status: "approved", creditLimitCents: 50000 },
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  return { id, checkA11y };
}

async function saved(page: Page, id: string) {
  const response = await page.request.get(`/api/v1/applications/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as { autopayStatus: string; autopayPaymentType: string | null };
}

test("a student follows Discover's steps, says autopay is on with the minimum, and it is kept", async ({ page, context }) => {
  const { id, checkA11y } = await approvedStudent(page, "setup-autopay");
  const setupUrl = new RegExp(`/applications/${id}/setup$`);

  // Home's autopay row opens the setup list (I1), not a tick.
  await page.goto("/home");
  const card = page.getByRole("region", { name: DISCOVER.name });
  await expect(card.getByRole("checkbox", { name: /Turn on autopay/ })).toHaveCount(0);
  await card.getByRole("link", { name: /^Turn on autopay/ }).click();
  await expect(page).toHaveURL(setupUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Set up your Discover card" })).toBeVisible();
  await expect(page.getByText("UP NEXT")).toBeVisible();
  await expect(page.getByText("Turn on autopay at Discover")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Add your dates/ })).not.toHaveAccessibleName(/done/);
  await checkA11y("card setup list");

  // The back arrow goes Home; the browser's Back returns to the list.
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goBack();
  await expect(page).toHaveURL(setupUrl);

  // I2: Discover's own steps, the login note, and two link outs in new tabs.
  await page.getByRole("link", { name: "See steps" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/autopay$`));
  await expect(page.getByRole("heading", { level: 1, name: "Turn on autopay at Discover" })).toBeVisible();
  for (const step of ["Open Discover", "Find autopay", "Pick the statement balance"]) {
    await expect(page.getByRole("listitem").filter({ hasText: step })).toBeVisible();
  }
  await expect(page.getByText("Cense never sees your Discover login")).toBeVisible();
  const app = page.getByRole("link", { name: "Open the Discover app" });
  const site = page.getByRole("link", { name: "Open discover.com" });
  await expect(app).toHaveAttribute("href", /^https:\/\/apps\.apple\.com\/us\/app\/discover-mobile\/id\d+$/);
  await expect(app).toHaveAttribute("target", "_blank");
  await expect(site).toHaveAttribute("href", "https://www.discover.com");
  await expect(site).toHaveAttribute("target", "_blank");
  await checkA11y("autopay steps");
  // The back arrow returns to the list.
  await page.getByRole("link", { name: "Back to Card setup" }).click();
  await expect(page).toHaveURL(setupUrl);
  await page.getByRole("link", { name: "See steps" }).click();

  // Opening the site leaves Cense's tab waiting on "Did you turn on autopay?" (I3).
  const issuerTab = context.waitForEvent("page");
  await site.click();
  const opened = await issuerTab;
  await expect(opened).toHaveURL("https://www.discover.com/");
  await opened.close();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/autopay/confirm$`));
  await expect(page.getByRole("heading", { level: 1, name: "Did you turn on autopay?" })).toBeVisible();
  // Nothing is picked for the student.
  for (const radio of await page.getByRole("radio").all()) await expect(radio).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Interest builds on the rest. The full balance avoids it.")).toBeVisible();
  await checkA11y("did you turn on autopay");

  // Save with no answer asks for one and saves nothing.
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Pick one answer." })).toBeVisible();
  expect((await saved(page, id)).autopayStatus).toBe("unknown");

  await page.getByRole("radio", { name: "Yes, the minimum only" }).click();
  await expect(page.getByRole("radio", { name: "Yes, the minimum only" })).toHaveAttribute("aria-checked", "true");
  const write = page.waitForResponse((r) => r.url().includes(`/api/v1/applications/${id}`) && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Save" }).click();
  expect((await write).ok()).toBe(true);

  // I5: what the student said, and where to change it.
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/autopay/on$`));
  await expect(page.getByRole("heading", { level: 1, name: "Autopay is on" })).toBeVisible();
  await expect(page.getByText("Due date reminders stay off.")).toBeVisible();
  const summary = page.getByRole("region", { name: "Your autopay" });
  await expect(summary.getByText("Minimum only")).toBeVisible();
  await expect(summary.getByRole("link", { name: "Add your dates" })).toBeVisible();
  await expect(page.getByText("Changes happen at Discover")).toBeVisible();
  await checkA11y("autopay is on");
  expect(await saved(page, id)).toMatchObject({ autopayStatus: "on", autopayPaymentType: "minimum" });

  // Kept after a reload.
  await page.reload();
  await expect(page.getByRole("region", { name: "Your autopay" }).getByText("Minimum only")).toBeVisible();

  // Add the dates from the summary: the reminder screen returns to the setup list.
  await summary.getByRole("link", { name: "Add your dates" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/reminders\\?from=setup$`));
  await expect(page.getByRole("link", { name: "Back to Card setup" })).toBeVisible();
  await page.getByLabel("Statement closes on day").fill("10");
  await page.getByLabel("Payment due on day").fill("6");
  await page.getByRole("heading", { level: 1, name: "Never miss a payment" }).click();
  await page.getByRole("button", { name: "Save reminders" }).click();
  await expect(page).toHaveURL(setupUrl);
  await expect(page.getByRole("link", { name: /^Add your dates\s*, done/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Turn on autopay at Discover\s*, done/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Choose your reminders\s*, done/ })).toBeVisible();
  await expect(page.getByText("UP NEXT")).toHaveCount(0);

  // The done autopay row opens the summary, now with the next payment.
  await page.getByRole("link", { name: /^Turn on autopay at Discover/ }).click();
  await expect(page.getByRole("region", { name: "Your autopay" }).getByText(/^[A-Z][a-z]{2} 6$/)).toBeVisible();

  // Back to Home: the autopay and reminder stars are lit.
  await page.getByRole("link", { name: "Back to Home" }).last().click();
  await expect(page).toHaveURL(/\/home$/);
  const home = page.getByRole("region", { name: DISCOVER.name });
  await expect(home.getByRole("link", { name: /^Turn on autopay\s*, done/ })).toBeVisible();
  await expect(home.getByText("2 of 3 lit")).toBeVisible();
});

test("Not yet saves autopay off and clears the payment type; the setup list says autopay is up next", async ({ page }) => {
  const { id } = await approvedStudent(page, "setup-not-yet");
  const on = await page.request.patch(`/api/v1/applications/${id}`, { data: { autopayStatus: "on", autopayPaymentType: "statement_balance" } });
  expect(on.ok()).toBe(true);

  await page.goto(`/applications/${id}/setup/autopay/on`);
  await expect(page.getByRole("region", { name: "Your autopay" }).getByText("Statement balance")).toBeVisible();

  await page.goto(`/applications/${id}/setup/autopay/confirm`);
  await page.getByRole("radio", { name: "Not yet" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup$`));
  await expect(page.getByText("UP NEXT")).toBeVisible();
  expect(await saved(page, id)).toMatchObject({ autopayStatus: "off", autopayPaymentType: null });

  // "Autopay is on" is only for autopay that is on: it goes back to the list.
  await page.goto(`/applications/${id}/setup/autopay/on`);
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup$`));
});

test("Chime's steps say the card is paid from the Chime account", async ({ page }) => {
  const { id } = await approvedStudent(page, "setup-chime", { id: "chime-card", name: "Chime Card" });
  await page.goto(`/applications/${id}/setup/autopay`);
  await expect(page.getByRole("heading", { level: 1, name: "Turn on autopay at Chime" })).toBeVisible();
  await expect(page.getByText("Chime pays your card from your Chime account. Keep enough in it.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open chime.com" })).toHaveAttribute("href", "https://www.chime.com");
});

test("card setup is only for the student's own approved card", async ({ page, browser }) => {
  const { id } = await approvedStudent(page, "setup-owner");
  // Another student gets nothing.
  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await blockExternalRequests(other);
  const otherPage = await other.newPage();
  await signUp(otherPage, uniqueEmail("setup-other"), async () => {});
  for (const path of ["setup", "setup/autopay", "setup/autopay/confirm", "setup/autopay/on"]) {
    const response = await otherPage.goto(`/applications/${id}/${path}`);
    expect(response?.status(), path).toBe(404);
  }
  await other.close();

  // A denied card has no setup.
  await page.request.patch(`/api/v1/applications/${id}`, { data: { status: "rejected" } });
  expect((await page.goto(`/applications/${id}/setup`))?.status()).toBe(404);
});

test("every link on the setup screens leads somewhere real", async ({ page }) => {
  const { id } = await approvedStudent(page, "setup-links");
  await page.request.patch(`/api/v1/applications/${id}`, { data: { autopayStatus: "on", paymentDueDay: 6, statementClosingDay: 10 } });
  for (const path of ["setup", "setup/autopay", "setup/autopay/confirm", "setup/autopay/on"]) {
    await page.goto(`/applications/${id}/${path}`);
    const hrefs = await page.locator("a[href]").evaluateAll((links) =>
      [...new Set(links.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""))].filter((h) => h.startsWith("/")),
    );
    expect(hrefs.length, path).toBeGreaterThan(0);
    for (const href of hrefs) {
      const response = await page.request.get(href, { maxRedirects: 0 });
      expect(response.status(), `${path}: ${href}`).toBeLessThan(400);
    }
  }
});
