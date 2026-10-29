// Journeys for the MVP2 screens no test drove before (audit H-P1-08): add a
// card you already have, the first-month plan, your account, the reapply
// reminder and its saved check, and "still waiting". Each test uses every
// control as a student would, reloads to check what was saved, follows every
// link and tries the edges. Forgot and reset password are in
// password-reset.spec.ts.
import { expect, test, type Page } from "@playwright/test";

import { addMonths, formatIsoDate, toIsoDate } from "../src/lib/dates";
import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { cardId: "discover-it-student-cash-back", cardName: "Discover it Student Cash Back" };
const SIZES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function track(page: Page, card: { cardId: string | null; cardName: string }, status: string, creditLimitCents: number | null = null) {
  const created = await page.request.post("/api/v1/applications", { data: { ...card, status, creditLimitCents } });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

async function applicationCount(page: Page): Promise<number> {
  const response = await page.request.get("/api/v1/applications");
  return ((await response.json()) as { applications: unknown[] }).applications.length;
}

// No sideways scroll at any of the three phone sizes.
async function fitsEverySize(page: Page, screen: string) {
  const original = page.viewportSize()!;
  for (const size of SIZES) {
    await page.setViewportSize(size);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${screen} at ${size.width}x${size.height}: horizontal scroll`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize(original);
}

// An ISO date `days` from today, and how the app writes it.
function inDays(days: number) {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const iso = toIsoDate(new Date(noon.getTime() + days * 86_400_000));
  return { iso, label: formatIsoDate(iso)! };
}

test("a student adds a card they already have, and it stays on Home", async ({ page, browser }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("add-card"), checkA11y);
  await page.getByRole("link", { name: "I already have a card" }).click();
  await expect(page).toHaveURL(/\/home\/add-card$/);
  await expect(page.getByRole("heading", { level: 1, name: "Add a card you already have" })).toBeVisible();
  await checkA11y("add card");
  await fitsEverySize(page, "add card");

  // Empty is refused in place, and nothing is saved.
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByText("Enter the card’s name.")).toBeVisible();
  expect(await applicationCount(page)).toBe(0);

  // Cancel and the back arrow both return Home with nothing added.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/home/add-card");
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(await applicationCount(page)).toBe(0);

  // A save with no answer says so and does not claim it worked.
  await page.goto("/home/add-card");
  await page.route("**/api/v1/applications", (route) => (route.request().method() === "POST" ? route.abort("failed") : route.fallback()));
  await page.getByLabel("Card name").fill("Campus Credit Union Visa");
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByText("We couldn’t confirm that. Go back and check your cards before adding it again.")).toBeVisible();
  await expect(page).toHaveURL(/\/home\/add-card$/);
  await page.unroute("**/api/v1/applications");

  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page).toHaveURL(/\/home$/);
  const card = page.getByRole("region", { name: "Campus Credit Union Visa" });
  await expect(card).toBeVisible();
  await page.reload();
  await expect(card).toBeVisible();
  expect(await applicationCount(page)).toBe(1);
  await checkA11y("home: added card");

  // Signed out, the screen sends the visitor to sign in.
  const visitor = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  await visitor.goto("/home/add-card");
  await expect(visitor).toHaveURL(/\/sign-in/);
  await visitor.context().close();
});

test("the first-month plan saves a ticked action, opens the reminder screen, and shows only the student's own card", async ({ page, browser }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("plan"), checkA11y);
  // Two cards added by name: Home leads with the newer one and lists the other,
  // which opens the first-month plan (cards not in the catalog have no card page).
  const older = await track(page, { cardId: null, cardName: "Older Credit Union Card" }, "approved");
  await track(page, { cardId: null, cardName: "Newer Store Card" }, "approved");
  await page.goto("/home");
  await page.getByRole("link", { name: /Older Credit Union Card/ }).click();
  await expect(page).toHaveURL(new RegExp(`/plan\\?application=${older}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Your first-month plan" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Older Credit Union Card" })).toBeVisible();
  const purchase = page.getByRole("checkbox", { name: /Choose one planned purchase/ });
  await expect(purchase).toBeEnabled();
  await expect(page.getByText("0 of 3 done")).toBeVisible();
  await checkA11y("first-month plan");
  await fitsEverySize(page, "first-month plan");

  // A tick is saved: it survives a reload.
  const saved = page.waitForResponse((r) => r.url().includes("/steps/planned_purchase") && r.request().method() === "PUT");
  await purchase.click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByText("1 of 3 done")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Choose one planned purchase/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("1 of 3 done")).toBeVisible();

  // Unticking is saved too.
  await page.getByRole("checkbox", { name: /Choose one planned purchase/ }).click();
  await expect(page.getByText("0 of 3 done")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Choose one planned purchase/ })).toHaveAttribute("aria-checked", "false");

  // The reminder row opens that card's reminder screen; Back returns here.
  await page.getByRole("link", { name: /Set a payment reminder/ }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${older}/reminders$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/plan\\?application=${older}$`));

  await page.getByRole("link", { name: "Go to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/plan?application=${older}`);
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // Another student with this card's id sees their own (empty) plan, never this card.
  const other = await (await browser.newContext({ baseURL: test.info().project.use.baseURL, reducedMotion: "reduce" })).newPage();
  await blockExternalRequests(other.context());
  await signUp(other, uniqueEmail("plan-intruder"), async () => {});
  await other.goto(`/plan?application=${older}`);
  await expect(other.getByRole("heading", { level: 1, name: "No approved card yet" })).toBeVisible();
  await expect(other.getByText("Older Credit Union Card")).toHaveCount(0);
  await axeChecker(other)("first-month plan: no approved card");
  await other.getByRole("link", { name: "Go to Home" }).click();
  await expect(other).toHaveURL(/\/home$/);
  await other.context().close();
});

test("your account shows the student's card and email, every link opens its screen, and Log out signs out", async ({ page }) => {
  const checkA11y = axeChecker(page);
  const email = uniqueEmail("settings");
  await signUp(page, email, checkA11y);
  await track(page, DISCOVER, "approved", 50000);

  await page.goto("/home");
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  // The email is shown to the student and masked in session replay.
  const shown = page.getByText(email);
  await expect(shown).toBeVisible();
  expect(await shown.evaluate((el) => el.closest(".ph-sensitive") !== null)).toBe(true);
  const card = page.getByRole("link", { name: /Discover it Student Cash Back/ });
  await expect(card).toContainText("Approved, $500 limit");
  await checkA11y("account");
  await fitsEverySize(page, "account");

  for (const [name, path] of [
    [/Discover it Student Cash Back/, /\/home$/],
    ["Card quiz results", /\/(results|quiz)$/],
    ["Add a card I already have", /\/home\/add-card$/],
    ["Browse cards", /\/cards$/],
    ["Back to Home", /\/home$/],
  ] as const) {
    await page.goto("/settings");
    await page.getByRole("link", { name }).click();
    await expect(page, String(name)).toHaveURL(path);
  }

  await page.goto("/settings");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a denied student sets a reapply reminder, sees it saved after a reload, and can change the date", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("reapply"), checkA11y);
  const id = await track(page, DISCOVER, "rejected");
  const other = await track(page, { cardId: "chime-card", cardName: "Chime Card" }, "rejected");
  const sixMonths = (() => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    return formatIsoDate(toIsoDate(addMonths(noon, 6)))!;
  })();

  await page.goto(`/denied/plan?application=${id}`);
  await page.getByRole("link", { name: "Set a 6-month reminder" }).click();
  await expect(page).toHaveURL(new RegExp(`/denied/reminder\\?application=${id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Choose when to check in" })).toBeVisible();
  const sixMonthsOption = page.getByRole("button", { name: /In about 6 months/ });
  await expect(sixMonthsOption).toHaveAttribute("aria-pressed", "true");
  await expect(sixMonthsOption).toContainText(sixMonths);
  await checkA11y("reapply reminder");
  await fitsEverySize(page, "reapply reminder");

  // The plan link and the back arrow both lead to the plan.
  await page.getByRole("link", { name: "See the 5-step plan" }).click();
  await expect(page).toHaveURL(new RegExp(`/denied/plan\\?application=${id}$`));
  await page.goBack();
  await page.getByRole("link", { name: "Back to Plan" }).click();
  await expect(page).toHaveURL(new RegExp(`/denied/plan\\?application=${id}$`));
  await page.goto(`/denied/reminder?application=${id}`);

  // A date of today, or more than a year out, is refused; nothing is saved.
  await page.getByRole("button", { name: /Choose another date/ }).click();
  const date = page.getByLabel("Reminder date");
  await date.fill(inDays(0).iso);
  await page.getByRole("button", { name: "Save reapply reminder" }).click();
  await expect(page.getByText("Pick a date after today.")).toBeVisible();
  await date.fill(inDays(400).iso);
  await page.getByRole("button", { name: "Save reapply reminder" }).click();
  await expect(page.getByText(/^Pick a date no later than /)).toBeVisible();
  await expect(page).toHaveURL(/\/denied\/reminder\?/);

  // A real date saves, and the saved screen reads it back from the server.
  const chosen = inDays(30);
  await date.fill(chosen.iso);
  await page.getByRole("button", { name: "Save reapply reminder" }).click();
  await expect(page).toHaveURL(new RegExp(`/denied/reminder/saved\\?application=${id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Your reminder is saved" })).toBeVisible();
  await expect(page.getByText(chosen.label)).toBeVisible();
  await checkA11y("reapply reminder: saved");
  await fitsEverySize(page, "reapply reminder: saved");
  await page.reload();
  await expect(page.getByText(chosen.label)).toBeVisible();

  // Choosing again replaces the date: one reapply reminder, now in six months.
  await page.goto(`/denied/reminder?application=${id}`);
  await page.getByRole("button", { name: "Save reapply reminder" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your reminder is saved" })).toBeVisible();
  await expect(page.getByText(sixMonths)).toBeVisible();
  const reminders = (await (await page.request.get("/api/v1/reminders")).json()) as { reminders: { kind: string; applicationId: string }[] };
  expect(reminders.reminders.filter((r) => r.kind === "reapply" && r.applicationId === id)).toHaveLength(1);
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // The saved screen for a card with no reminder never claims one is set.
  await page.goto(`/denied/reminder/saved?application=${other}`);
  await expect(page.getByRole("heading", { level: 1, name: "We couldn’t find a reminder" })).toBeVisible();
  await page.getByRole("link", { name: "Set a reminder" }).click();
  await expect(page).toHaveURL(new RegExp(`/denied/reminder\\?application=${other}$`));

  // A failed save stays on the screen with a message.
  await page.route("**/api/v1/reminders", (route) => (route.request().method() === "POST" ? route.abort("failed") : route.fallback()));
  await page.getByRole("button", { name: "Save reapply reminder" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "We couldn’t reach Cense" })).toBeVisible();
  await expect(page).toHaveURL(/\/denied\/reminder\?/);
});

test("a student still waiting on the issuer sees what to expect, and nothing changes until they hear back", async ({ page, browser }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("waiting"), checkA11y);
  const id = await track(page, DISCOVER, "applied");

  await page.goto("/home");
  await page.getByRole("link", { name: "Update my status" }).click();
  await page.getByRole("group", { name: "What the issuer decided" }).getByRole("button", { name: "I haven’t heard yet" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/waiting$`));
  await expect(page.getByRole("heading", { level: 1, name: "Still waiting is normal" })).toBeVisible();
  await expect(page.getByText(`Here’s what to expect for ${DISCOVER.cardName}.`)).toBeVisible();
  await checkA11y("still waiting");
  await fitsEverySize(page, "still waiting");

  // Nothing was saved: the card is still applied, after a reload too.
  await page.reload();
  const status = await page.request.get(`/api/v1/applications/${id}`);
  expect(((await status.json()) as { status: string }).status).toBe("applied");

  await page.getByRole("link", { name: "I heard back" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "What did the issuer decide?" })).toBeVisible();
  await page.goto(`/applications/${id}/waiting`);
  await page.getByRole("link", { name: "Back to Your application" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}$`));
  await page.goto(`/applications/${id}/waiting`);
  await page.getByRole("link", { name: "Go to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("region", { name: DISCOVER.cardName }).getByText("APPLIED", { exact: true })).toBeVisible();

  // Another student, or a made-up id: not found.
  const other = await (await browser.newContext({ baseURL: test.info().project.use.baseURL, reducedMotion: "reduce" })).newPage();
  await blockExternalRequests(other.context());
  await signUp(other, uniqueEmail("waiting-intruder"), async () => {});
  expect((await other.goto(`/applications/${id}/waiting`))?.status()).toBe(404);
  await expect(other.getByText(DISCOVER.cardName)).toHaveCount(0);
  expect((await other.goto("/applications/not-an-id/waiting"))?.status()).toBe(404);
  await other.context().close();
});
