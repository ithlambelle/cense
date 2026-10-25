// Home's "Set a payment reminder" row, as a real signed-in student on the
// local stack. On main the row was a star the student could tick without
// setting any reminder. It now opens the reminder screen (US-08), which lights
// the star only once the days and reminders are saved; a lit row still opens
// it, so the days can be changed.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };
const CHIME = { id: "chime-card", name: "Chime Card" };
const REMINDER = /^Set a payment reminder/;
// A link has no checked state: a lit row says "done" to screen readers.
const REMINDER_DONE = /^Set a payment reminder\s*, done/;
const DAY_ERROR = "Enter a day from 1 to 31.";

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function track(page: Page, card: { id: string; name: string }, creditLimitCents = 50000) {
  const created = await page.request.post("/api/v1/applications", {
    data: { cardId: card.id, cardName: card.name, status: "approved", creditLimitCents },
  });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

// A new student with one approved card, on Home.
async function approvedStudent(page: Page, journey: string) {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail(journey), checkA11y);
  const id = await track(page, DISCOVER);
  await page.goto("/home");
  const card = page.getByRole("region", { name: DISCOVER.name });
  await expect(card.getByText("$500")).toBeVisible();
  // The saved stars have loaded: the tick rows wait for them.
  await expect(card.getByRole("checkbox", { name: /Turn on autopay/ })).toBeEnabled();
  return { id, card, checkA11y };
}

const remindersUrl = (id: string) => new RegExp(`/applications/${id}/reminders$`);

async function reminderStarDone(page: Page, id: string): Promise<boolean> {
  const response = await page.request.get(`/api/v1/applications/${id}/plans/first_month`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { completedSteps: { step: string }[] };
  return body.completedSteps.some((s) => s.step === "payment_reminder");
}

async function savedDays(page: Page, id: string) {
  const response = await page.request.get(`/api/v1/applications/${id}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { statementClosingDay: number | null; paymentDueDay: number | null };
  return { closing: body.statementClosingDay, due: body.paymentDueDay };
}

// Types both days, taps away from the field (the bottom bar hides while one has
// focus) and saves. Resolves once Home is back.
async function saveDays(page: Page, closing: string, due: string) {
  await page.getByLabel("Statement closes on day").fill(closing);
  await page.getByLabel("Payment due on day").fill(due);
  await page.getByRole("heading", { level: 1, name: "Never miss a payment" }).click();
  await page.getByRole("button", { name: "Save reminders" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

// No sideways scroll, and the element can be scrolled clear of the bottom bar
// (as far as the page scrolls), at least 44px tall unless told otherwise.
async function fitsAndClear(page: Page, target: Locator, what: string, minHeight = 44) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${what}: horizontal scroll`).toBeLessThanOrEqual(0);
  await target.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const box = await target.boundingBox();
  const bar = await page.getByRole("navigation").boundingBox();
  expect(box, what).not.toBeNull();
  expect(box!.height, `${what}: tap target height`).toBeGreaterThanOrEqual(minHeight);
  expect(box!.x, `${what}: clipped left`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${what}: clipped right`).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (bar) expect(box!.y + box!.height, `${what}: under the bottom bar`).toBeLessThanOrEqual(bar.y + 0.5);
}

test("the reminder row opens the reminder screen instead of ticking, and saving lights its star", async ({ page }) => {
  const { id, card, checkA11y } = await approvedStudent(page, "reminder-row");

  // It is a link, not a checkbox; the other two rows still tick.
  await expect(card.getByRole("checkbox", { name: REMINDER })).toHaveCount(0);
  const row = card.getByRole("link", { name: REMINDER });
  await expect(row).toHaveAttribute("href", `/applications/${id}/reminders`);
  await expect(card.getByRole("checkbox", { name: /Turn on autopay/ })).toHaveAttribute("aria-checked", "false");
  await expect(card.getByRole("checkbox", { name: /Plan one purchase/ })).toHaveAttribute("aria-checked", "false");
  await expect(card.getByText("0 of 3 lit")).toBeVisible();

  // Tapping it saves nothing and opens the screen.
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/") && r.method() !== "GET") writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  await row.click();
  await expect(page).toHaveURL(remindersUrl(id));
  await expect(page.getByRole("heading", { level: 1, name: "Never miss a payment" })).toBeVisible();
  expect(writes).toEqual([]);
  expect(await reminderStarDone(page, id)).toBe(false);
  await checkA11y("payment reminders");

  // The back arrow returns to Home with nothing lit; so does the browser's Back.
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(card.getByText("0 of 3 lit")).toBeVisible();
  await card.getByRole("link", { name: REMINDER }).click();
  await expect(page).toHaveURL(remindersUrl(id));
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await expect(card.getByRole("link", { name: REMINDER })).not.toHaveAccessibleName(/done/);

  // Saving brings the student Home with the star lit.
  await card.getByRole("link", { name: REMINDER }).click();
  await saveDays(page, "14", "9");
  await expect(card.getByRole("link", { name: REMINDER_DONE })).toBeVisible();
  await expect(card.getByText("1 of 3 lit")).toBeVisible();
  expect(await reminderStarDone(page, id)).toBe(true);
  expect(await savedDays(page, id)).toEqual({ closing: 14, due: 9 });

  await page.reload();
  await expect(card.getByRole("link", { name: REMINDER_DONE })).toBeVisible();
  await expect(card.getByText("1 of 3 lit")).toBeVisible();
  await checkA11y("home: reminder set");

  // A lit row still opens the screen, with the saved days, so they can change.
  await card.getByRole("link", { name: REMINDER_DONE }).click();
  await expect(page).toHaveURL(remindersUrl(id));
  await expect(page.getByLabel("Statement closes on day")).toHaveValue("14");
  await expect(page.getByLabel("Payment due on day")).toHaveValue("9");
  await saveDays(page, "14", "20");
  expect(await savedDays(page, id)).toEqual({ closing: 14, due: 20 });
  await expect(card.getByRole("link", { name: REMINDER_DONE })).toBeVisible();

  // Back after saving shows the reminder screen with what was just saved, not the old days.
  await page.goBack();
  await expect(page).toHaveURL(remindersUrl(id));
  await expect(page.getByLabel("Payment due on day")).toHaveValue("20");
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // The other two still tick; with the reminder set, all three are lit.
  for (const title of [/Turn on autopay/, /Plan one purchase/]) {
    const star = card.getByRole("checkbox", { name: title });
    await expect(star).toBeEnabled();
    const write = page.waitForResponse((r) => r.url().includes("/api/v1/") && r.request().method() !== "GET");
    await star.click();
    expect((await write).ok()).toBe(true);
  }
  await expect(card.getByText("All three stars lit.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(card.getByText("All stars lit")).toBeVisible();
});

test("the reminder screen refuses bad days and a failed save, and saves once on a double tap", async ({ page }) => {
  const { id, card } = await approvedStudent(page, "reminder-edges");
  await card.getByRole("link", { name: REMINDER }).click();
  await expect(page).toHaveURL(remindersUrl(id));

  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/") && r.method() !== "GET") writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  const save = page.getByRole("button", { name: "Save reminders" });
  const closing = page.getByLabel("Statement closes on day");
  const due = page.getByLabel("Payment due on day");
  const heading = page.getByRole("heading", { level: 1, name: "Never miss a payment" });

  // Empty, 0, 32 and letters are refused in place, and nothing is sent.
  for (const [c, d] of [["", ""], ["0", "9"], ["14", "32"], ["ab", "9"]]) {
    await closing.fill(c);
    await due.fill(d);
    await heading.click();
    await save.click();
    await expect(page.getByText(DAY_ERROR).first(), `${c} / ${d}`).toBeVisible();
    await expect(page).toHaveURL(remindersUrl(id));
  }
  expect(writes).toEqual([]);

  // A failed save stays on the screen with a message, and the star stays out.
  await page.route(`**/api/v1/applications/${id}`, (route) =>
    route.request().method() === "PATCH" ? route.abort("failed") : route.fallback(),
  );
  await closing.fill("14");
  await due.fill("9");
  await heading.click();
  await save.click();
  // Nothing was saved, so the message is the connection error alone.
  await expect(page.locator("form").getByRole("alert")).toHaveText(/^We couldn’t reach Cense/);
  await expect(page).toHaveURL(remindersUrl(id));
  await expect(save).toBeEnabled();
  expect(await reminderStarDone(page, id)).toBe(false);
  await page.unroute(`**/api/v1/applications/${id}`);

  // A double tap saves once.
  writes.length = 0;
  await save.dblclick();
  await expect(page).toHaveURL(/\/home$/);
  expect(writes.filter((w) => w === `PATCH /api/v1/applications/${id}`)).toHaveLength(1);
  expect(writes.filter((w) => w.endsWith("/steps/payment_reminder"))).toHaveLength(1);
  await expect(card.getByRole("link", { name: REMINDER_DONE })).toBeVisible();
});

test("the row opens the screen while the saved stars are still loading", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("reminder-slow"), checkA11y);
  const id = await track(page, DISCOVER);
  // Hold the plan read for a long time, as on a slow phone connection.
  await page.route(`**/api/v1/applications/${id}/plans/first_month`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    await route.fallback().catch(() => {});
  });
  await page.goto("/home");
  const card = page.getByRole("region", { name: DISCOVER.name });
  // Still loading: the tick rows wait, the reminder row does not.
  await expect(card.getByRole("checkbox", { name: /Turn on autopay/ })).toBeDisabled();
  await card.getByRole("link", { name: REMINDER }).click();
  await expect(page).toHaveURL(remindersUrl(id));
  await expect(page.getByRole("heading", { level: 1, name: "Never miss a payment" })).toBeVisible();
});

test("with two approved cards, the reminder row opens the card it sits on", async ({ page }) => {
  await signUp(page, uniqueEmail("reminder-two-cards"), async () => {});
  const first = await track(page, DISCOVER);
  const second = await track(page, CHIME, 30000);
  await page.goto("/home");
  // Home leads with the most recently changed card.
  const card = page.getByRole("region", { name: CHIME.name });
  await expect(card.getByText("$300")).toBeVisible();
  await card.getByRole("link", { name: REMINDER }).click();
  await expect(page).toHaveURL(remindersUrl(second));
  await saveDays(page, "3", "28");
  expect(await reminderStarDone(page, second)).toBe(true);
  expect(await reminderStarDone(page, first)).toBe(false);
  expect(await savedDays(page, first)).toEqual({ closing: null, due: null });
});

test("signed out, or another student's card: the reminder screen is not shown", async ({ page, browser }) => {
  await signUp(page, uniqueEmail("reminder-owner"), async () => {});
  const id = await track(page, DISCOVER);

  // Signed out: sent to sign in, and brought back here afterwards.
  const signedOut = await browser.newContext({ baseURL: test.info().project.use.baseURL, reducedMotion: "reduce" });
  await blockExternalRequests(signedOut);
  const visitor = await signedOut.newPage();
  await visitor.goto(`/applications/${id}/reminders`);
  await expect(visitor).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(`/applications/${id}/reminders`)}$`));
  await expect(visitor.getByText("Never miss a payment")).toHaveCount(0);

  // Another student: not found, and their days cannot be saved.
  await signUp(visitor, uniqueEmail("reminder-intruder"), async () => {});
  const response = await visitor.goto(`/applications/${id}/reminders`);
  expect(response?.status()).toBe(404);
  await expect(visitor.getByText("Never miss a payment")).toHaveCount(0);
  const patch = await visitor.request.patch(`/api/v1/applications/${id}`, { data: { statementClosingDay: 1, paymentDueDay: 2 } });
  expect(patch.status()).toBe(404);
  await signedOut.close();
  expect(await savedDays(page, id)).toEqual({ closing: null, due: null });
});

for (const size of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`at ${size.width}x${size.height} the row and the reminder screen fit, clear of the bottom bar`, async ({ page }) => {
    await page.setViewportSize(size);
    const { id, card } = await approvedStudent(page, `reminder-${size.width}`);
    const row = card.getByRole("link", { name: REMINDER });
    await fitsAndClear(page, row, "Home: reminder row");
    await row.click();
    await expect(page).toHaveURL(remindersUrl(id));
    // The drawn field box. (Its input is only 20px of it; listed in the PR.)
    for (const label of ["Statement closes on day", "Payment due on day"]) {
      await fitsAndClear(page, page.getByLabel(label).locator(".."), label);
    }
    const toggles = await page.getByRole("switch").all();
    expect(toggles).toHaveLength(2);
    // The pill is 28px; its hit area reaches 44px with an 8px ::after on each side.
    for (const toggle of toggles) await fitsAndClear(page, toggle, "reminder toggle", 28);
    await fitsAndClear(page, page.getByRole("button", { name: "Save reminders" }), "Save reminders");
    await fitsAndClear(page, page.getByRole("link", { name: "Back to Home" }), "Back");
  });
}
