// Created with Claude Code (2026-11-26). A student with two cards: one picked
// from the catalog in Add a card, one typed by hand. The catalog card gets its
// own card page ("Approved", no Apply) and never comes back as a quiz match; a
// $0 limit is refused by the API as by the form; each card can be removed, and
// its reminders and setup steps go with it. Someone else's card and a card
// applied for through Cense cannot be removed.
import { expect, test, type Page } from "@playwright/test";

import { axeChecker, blockExternalRequests, signUp, uniqueEmail } from "./helpers";
import { asStudent } from "./support/data-api";

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

const DISCOVER = "discover-it-student-cash-back";
// Devon's answers (persona walk, Nov 25): his own Discover card was his top match.
const ESTABLISHED = { under21: false, incomeBand: "5k_to_15k", student: true, standing: "established", recentDenial: false, canDeposit: true };

type Card = { id: string; cardId: string | null; cardName: string; status: string; creditLimitCents: number | null };

async function cards(page: Page): Promise<Card[]> {
  const response = await page.request.get("/api/v1/applications");
  expect(response.status()).toBe(200);
  return (await response.json()).applications;
}

// The card's reminders and setup steps, read with the student's own session.
async function hanging(page: Page, id: string): Promise<number> {
  let count = 0;
  for (const table of ["reminders", "plan_steps"]) {
    const answer = await asStudent(page.context(), { table });
    expect(answer.status).toBe(200);
    count += (answer.body as { card_application_id: string }[]).filter((row) => row.card_application_id === id).length;
  }
  return count;
}

// Days and a done setup step, so the card has scheduled reminders and progress.
async function setUp(page: Page, id: string) {
  expect((await page.request.patch(`/api/v1/applications/${id}`, { data: { statementClosingDay: 18, paymentDueDay: 12 } })).status()).toBe(200);
  expect((await page.request.put(`/api/v1/applications/${id}/plans/first_month/steps/payment_reminder`)).status()).toBeLessThan(300);
  expect(await hanging(page, id)).toBeGreaterThan(1);
}

test("two cards: pick one from the catalog, type one, refuse a $0 limit, then remove both", async ({ page, browser }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("remove-card"), async () => {});
  expect((await page.request.put("/api/v1/quiz", { data: { answers: ESTABLISHED } })).status()).toBeLessThan(300);

  // Before: the quiz offers Discover it Student Cash Back.
  await page.goto("/results");
  await expect(page.getByRole("heading", { name: "Discover it Student Cash Back" }).first()).toBeVisible();

  // 1. Pick it from the catalog as it is typed.
  await page.goto("/home/add-card");
  await page.getByLabel("Card name").fill("discover cash");
  const matches = page.getByRole("list", { name: "Cards that match" });
  await expect(matches).toBeVisible();
  await checkA11y("add card: catalog matches");
  await test.info().attach("add-card-matches", { body: await page.screenshot(), contentType: "image/png" });
  await matches.getByRole("button", { name: "Discover it Student Cash Back" }).click();
  await expect(page.getByLabel("Card name")).toHaveValue("Discover it Student Cash Back");
  await expect(matches).toBeHidden();
  await page.getByLabel("Credit limit (optional)").fill("0");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter the limit in dollars" })).toBeVisible();
  await page.getByLabel("Credit limit (optional)").fill("1,000");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);

  // 2. One that is not in the catalog, by hand.
  await page.goto("/home/add-card");
  await page.getByLabel("Card name").fill("Campus Credit Union Visa");
  await expect(page.getByRole("list", { name: "Cards that match" })).toBeHidden();
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.reload();

  const two = await cards(page);
  expect(two).toHaveLength(2);
  const discover = two.find((card) => card.cardId === DISCOVER);
  const campus = two.find((card) => card.cardName === "Campus Credit Union Visa");
  expect(discover).toMatchObject({ cardName: "Discover it Student Cash Back", status: "approved", creditLimitCents: 100_000 });
  expect(campus).toMatchObject({ cardId: null, creditLimitCents: null });
  if (!discover || !campus) throw new Error("expected both cards");

  // 3. The API keeps the form's rule: no $0 limit, either way in.
  const zero = await page.request.patch(`/api/v1/applications/${discover.id}`, { data: { creditLimitCents: 0 } });
  expect(zero.status()).toBe(400);
  const zeroPost = await page.request.post("/api/v1/applications", {
    data: { cardId: null, cardName: "Zero Card", status: "approved", creditLimitCents: 0 },
  });
  expect(zeroPost.status()).toBe(400);
  expect((await cards(page)).find((card) => card.id === discover.id)?.creditLimitCents).toBe(100_000);

  // 4. The quiz no longer offers the card they have; its page says they have it.
  await page.goto("/results");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Discover it Student Cash Back" })).toHaveCount(0);
  await page.goto(`/cards/${DISCOVER}`);
  await expect(page.getByRole("region", { name: "Your status" })).toHaveText("Approved");
  await expect(page.getByRole("button", { name: /^Apply at/ })).toHaveCount(0);

  await setUp(page, discover.id);
  await setUp(page, campus.id);

  // 5. Remove the catalog card from its own page.
  await page.reload();
  await page.getByRole("button", { name: "Remove this card" }).click();
  const sheet = page.getByRole("dialog", { name: "Remove this card?" });
  await expect(sheet).toContainText("with its reminders and setup steps");
  await checkA11y("remove card: confirmation");
  await test.info().attach("remove-card-sheet", { body: await page.screenshot(), contentType: "image/png" });
  // Keep it changes nothing.
  await sheet.getByRole("button", { name: "Keep it" }).click();
  await expect(sheet).toBeHidden();
  expect(await cards(page)).toHaveLength(2);
  await page.getByRole("button", { name: "Remove this card" }).click();
  await sheet.getByRole("button", { name: "Remove card" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.reload();
  expect((await cards(page)).map((card) => card.id)).toEqual([campus.id]);
  expect(await hanging(page, discover.id)).toBe(0);
  expect(await hanging(page, campus.id)).toBeGreaterThan(1);
  await expect(page.getByText("Discover it Student Cash Back")).toHaveCount(0);
  // Its page is a plain card page again, and it can be added once more.
  await page.goto(`/cards/${DISCOVER}`);
  await expect(page.getByRole("region", { name: "Your status" })).toHaveCount(0);

  // 6. Someone else's card answers as a missing one; a card applied for
  // through Cense is kept.
  const other = await browser.newContext();
  await blockExternalRequests(other);
  const otherPage = await other.newPage();
  await signUp(otherPage, uniqueEmail("remove-card-other"), async () => {});
  const foreign = await otherPage.request.delete(`/api/v1/applications/${campus.id}`);
  expect(foreign.status()).toBe(404);
  const missing = await otherPage.request.delete("/api/v1/applications/00000000-0000-4000-8000-000000000000");
  expect(await foreign.json()).toEqual(await missing.json());
  const applied = await otherPage.request.post("/api/v1/applications", {
    data: { cardId: "chase-freedom-rise", cardName: "Chase Freedom Rise", status: "applied", creditLimitCents: null },
  });
  expect(applied.status()).toBe(201);
  const kept = await otherPage.request.delete(`/api/v1/applications/${(await applied.json()).id}`);
  expect(kept.status()).toBe(409);
  expect((await kept.json()).error.code).toBe("not_removable");
  await other.close();
  expect((await cards(page)).map((card) => card.id)).toEqual([campus.id]);

  // 7. The hand-typed card has no catalog page: it is removed from its setup list.
  await page.goto(`/applications/${campus.id}/setup`);
  await page.getByRole("button", { name: "Remove this card" }).click();
  await page.getByRole("dialog", { name: "Remove this card?" }).getByRole("button", { name: "Remove card" }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(await cards(page)).toHaveLength(0);
  expect(await hanging(page, campus.id)).toBe(0);
  // Back returns to a card that is gone: the not-found page, never a stale card.
  await page.goto(`/applications/${campus.id}/setup`);
  await expect(page.getByText("Remove this card")).toHaveCount(0);
});
