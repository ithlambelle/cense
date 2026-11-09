// Home for a student with an approved card, as a real signed-in student on
// the local stack: every control is used, the page is reloaded, and every
// link is followed. Written after three bugs reached production that only
// show up this way (Oct 24): the autopay star did not stay lit, "Edit" on the
// credit limit opened the status picker, and the card no longer opened its
// page. The card's title row now opens card setup (US-10, Flow C).
import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };
// Home's three stars. None ticks on Home: "Turn on autopay" opens card setup
// (card-setup.spec.ts), "Set a spend limit" its screens (spend-limit.spec.ts)
// and "Choose your reminders" the reminder screen (home-reminder.spec.ts).
const STARS = ["Turn on autopay", "Set a spend limit", "Choose your reminders"] as const;

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

// A new student with one approved card at a $500 limit, on Home.
async function approvedStudent(page: Page, journey: string) {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail(journey), checkA11y);
  const created = await page.request.post("/api/v1/applications", {
    data: { cardId: DISCOVER.id, cardName: DISCOVER.name, status: "approved", creditLimitCents: 50000 },
  });
  expect(created.status(), await created.text()).toBe(201);
  await page.goto("/home");
  const card = page.getByRole("region", { name: DISCOVER.name });
  await expect(card.getByText("$500")).toBeVisible();
  return { card, checkA11y };
}

// Waits for the write a tap sends, so a reload never races the save.
function nextWrite(page: Page) {
  return page.waitForResponse((r) => r.url().includes("/api/v1/") && r.request().method() !== "GET", { timeout: 10_000 });
}

test("approved student: each star opens the screen where it is done", async ({ page }) => {
  const { card, checkA11y } = await approvedStudent(page, "stars");
  await checkA11y("home: approved");
  await expect(card.getByRole("checkbox")).toHaveCount(0);
  for (const title of STARS) {
    await expect(card.getByRole("link", { name: new RegExp(`^${title}`) }), title).toBeVisible();
  }
  await expect(card.getByText("0 of 3 lit")).toBeVisible();
});

test("approved student: Edit changes the credit limit only, and it is saved", async ({ page }) => {
  const { card, checkA11y } = await approvedStudent(page, "limit");

  await card.getByRole("button", { name: "Edit credit limit" }).click();
  await expect(page).toHaveURL(/\/home$/);
  const field = card.getByLabel("Credit limit");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("500");
  await checkA11y("home: editing limit");
  // Nothing about the approval itself is offered here.
  await expect(page.getByText("What did the issuer decide?")).toHaveCount(0);

  // Cancel leaves it as it was.
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByText("$500")).toBeVisible();

  // A bad amount is refused in place.
  await card.getByRole("button", { name: "Edit credit limit" }).click();
  await card.getByLabel("Credit limit").fill("abc");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Enter the limit in dollars, like 500 or 1,500.")).toBeVisible();

  await card.getByLabel("Credit limit").fill("$1,250");
  const write = nextWrite(page);
  await card.getByRole("button", { name: "Save" }).click();
  expect((await write).ok()).toBe(true);
  await expect(card.getByText("$1,250")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("region", { name: DISCOVER.name }).getByText("$1,250")).toBeVisible();
  // Still approved: the star module is still there.
  await expect(page.getByRole("region", { name: DISCOVER.name }).getByText("Your first month")).toBeVisible();
});

test("approved student: Set up your card opens the setup list and comes back (Flow C 477:1514)", async ({ page }) => {
  const { card, checkA11y } = await approvedStudent(page, "setup-link");
  const row = card.getByRole("link", { name: "Set up your card" });
  await expect(row).toContainText(DISCOVER.name);
  await expect(row).toContainText("Approved");
  // At least 44px tall, and Edit stays its own control beside it.
  await expect(card.getByText("0 of 3 lit")).toBeVisible();
  expect(await row.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expect(card.getByRole("button", { name: "Edit credit limit" })).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+\/setup$/);
  await expect(page.getByRole("heading", { level: 1, name: "Set up your Discover card" })).toBeVisible();
  await checkA11y("card setup from Home");
  // The arrow returns to Home, the screen before (G1); Forward and Back walk the same two.
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/setup$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("region", { name: DISCOVER.name }).getByRole("link", { name: "Set up your card" })).toBeVisible();
});

test("denied student: a reason saved from Home shows on Home after Back", async ({ page }) => {
  await signUp(page, uniqueEmail("reason-back"), async () => {});
  const created = await page.request.post("/api/v1/applications", {
    data: { cardId: DISCOVER.id, cardName: DISCOVER.name, status: "rejected", creditLimitCents: null },
  });
  expect(created.status()).toBe(201);
  await page.goto("/home");
  await expect(page.getByText("Reason: not added")).toBeVisible();
  await page.getByRole("link", { name: "Add the reason" }).click();
  await page.getByRole("button", { name: "Yes, I know the reason" }).click();
  await page.getByRole("button", { name: "Not enough credit history" }).click();
  const write = nextWrite(page);
  await page.getByRole("button", { name: "Continue" }).click();
  expect((await write).ok()).toBe(true);
  await page.waitForURL((url) => url.pathname !== "/denied");
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Reason: not added")).toHaveCount(0);
  await expect(page.getByText(/^Reason: /)).toBeVisible();
});

test("approved student: every link on Home leads somewhere real", async ({ page }) => {
  await approvedStudent(page, "links");
  const hrefs = await page.locator("a[href]").evaluateAll((links) =>
    [...new Set(links.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""))].filter((h) => h.startsWith("/")),
  );
  expect(hrefs.length).toBeGreaterThan(2);
  for (const href of hrefs) {
    const response = await page.request.get(href, { maxRedirects: 0 });
    expect(response.status(), `${href}`).toBeLessThan(400);
  }
});
