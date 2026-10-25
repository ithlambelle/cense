// Bugs found walking every screen as signed-in students on the local stack
// (Oct 24). Each test fails on the code before its fix.
import { expect, test, type Page } from "@playwright/test";

import { blockExternalRequests, signUp, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };
const CHIME = { id: "chime-card", name: "Chime Card" };

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function track(page: Page, card: { id: string; name: string }, status: string, creditLimitCents: number | null = null) {
  const res = await page.request.post("/api/v1/applications", {
    data: { cardId: card.id, cardName: card.name, status, creditLimitCents },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test("a button tapped straight from a text field fires: the bottom bar does not come back under it", async ({ page }) => {
  await signUp(page, uniqueEmail("tap-from-field"), async () => {});
  const id = await track(page, DISCOVER, "rejected");
  await page.goto(`/denied?application=${id}`);
  await page.getByRole("button", { name: "Yes, I know the reason" }).click();
  await page.getByRole("button", { name: "Something else" }).click();
  // The bar hides while typing and comes back when the student taps away.
  const note = page.getByLabel("What did the letter say?");
  await note.fill("Too many");
  await expect(page.getByRole("navigation")).toBeHidden();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  // The note keeps focus (the bar is hidden while typing); Continue is tapped from there.
  await note.fill("Too many recent applications");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/denied\/plan\?application=/);
});

test("the same tap with a finger fires too", async ({ browser }) => {
  // Touch sends pointerup before the mousedown that moves focus, unlike a mouse.
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  await blockExternalRequests(context);
  const page = await context.newPage();
  await signUp(page, uniqueEmail("tap-from-field-touch"), async () => {});
  const id = await track(page, DISCOVER, "rejected");
  await page.goto(`/denied?application=${id}`);
  await page.getByRole("button", { name: "Yes, I know the reason" }).tap();
  await page.getByRole("button", { name: "Something else" }).tap();
  const note = page.getByLabel("What did the letter say?");
  await note.fill("Too many recent applications");
  await expect(page.getByRole("navigation")).toBeHidden();
  await page.getByRole("button", { name: "Continue" }).tap();
  await expect(page).toHaveURL(/\/denied\/plan\?application=/);
  await context.close();
});

test("after approving a card, Back does not reopen the status form", async ({ page }) => {
  await signUp(page, uniqueEmail("back-after-approve"), async () => {});
  await track(page, DISCOVER, "applied");
  await page.goto("/home");
  await page.getByRole("link", { name: "Update my status" }).click();
  await page.getByRole("button", { name: "I was approved" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "You’re approved!" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "What did the issuer decide?" })).toHaveCount(0);
});

test("a tracked card's page shows its status, not the preapproval check or apply hand-off", async ({ page }) => {
  await signUp(page, uniqueEmail("tracked-card-page"), async () => {});
  for (const status of ["approved", "applied", "rejected"] as const) {
    const card = status === "approved" ? DISCOVER : status === "applied" ? CHIME : { id: "capital-one-platinum", name: "Capital One Platinum" };
    await track(page, card, status, status === "approved" ? 50000 : null);
    await page.goto(`/cards/${card.id}`);
    await expect(page.getByRole("heading", { name: "Your status" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Check if you’re preapproved/ }), status).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Apply on/ }), status).toHaveCount(0);
  }
  // A card they do not track still offers both.
  await page.goto("/cards/capital-one-savor-students");
  await expect(page.getByRole("button", { name: /^Apply on/ })).toBeVisible();
});

test("a second approved card on Home opens its card page, where its status lives", async ({ page }) => {
  await signUp(page, uniqueEmail("second-approved"), async () => {});
  await track(page, DISCOVER, "approved", 50000);
  await track(page, CHIME, "approved", 30000);
  await page.goto("/home");
  // Home leads with the most recently changed card; the other one is listed below.
  const other = page.getByRole("region", { name: "Your other cards" }).getByRole("link").first();
  await expect(other).toHaveAttribute("href", new RegExp(`^/cards/(${DISCOVER.id}|${CHIME.id})\\?from=home$`));
  await other.click();
  await expect(page).toHaveURL(new RegExp(`/cards/(${DISCOVER.id}|${CHIME.id})\\?from=home$`));
  await expect(page.getByRole("heading", { name: "Your status" })).toBeVisible();
});
