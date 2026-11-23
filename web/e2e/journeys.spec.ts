// Student journeys through the real UI against the
// local stack (dev server on :3300, local Supabase, Mailpit). Each test signs
// up its own fresh student. Run with: npm run e2e
import { expect, test, type Page, type Response } from "@playwright/test";

import { QUIZ_STEP_COUNT } from "../src/lib/quiz/spending";
import {
  axeChecker,
  blockExternalRequests,
  expireAccessToken,
  GROCERIES_AND_DINING,
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
  await expect(page.getByRole("heading", { name: `${QUIZ_STEP_COUNT} questions to your first card` })).toBeVisible();
  await checkA11y("home: no quiz");
  await page.getByRole("link", { name: "Start the quiz" }).click();

  await takeQuiz(page, LIKELY_FIT_PICKS, checkA11y);
  await expect(page.getByRole("heading", { level: 1, name: "Here’s your match" })).toBeVisible();
  await checkA11y("results: likely fit");
});

test("student answers the spending question and sees three cards, each with why it is right for them", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("three-cards"), checkA11y);
  await page.getByRole("link", { name: "Start the quiz" }).click();
  await takeQuiz(page, LIKELY_FIT_PICKS, checkA11y, GROCERIES_AND_DINING);

  // The top match carries the issuer buttons (M1); each other option ends with "See details".
  const options = () => page.getByRole("region", { name: "Other options" }).getByRole("link", { name: /^See details: / });
  for (const pass of ["first visit", "after a reload"]) {
    await expect(page.getByRole("heading", { level: 1, name: "Here’s your match" }), pass).toBeVisible();
    await expect(page.getByRole("region", { name: "Top match" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Top match" }).getByRole("button", { name: /^Check if you’re preapproved: / })).toBeVisible();
    await expect(page.getByRole("region", { name: "Other options" }).getByRole("heading", { level: 3 })).toHaveCount(2);
    await expect(options()).toHaveCount(2);
    // In words, not only the signal bars, and the value from the spending answer.
    await expect(page.getByText("You’re likely to be approved").first()).toBeVisible();
    await expect(page.getByText(/^About \$\d[\d,]* in your first year$/).first()).toBeVisible();
    await expect(page.getByText("An estimate from what you told us, not a promise.")).toBeVisible();
    await checkA11y(`results: three cards, ${pass}`);
    await page.reload();
  }

  // The whole card opens its page, which shows the same estimate, and Back returns.
  const second = options().first();
  const href = await second.getAttribute("href");
  await second.click();
  await expect(page).toHaveURL(new RegExp(`${href!.replace("?", "\\?")}$`));
  // K2's fit row says it short; Rewards, one tap away, says it in full.
  await expect(page.getByText(/^\$\d[\d,]* year one, est\.$/)).toBeVisible();
  await page.getByRole("button", { name: /^Rewards/ }).click();
  // Anchored: a Discover card's Cashback Match bonus also says "in your first year".
  await expect(page.getByRole("region", { name: "Rewards" }).getByText(/^About \$\d[\d,]* in your first year$/)).toBeVisible();
  await checkA11y("cards: detail with an estimate");
  await page.getByRole("link", { name: "Back to Your match" }).click();
  await expect(page).toHaveURL(/\/results$/);

  // A retake starts from the saved picks; clearing them takes the value lines away.
  await page.getByRole("link", { name: "Retake quiz" }).click();
  await takeQuiz(page, LIKELY_FIT_PICKS, async () => {}, GROCERIES_AND_DINING);
  await expect(page.getByText(/in your first year/)).toHaveCount(0);
  await expect(options()).toHaveCount(2);
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
  await page.getByRole("button", { name: `Apply at Discover: ${DISCOVER.name}` }).click();
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

// The POST /issuer-clicks answer for one kind of click: 201 with the saved
// row's id means the click is in issuer_clicks, as from the card page.
function issuerClick(page: Page, kind: "preapproval" | "apply") {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/issuer-clicks") &&
      response.request().method() === "POST" &&
      (JSON.parse(response.request().postData() ?? "{}") as { kind?: string }).kind === kind,
  );
}

// Returns the issuer's host, to check the new tab went there.
async function expectSavedClick(response: Response): Promise<string> {
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { id: string | null; url: string };
  expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(body.url).toMatch(/^https:\/\//);
  return new URL(body.url).host;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// M1 (Figma 821:9205): the top match on Your match leads with the issuer's
// preapproval check, then Apply, each one tap to the issuer in a new tab.
test("student checks preapproval and applies straight from Your match", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("match-actions"), checkA11y);
  await page.getByRole("link", { name: "Start the quiz" }).click();
  await takeQuiz(page, LIKELY_FIT_PICKS, checkA11y);

  const top = page.getByRole("region", { name: "Top match" });
  const name = ((await top.getByRole("heading", { level: 3 }).textContent()) ?? "").trim();
  await expect(top.getByRole("button")).toHaveText([/^Check if you’re preapproved$/, /^Apply at .+$/]);
  await expect(page.getByRole("region", { name: "Other options" }).getByRole("button")).toHaveCount(0);
  // The card page's lines under its buttons, kept here for accuracy.
  await expect(top.getByText("This check won’t affect your credit score.")).toBeVisible();
  await expect(top.getByText(/Preapproval is not a guarantee of approval\.$/)).toBeVisible();
  await checkA11y("results: top match actions");

  // Preapproval: the issuer opens in a new tab, the click is saved, Your match stays put.
  const [preapprovalTab, preapproval] = await Promise.all([
    page.waitForEvent("popup"),
    issuerClick(page, "preapproval"),
    top.getByRole("button", { name: `Check if you’re preapproved: ${name}` }).click(),
  ]);
  const preapprovalHost = await expectSavedClick(preapproval);
  await expect.poll(() => new URL(preapprovalTab.url()).host).toBe(preapprovalHost);
  await preapprovalTab.close();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByRole("heading", { name: "Did you finish applying?" })).toHaveCount(0);

  // Apply, then "Did you finish applying?" here, still asked after a reload.
  const [applyTab, apply] = await Promise.all([
    page.waitForEvent("popup"),
    issuerClick(page, "apply"),
    top.getByRole("button", { name: new RegExp(`^Apply at .+: ${escapeRegExp(name)}, opens in a new tab$`) }).click(),
  ]);
  const applyHost = await expectSavedClick(apply);
  await expect(top.getByRole("heading", { name: "Did you finish applying?" })).toBeVisible();
  await expect.poll(() => new URL(applyTab.url()).host).toBe(applyHost);
  await applyTab.close();
  await checkA11y("results: did you apply");
  await page.reload();
  await expect(top.getByRole("heading", { name: "Did you finish applying?" })).toBeVisible();
  await top.getByRole("button", { name: "Yes, I finished" }).click();
  await expect(top.getByRole("status")).toContainText("Saved as applied.");

  // Tracked now: no hand-off again. See details opens the card with its status, and Back returns.
  await page.reload();
  await expect(top.getByRole("button")).toHaveCount(0);
  await top.getByRole("link", { name: `See details: ${name}` }).click();
  await expect(page).toHaveURL(/\/cards\/[^/?]+\?from=results$/);
  await expect(page.getByRole("region", { name: "Your status" }).getByText("APPLIED", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to Your match" }).click();
  await expect(page).toHaveURL(/\/results$/);
});

// Ben on the M1 change card: a card with no preapproval check, like Chime,
// shows Apply alone, as the primary button.
test("a top match with no preapproval check offers Apply alone", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("match-apply-only"), async () => {});
  await page.getByRole("link", { name: "Start the quiz" }).click();
  await takeQuiz(page, { ...LIKELY_FIT_PICKS, recentDenial: "Yes", canDeposit: "No" }, async () => {});

  const top = page.getByRole("region", { name: "Top match" });
  await expect(top.getByRole("heading", { level: 3, name: "Chime Card" })).toBeVisible();
  await expect(top.getByRole("button")).toHaveText([/^Apply at Chime$/]);
  await expect(top.getByText("This check won’t affect your credit score.")).toHaveCount(0);
  await expect(top.getByText(/Preapproval is not a guarantee of approval\.$/)).toBeVisible();
  await checkA11y("results: apply only");
  const [applyTab, apply] = await Promise.all([
    page.waitForEvent("popup"),
    issuerClick(page, "apply"),
    top.getByRole("button", { name: "Apply at Chime: Chime Card" }).click(),
  ]);
  const chimeHost = await expectSavedClick(apply);
  await expect.poll(() => new URL(applyTab.url()).host).toBe(chimeHost);
  await applyTab.close();
  // Not yet brings the button back.
  await top.getByRole("button", { name: "Not yet" }).click();
  await expect(top.getByRole("button", { name: "Apply at Chime: Chime Card" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: `${QUIZ_STEP_COUNT} questions to your first card` })).toBeVisible();
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
