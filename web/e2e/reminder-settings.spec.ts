// Reminder settings and the loop around the reminder email (Reminders audit
// R-03, R-04, R-08, R-09), as real signed-in students on the local stack. On
// main, /settings had no reminder controls, the reminder star stayed lit with
// the due-date email off, a second approved card could not reach its
// reminders, and the setup screen never said its choices cover every card.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };
const CHIME = { id: "chime-card", name: "Chime Card" };
const REMINDER_DONE = /^Set a payment reminder\s*, done/;
const REMINDER = /^Set a payment reminder/;

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function track(page: Page, card: { id: string; name: string }, status: "approved" | "applied" = "approved") {
  const created = await page.request.post("/api/v1/applications", {
    data: { cardId: card.id, cardName: card.name, status, creditLimitCents: status === "approved" ? 50000 : null },
  });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

async function saveDays(page: Page, closing: string, due: string) {
  await page.getByLabel("Statement closes on day").fill(closing);
  await page.getByLabel("Payment due on day").fill(due);
  await page.getByRole("heading", { level: 1, name: "Never miss a payment" }).click();
  await page.getByRole("button", { name: "Save reminders" }).click();
}

async function settings(page: Page) {
  const response = await page.request.get("/api/v1/me/reminder-settings");
  expect(response.status()).toBe(200);
  return response.json();
}

// Flips a toggle and waits for its save.
async function flip(page: Page, name: string) {
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/v1/me/reminder-settings") && r.request().method() === "PATCH");
  await page.getByRole("switch", { name }).click();
  expect((await saved).ok()).toBe(true);
}

// No sideways scroll, and the element can be scrolled clear of the bottom bar,
// at least `minHeight` tall.
async function fitsAndClear(page: Page, target: Locator, what: string, minHeight = 44) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${what}: horizontal scroll`).toBeLessThanOrEqual(0);
  await target.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const box = await target.boundingBox();
  const bar = await page.getByRole("navigation").boundingBox();
  expect(box, what).not.toBeNull();
  expect(box!.height, `${what}: tap target height`).toBeGreaterThanOrEqual(minHeight);
  expect(box!.x + box!.width, `${what}: clipped right`).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (bar) expect(box!.y + box!.height, `${what}: under the bottom bar`).toBeLessThanOrEqual(bar.y + 0.5);
}

test("Reminder settings: open from Your account, each toggle saves, all off and back on, and the reminder star follows them", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("reminder-settings"), checkA11y);
  await track(page, DISCOVER);
  await page.goto("/home");
  const card = page.getByRole("region", { name: DISCOVER.name });
  await card.getByRole("link", { name: REMINDER }).click();
  await expect(page.getByText("Applies to all your cards.")).toBeVisible();
  await saveDays(page, "14", "9");
  await expect(page).toHaveURL(/\/home$/);
  await expect(card.getByRole("link", { name: REMINDER_DONE })).toBeVisible();

  // Your account has the row; it opens the screen.
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("link", { name: "Reminder settings" }).click();
  await expect(page).toHaveURL(/\/settings\/reminders$/);
  await expect(page.getByRole("heading", { level: 1, name: "Reminder settings" })).toBeVisible();
  for (const name of ["Statement closes soon", "Payment due", "Check autopay"]) {
    await expect(page.getByRole("switch", { name })).toHaveAttribute("aria-checked", "true");
  }
  await expect(page.getByText("Max one a day.")).toBeVisible();
  await checkA11y("reminder settings");

  // The due-date email off: saved, and still off after a reload.
  await flip(page, "Payment due");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Payment due" })).toHaveAttribute("aria-checked", "false");
  expect(await settings(page)).toMatchObject({ emailsOn: true, paymentDue: false });

  // Back, Back: Your account, then Home, where the star is out (it was lit).
  await page.getByRole("link", { name: "Back to Your account" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(card.getByText("0 of 3 lit")).toBeVisible();
  await expect(card.getByRole("link", { name: REMINDER })).not.toHaveAccessibleName(/done/);

  // On again: lit again, as the step is still saved.
  await page.goto("/settings/reminders");
  await flip(page, "Payment due");
  await page.goto("/home");
  await expect(card.getByRole("link", { name: REMINDER_DONE })).toBeVisible();

  // The first-statement email has its own switch now.
  await page.goto("/settings/reminders");
  await flip(page, "Check autopay");
  expect(await settings(page)).toMatchObject({ checkAutopay: false });
  await flip(page, "Check autopay");

  // Every email off, as the unsubscribe link does: saved, the star goes out.
  await page.getByRole("button", { name: "Turn off all reminders" }).click();
  await expect(page.getByText("Reminders are off. We won’t email you about your cards.")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await checkA11y("reminder settings: off");
  await page.reload();
  await expect(page.getByRole("button", { name: "Turn reminders back on" })).toBeVisible();
  expect(await settings(page)).toMatchObject({ emailsOn: false });
  await page.goto("/home");
  await expect(card.getByText("0 of 3 lit")).toBeVisible();

  // Back on, with each kind as it was.
  await page.goto("/settings/reminders");
  await page.getByRole("button", { name: "Turn reminders back on" }).click();
  await expect(page.getByRole("switch", { name: "Payment due" })).toHaveAttribute("aria-checked", "true");
  expect(await settings(page)).toEqual({ emailsOn: true, statementClosing: true, paymentDue: true, checkAutopay: true });
  await page.goto("/home");
  await expect(card.getByRole("link", { name: REMINDER_DONE })).toBeVisible();
});

test("a failed toggle moves back with the reason, and the screen fits a small phone", async ({ page }) => {
  await signUp(page, uniqueEmail("reminder-settings-edges"), async () => {});
  await page.goto("/settings/reminders");
  await page.route("**/api/v1/me/reminder-settings", (route) =>
    route.request().method() === "PATCH" ? route.abort("failed") : route.fallback(),
  );
  await page.getByRole("switch", { name: "Statement closes soon" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/^We couldn’t reach Cense/);
  await expect(page.getByRole("switch", { name: "Statement closes soon" })).toHaveAttribute("aria-checked", "true");
  await page.unroute("**/api/v1/me/reminder-settings");
  await page.reload();
  expect(await settings(page)).toMatchObject({ statementClosing: true });

  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(size);
    await page.reload();
    await fitsAndClear(page, page.getByRole("button", { name: "Turn off all reminders" }), `${size.width}: turn off all`);
    // The pill is 28px, its tap area 44 (switch.tsx); the row around it is taller still.
    await fitsAndClear(page, page.getByRole("switch", { name: "Check autopay" }), `${size.width}: check autopay`, 28);
    await fitsAndClear(page, page.getByRole("listitem").filter({ hasText: "Check autopay" }), `${size.width}: check autopay row`);
  }
});

test("signed out, the email's Reminder settings link signs in and comes back", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, reducedMotion: "reduce" });
  await blockExternalRequests(context);
  const visitor = await context.newPage();
  await visitor.goto("/settings/reminders");
  await expect(visitor).toHaveURL(/\/sign-in\?next=%2Fsettings%2Freminders$/);
  // Your account, and a reminder email's Open Cense button, come back too.
  await visitor.goto("/settings");
  await expect(visitor).toHaveURL(/\/sign-in\?next=%2Fsettings$/);
  await visitor.goto("/home?reminder=payment_due");
  await expect(visitor).toHaveURL(/\/sign-in\?next=%2Fhome%3Freminder%3Dpayment_due$/);
  await context.close();
});

test("a second approved card reaches its reminders from its own page, and Back and Save return there", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("reminder-card-page"), async () => {});
  const discover = await track(page, DISCOVER);
  await track(page, CHIME);
  await page.goto("/home");
  // Chime leads Home; Discover is under Your other cards and opens its page.
  await expect(page.getByRole("region", { name: CHIME.name })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`^${DISCOVER.name}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}\\?from=home$`));

  const row = page.getByRole("link", { name: /^Payment reminders/ });
  await expect(row).toContainText("Not set yet");
  await checkA11y("card page: reminders not set");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/applications/${discover}/reminders\\?from=card$`));

  // Back returns to the card's page.
  await page.getByRole("link", { name: "Back to Card details" }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}$`));

  // Saving returns there too, now on, and it survives a reload.
  await page.getByRole("link", { name: /^Payment reminders/ }).click();
  await saveDays(page, "20", "15");
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}$`));
  await expect(page.getByRole("link", { name: /^Payment reminders/ })).toContainText("On");
  await page.reload();
  await expect(page.getByRole("link", { name: /^Payment reminders/ })).toContainText("On");
  const saved = await (await page.request.get(`/api/v1/applications/${discover}`)).json();
  expect(saved).toMatchObject({ statementClosingDay: 20, paymentDueDay: 15 });

  // Every email off: the card says so.
  await page.request.patch("/api/v1/me/reminder-settings", { data: { emailsOn: false } });
  await page.reload();
  await expect(page.getByRole("link", { name: /^Payment reminders/ })).toContainText("Off");
});

test("the setup screen names the first-statement email only for a card the student just got", async ({ page }) => {
  await signUp(page, uniqueEmail("reminder-setup-copy"), async () => {});
  const FIRST_STATEMENT = /plus one autopay check after your first statement/;

  // A card they already had (added as approved): no first-statement email.
  const added = await track(page, DISCOVER);
  await page.goto(`/applications/${added}/reminders`);
  await expect(page.getByText("We’ll email you before your statement closes and before your bill is due.")).toBeVisible();
  await expect(page.getByText(FIRST_STATEMENT)).toHaveCount(0);
  await expect(page.getByText("Applies to all your cards.")).toBeVisible();

  // A card they applied for and got: it gets one, and the screen says so.
  const applied = await track(page, CHIME, "applied");
  const approved = await page.request.patch(`/api/v1/applications/${applied}`, { data: { status: "approved", creditLimitCents: 30000 } });
  expect(approved.status(), await approved.text()).toBe(200);
  await page.goto(`/applications/${applied}/reminders`);
  await expect(page.getByText(FIRST_STATEMENT)).toBeVisible();

  // With that email off in Reminder settings, it is not promised.
  await page.request.patch("/api/v1/me/reminder-settings", { data: { checkAutopay: false } });
  await page.reload();
  await expect(page.getByText(FIRST_STATEMENT)).toHaveCount(0);
});
