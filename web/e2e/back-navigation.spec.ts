// Back goes where the student came from, never to a question already
// answered (QA suite explorer students and flow map on main, Oct 25 2026).
// Each test fails on the code before its fix.
import { expect, test, type Page } from "@playwright/test";

import { blockExternalRequests, LIKELY_FIT_PICKS, signUp, takeQuiz, uniqueEmail } from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

async function track(page: Page, status: string) {
  const res = await page.request.post("/api/v1/applications", {
    data: { cardId: DISCOVER.id, cardName: DISCOVER.name, status, creditLimitCents: null },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test("after saving a reapply reminder, Back does not reopen the reminder form", async ({ page }) => {
  await signUp(page, uniqueEmail("back-reminder"), async () => {});
  const id = await track(page, "rejected");
  await page.goto(`/denied/plan?application=${id}`);
  await page.getByRole("link", { name: "Set a 6-month reminder" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose when to check in" })).toBeVisible();
  await page.getByRole("button", { name: "Save reapply reminder" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your reminder is saved" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/denied\/plan\?application=/);
  await expect(page.getByRole("heading", { level: 1, name: "Choose when to check in" })).toHaveCount(0);
});

test("after “Not yet, I’m waiting on the letter”, Back does not reopen Denial options", async ({ page }) => {
  await signUp(page, uniqueEmail("back-no-letter"), async () => {});
  const id = await track(page, "rejected");
  await page.goto("/home");
  await page.goto(`/denied?application=${id}`);
  await page.getByRole("button", { name: "Not yet, I’m waiting on the letter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "No problem" })).toBeVisible();
  // The browser's Back skips the answered question. The screen's own back
  // arrow still opens Denial options on purpose: it is how the student says
  // the letter came.
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
});

test("the quiz's Back on question 1 returns to Cards or Results, where the student came from", async ({ page }) => {
  await signUp(page, uniqueEmail("back-quiz"), async () => {});
  await page.goto("/cards");
  await page.getByRole("link", { name: "Take the quiz" }).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/cards$/);

  await page.getByRole("link", { name: "Take the quiz" }).click();
  await takeQuiz(page, LIKELY_FIT_PICKS, async () => {});
  await expect(page).toHaveURL(/\/results$/);
  await page.getByRole("link", { name: "Retake quiz" }).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/results$/);

  await page.goto("/cards");
  await page.getByRole("link", { name: "Retake quiz" }).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/cards$/);
});

test("“Still waiting” goes back to the card page or Home it came from, and “I heard back” to Mark result", async ({ page }) => {
  await signUp(page, uniqueEmail("back-waiting"), async () => {});
  const id = await track(page, "applied");

  // From the card's page.
  await page.goto(`/cards/${DISCOVER.id}`);
  await page.getByRole("link", { name: "Update status" }).click();
  await page.getByRole("button", { name: "I haven’t heard yet" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Still waiting is normal" })).toBeVisible();
  await page.getByRole("link", { name: /^Back to / }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}$`));

  // From Home.
  await page.goto("/home");
  await page.getByRole("link", { name: "Update my status" }).click();
  await page.getByRole("button", { name: "I haven’t heard yet" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Still waiting is normal" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // "I heard back" is the way to Mark result.
  await page.goto(`/applications/${id}/waiting`);
  await page.getByRole("link", { name: "I heard back" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "What did the issuer decide?" })).toBeVisible();
});
