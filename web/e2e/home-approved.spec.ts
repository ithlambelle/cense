// Home for a student with an approved card, as a real signed-in student on
// the local stack: every control is used, the page is reloaded, and every
// link is followed. Written after three bugs reached production that only
// show up this way (Oct 24): the autopay star did not stay lit, "Edit" on the
// credit limit opened the status picker, and the card no longer opened its
// details.
import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };
const STARS = ["Turn on autopay", "Plan one purchase", "Set a payment reminder"] as const;

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

test("approved student: every first-month star stays lit after a reload, and unlights", async ({ page }) => {
  const { card, checkA11y } = await approvedStudent(page, "stars");
  await checkA11y("home: approved");

  for (const title of STARS) {
    const star = card.getByRole("checkbox", { name: new RegExp(title) });
    await expect(star).toBeEnabled();
    await expect(star).toHaveAttribute("aria-checked", "false");
    const write = nextWrite(page);
    await star.click();
    expect((await write).ok(), `${title} save`).toBe(true);
    await expect(star).toHaveAttribute("aria-checked", "true");
  }
  await expect(card.getByText("All three stars lit.", { exact: false })).toBeVisible();

  await page.reload();
  for (const title of STARS) {
    await expect(card.getByRole("checkbox", { name: new RegExp(title) }), `${title} after reload`).toHaveAttribute("aria-checked", "true");
  }

  // Unlighting saves too.
  const autopay = card.getByRole("checkbox", { name: /Turn on autopay/ });
  const write = nextWrite(page);
  await autopay.click();
  expect((await write).ok()).toBe(true);
  await page.reload();
  await expect(card.getByRole("checkbox", { name: /Turn on autopay/ })).toHaveAttribute("aria-checked", "false");
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

test("approved student: the card opens its details page and comes back", async ({ page }) => {
  const { card, checkA11y } = await approvedStudent(page, "details");

  await card.getByRole("link", { name: `${DISCOVER.name} details` }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Discover it");
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  await checkA11y("card details: tracked");

  await page.getByRole("link", { name: /Back/ }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("approved student: autopay shows what was saved after Back from the card page", async ({ page }) => {
  const { card } = await approvedStudent(page, "autopay-back");
  for (const lit of [true, false]) {
    const autopay = card.getByRole("checkbox", { name: /Turn on autopay/ });
    await expect(autopay).toBeEnabled();
    const write = nextWrite(page);
    await autopay.click();
    expect((await write).ok()).toBe(true);
    await card.getByRole("link", { name: `${DISCOVER.name} details` }).click();
    await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}`));
    // The browser's Back, not the in-app arrow: it restores the cached Home.
    await page.goBack();
    await expect(page).toHaveURL(/\/home$/);
    await expect(card.getByRole("checkbox", { name: /Turn on autopay/ })).toHaveAttribute("aria-checked", String(lit));
  }
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
