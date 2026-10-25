// Student journeys through the real UI against the
// local stack (dev server on :3300, local Supabase, Mailpit). Each test signs
// up its own fresh student. Run with: npm run e2e
import { expect, test } from "@playwright/test";

import {
  axeChecker,
  blockExternalRequests,
  expireAccessToken,
  LIKELY_FIT_PICKS,
  sessionExpiresAt,
  signUp,
  takeQuiz,
  uniqueEmail,
} from "./helpers";

const DISCOVER = { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" };

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

test("new student signs up, takes the quiz and gets a match", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("match"), checkA11y);

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "6 questions to your first card" })).toBeVisible();
  await checkA11y("home: no quiz");
  await page.getByRole("link", { name: "Start the quiz" }).click();

  await takeQuiz(page, LIKELY_FIT_PICKS, checkA11y);
  await expect(page.getByRole("heading", { level: 1, name: "Here’s your match" })).toBeVisible();
  await checkA11y("results: likely fit");
});

test("student with no income gets the not-yet result", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("no-card"), checkA11y);
  await page.getByRole("link", { name: "Start the quiz" }).click();

  await takeQuiz(page, { ...LIKELY_FIT_PICKS, incomeBand: "None" }, checkA11y);
  await expect(page.getByRole("heading", { level: 1, name: "Not quite yet" })).toBeVisible();
  await checkA11y("results: not yet");
});

test("student browses cards, checks preapproval, applies and sees APPLIED on Home", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("apply"), checkA11y);

  await page.goto("/cards");
  await expect(page.getByRole("heading", { level: 1, name: "Cards" })).toBeVisible();
  await checkA11y("cards: list");
  await page.getByRole("link", { name: new RegExp(DISCOVER.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/${DISCOVER.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: DISCOVER.name })).toBeVisible();
  await checkA11y("cards: detail");

  // Preapproval hand-off: the sheet explains, the confirm opens the issuer in a
  // new tab (its request is aborted), and the card page stays put.
  await page.getByRole("button", { name: `Check if you’re preapproved: ${DISCOVER.name}` }).click();
  const preapprovalSheet = page.getByRole("dialog", { name: "Check first, then decide" });
  await expect(preapprovalSheet).toBeVisible();
  await checkA11y("cards: preapproval sheet");
  const [preapprovalTab] = await Promise.all([
    page.waitForEvent("popup"),
    preapprovalSheet.getByRole("button", { name: "Go to preapproval check" }).click(),
  ]);
  // Close the tab only once the app has pointed it at the issuer; closing it
  // earlier is the app's "new tab didn't open" path.
  await expect(preapprovalSheet).toBeHidden();
  await expect(page.getByRole("link", { name: /The new tab didn’t open/ })).toHaveCount(0);
  await expect.poll(() => preapprovalTab.url()).toMatch(/^https:\/\/[^/]*discover\.com\//);
  await preapprovalTab.close();

  // Apply hand-off, then "Did you finish applying?" on return.
  await page.getByRole("button", { name: `Apply on Discover’s site: ${DISCOVER.name}` }).click();
  const applySheet = page.getByRole("dialog", { name: "Apply on the issuer’s site" });
  await expect(applySheet).toBeVisible();
  await checkA11y("cards: apply sheet");
  const [applyTab] = await Promise.all([
    page.waitForEvent("popup"),
    applySheet.getByRole("button", { name: "Open Discover application" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Did you finish applying?" })).toBeVisible();
  await expect.poll(() => applyTab.url()).toMatch(/^https:\/\/[^/]*discover\.com\//);
  await applyTab.close();
  await checkA11y("cards: did you apply");
  await page.getByRole("button", { name: "Yes, I finished" }).click();
  await expect(page.getByRole("status")).toContainText("Saved as applied.");
  await checkA11y("cards: saved as applied");
  await page.getByRole("link", { name: "Go to Home" }).click();

  await expect(page).toHaveURL(/\/home$/);
  const tracked = page.getByRole("region", { name: DISCOVER.name });
  await expect(tracked).toBeVisible();
  await expect(tracked.getByText("APPLIED", { exact: true })).toBeVisible();
  await checkA11y("home: applied");
});

test("student marks an applied card as denied and reaches the five-step plan", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("denied"), checkA11y);

  // Track an applied card through the app's API with the signed-in cookies.
  const created = await page.request.post("/api/v1/applications", {
    data: { cardId: DISCOVER.id, cardName: DISCOVER.name, status: "applied", creditLimitCents: null },
  });
  expect(created.status(), await created.text()).toBe(201);

  await page.goto("/home");
  await expect(page.getByRole("region", { name: DISCOVER.name }).getByText("APPLIED", { exact: true })).toBeVisible();
  await checkA11y("home: applied");
  await page.getByRole("link", { name: "Update my status" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "What did the issuer decide?" })).toBeVisible();
  await checkA11y("application: mark result");
  await page.getByRole("group", { name: "What the issuer decided" }).getByRole("button", { name: "I was denied" }).click();
  await expect(page.getByText(`Mark ${DISCOVER.name} as denied?`)).toBeVisible();
  await checkA11y("application: confirm denied");
  await page.getByRole("button", { name: "Yes, mark as denied" }).click();

  await expect(page).toHaveURL(/\/denied\?application=/);
  await expect(page.getByRole("heading", { level: 1, name: "Denial options" })).toBeVisible();
  await checkA11y("denied: options");
  await page.getByRole("button", { name: "Yes, I know the reason" }).click();
  await page.getByRole("button", { name: "Not enough credit history" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // The reason is saved, so the plan's note reads it back.
  await expect(page).toHaveURL(/\/denied\/plan\?application=/);
  await expect(page.getByRole("heading", { level: 1, name: "A steady five-step plan" })).toBeVisible();
  await expect(page.getByText("Reason: no credit history yet")).toBeVisible();
  await expect(page.getByRole("main").getByRole("list").first().getByRole("listitem")).toHaveCount(5);
  await checkA11y("denied: five-step plan");
});

// Regression: a session whose access token has expired must be refreshed by
// the session proxy, not treated as signed out or shown an error screen.
test("student whose access token has expired still loads Home and Cards", async ({ page, context }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("expired"), checkA11y);
  await expect(page).toHaveURL(/\/home$/);

  await expireAccessToken(context);
  expect(await sessionExpiresAt(context)).toBeLessThan(Date.now() / 1000);

  await page.goto("/home");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "6 questions to your first card" })).toBeVisible();
  await checkA11y("home: after refresh");
  // The proxy wrote a fresh session.
  expect(await sessionExpiresAt(context)).toBeGreaterThan(Date.now() / 1000);

  await expireAccessToken(context);
  await page.goto("/cards");
  await expect(page.getByRole("heading", { level: 1, name: "Cards" })).toBeVisible();
  // Only a signed-in visitor gets the bottom bar on the card list.
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await checkA11y("cards: after refresh");
  expect(await sessionExpiresAt(context)).toBeGreaterThan(Date.now() / 1000);
});
