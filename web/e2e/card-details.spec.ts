// Created with Claude Code (2026-11-19). The card page in sections (Flow 2,
// Figma gPofkJWVZ2wUWyF9SfHW6O 821:8740): K2 "Your match" for a card the
// student does not have, K1 "Your card" for one they track. Walked as a
// student: open each section, use every link, come Back, reload. Fails on the
// flat card page before it (no sections to open).
import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, LIKELY_FIT_PICKS, GROCERIES_AND_DINING, signUp, takeQuiz, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function track(page: Page, status: "approved" | "applied", creditLimitCents: number | null) {
  const res = await page.request.post("/api/v1/applications", {
    data: { cardId: DISCOVER.id, cardName: DISCOVER.name, status, creditLimitCents },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const title = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) });

// The titles, in order, and the open ones.
async function sections(page: Page) {
  const buttons = page.locator("[data-accordion-trigger]");
  const titles = await buttons.locator("span > span:first-child").allTextContents();
  const open = await buttons.evaluateAll((all) =>
    all.filter((button) => button.getAttribute("aria-expanded") === "true").map((button) => button.querySelector("span > span")?.textContent),
  );
  return { titles, open };
}

async function noSidewaysScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, label).toBeLessThanOrEqual(0);
}

test("a match opens on Why it fits you, keeps one section open, works from the keyboard, and ends with the issuer buttons", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("card-details-match"), async () => {});
  await page.getByRole("link", { name: "Start the quiz" }).click();
  await takeQuiz(page, LIKELY_FIT_PICKS, async () => {}, GROCERIES_AND_DINING);

  // From the Cards tab: the same page, the same sections.
  await page.goto("/cards");
  await page.getByRole("link", { name: new RegExp(DISCOVER.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: DISCOVER.name })).toBeVisible();
  await expect(page.getByText("Likely fit")).toBeVisible();
  await expect(page.getByText(/^\$\d[\d,]* year one, est\.$/)).toBeVisible();
  expect(await sections(page)).toEqual({
    titles: ["Why it fits you", "What the issuer looks for", "Rewards", "Fees and rates"],
    open: ["Why it fits you"],
  });
  // The summary is the rules' reason for this student, without its full stop.
  await expect(title(page, "Why it fits you")).toHaveText(/^Why it fits youMade for students .*like you$/);
  await expect(page.getByRole("region", { name: "Why it fits you" })).toBeVisible();
  await checkA11y("card page: match, why it fits open");

  // One open at a time, every section in turn.
  for (const name of ["What the issuer looks for", "Rewards", "Fees and rates"]) {
    await title(page, name).click();
    await expect(page.getByRole("region", { name })).toBeVisible();
    expect((await sections(page)).open, name).toEqual([name]);
  }
  await checkA11y("card page: match, fees open");
  await expect(page.getByRole("region", { name: "Fees and rates" })).toContainText("Annual fee · $0");
  // Tapping the open one closes it.
  await title(page, "Fees and rates").click();
  expect((await sections(page)).open).toEqual([]);

  // The keyboard: Tab reaches a title, Enter and Space open and close, the arrows move between titles.
  await title(page, "Rewards").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Rewards" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Rewards" }).getByText(/^About \$\d[\d,]* in your first year$/)).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(title(page, "Fees and rates")).toBeFocused();
  await page.keyboard.press(" ");
  expect((await sections(page)).open).toEqual(["Fees and rates"]);
  await page.keyboard.press("Home");
  await expect(title(page, "Why it fits you")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(title(page, "Fees and rates")).toBeFocused();
  // The ring shows on the focused title.
  const ring = await title(page, "Fees and rates").evaluate((button) => getComputedStyle(button).outlineStyle);
  expect(ring).not.toBe("none");

  // The buttons, after every section: preapproval first, then Apply.
  const buttons = page.getByRole("button", { name: new RegExp(`: ${DISCOVER.name}$`) });
  await expect(buttons).toHaveText(["Check if you’re preapproved", "Apply at Discover"]);
  await buttons.first().click();
  await expect(page.getByRole("dialog", { name: "Check first, then decide" })).toContainText("This check won’t affect your credit score.");
  await page.keyboard.press("Escape");

  // A reload starts again on Why it fits you; Back returns to the Cards tab.
  await page.reload();
  expect((await sections(page)).open).toEqual(["Why it fits you"]);
  await page.getByRole("link", { name: /^Back to / }).click();
  await expect(page).toHaveURL(/\/cards$/);

  // Narrow and wide phones: nothing runs off the side.
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/cards/${DISCOVER.id}`);
    await expect(page.getByRole("heading", { level: 1, name: DISCOVER.name })).toBeVisible();
    await noSidewaysScroll(page, `match at ${width}`);
  }
});

test("a signed-out visitor sees the sections without a fit, and an issuer button asks them to sign in", async ({ page }) => {
  await page.goto(`/cards/${DISCOVER.id}`);
  expect(await sections(page)).toEqual({
    titles: ["What the issuer looks for", "Rewards", "Fees and rates"],
    open: ["What the issuer looks for"],
  });
  await expect(page.getByText("Likely fit")).toHaveCount(0);
  await page.getByRole("button", { name: `Apply at Discover: ${DISCOVER.name}` }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcards%2Fdiscover-it-student-cash-back$/);
});

test("the student's approved card opens on Your dates, and every section's link opens its screen and comes back", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("card-details-yours"), async () => {});
  const id = await track(page, "approved", 50000);
  await page.goto(`/cards/${DISCOVER.id}?from=home`);

  // Nothing saved yet: each section says so and offers the way to set it.
  await expect(page.getByRole("region", { name: "Your status" })).toHaveText("Approved");
  expect(await sections(page)).toEqual({
    titles: ["Your dates", "Autopay and reminders", "Spend limit", "Rewards", "Fees and rates"],
    open: ["Your dates"],
  });
  await expect(title(page, "Your dates")).toContainText("Not set yet");
  await expect(title(page, "Autopay and reminders")).toContainText("Autopay not set yet · reminders not set yet");
  await expect(title(page, "Spend limit")).toContainText("Not set yet");
  await checkA11y("card page: your card, nothing set");

  // Set the days, autopay and a limit as the screens would.
  const saved = await page.request.patch(`/api/v1/applications/${id}`, {
    data: { statementClosingDay: 18, paymentDueDay: 12, autopayStatus: "on", autopayPaymentType: "statement_balance", spendLimitCents: 15000 },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  await page.reload();
  await expect(title(page, "Your dates")).toContainText("Statement closes day 18 · due day 12");
  const dates = page.getByRole("region", { name: "Your dates" });
  await expect(dates).toContainText("Statement closes · Day 18");
  await expect(dates).toContainText("Payment due · Day 12");
  await expect(dates).not.toContainText("from your bank");
  await expect(title(page, "Autopay and reminders")).toContainText("Autopay on");
  await expect(title(page, "Spend limit")).toContainText("$150 a month, your pick");
  await checkA11y("card page: your card, all set");

  // Your dates opens the payment reminder screen; Back returns to this page as it was opened.
  await dates.getByRole("link", { name: "Change your dates" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/reminders\\?from=card&card_from=home$`));
  await page.getByRole("link", { name: "Back to Card details" }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}\\?from=home$`));

  // Autopay is on: See autopay opens "Autopay is on"; Back returns.
  await title(page, "Autopay and reminders").click();
  const autopay = page.getByRole("region", { name: "Autopay and reminders" });
  await expect(autopay).toContainText("Autopay · On, statement balance");
  await autopay.getByRole("link", { name: "See autopay" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/autopay/on$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}\\?from=home$`));

  // Reminders from the same section.
  await title(page, "Autopay and reminders").click();
  await page.getByRole("region", { name: "Autopay and reminders" }).getByRole("link", { name: /reminders$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/reminders\\?from=card&card_from=home$`));
  await page.getByRole("link", { name: "Back to Card details" }).click();

  // The spend limit opens at the suggestion (a credit limit is saved).
  await title(page, "Spend limit").click();
  const limit = page.getByRole("region", { name: "Spend limit" });
  await expect(limit).toContainText("Spend limit · $150 a month");
  await expect(limit).toContainText("Credit limit · $500");
  await limit.getByRole("link", { name: "Change your limit" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}/setup/spend-limit/suggestion$`));
  await page.goBack();

  // Update status opens Mark result; its Back returns here.
  await page.getByRole("link", { name: "Update status" }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}\\?from=card$`));
  await page.getByRole("link", { name: /^Back to / }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}`));

  // No issuer hand-off for the student's own card, at any width.
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/cards/${DISCOVER.id}?from=home`);
    await expect(page.getByRole("region", { name: "Your status" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Apply at/ })).toHaveCount(0);
    await noSidewaysScroll(page, `your card at ${width}`);
  }
});
