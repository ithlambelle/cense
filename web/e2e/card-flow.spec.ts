// Created with Claude Code (2026-11-26). The card flow after Mikhaela's
// interview (Nov 9) and the referral disclosure (D10, D11), walked as two
// students: one with no credit who was turned down, and one who already has a
// card and was turned down. Checks every issuer link has the disclosure beside
// it, secured cards are explained with Penny's answer one tap away (and Back
// returns), the rules v1.4 pick, Home's neutral words and the denial plan's
// three options. Screenshots go to E2E_SHOTS when it is set.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { NO_REFERRAL_DISCLOSURE } from "../src/lib/copy/issuer";
import { SECURED_LINE } from "../src/lib/copy/results";
import { axeChecker, blockExternalRequests, LIKELY_FIT_PICKS, signUp, takeQuiz, uniqueEmail } from "./helpers";

const SHOTS = process.env.E2E_SHOTS;
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

// The disclosure sits in the same box as the control that leads to the issuer.
async function expectDisclosureBeside(control: Locator) {
  await expect(control).toBeVisible();
  await expect(control.locator("xpath=..").getByText(NO_REFERRAL_DISCLOSURE)).toBeVisible();
}

async function track(page: Page, card: { id: string; name: string }, status: "approved" | "rejected") {
  const res = await page.request.post("/api/v1/applications", {
    data: { cardId: card.id, cardName: card.name, status, creditLimitCents: status === "approved" ? 100_000 : null },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test("no credit, turned down: secured cards first, each explained, Penny one tap away, the disclosure by every issuer link", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("card-flow-no-credit"), async () => {});
  await expect(page.getByText("Let’s find a card that fits.")).toBeVisible();
  await expect(page.getByText(/first card/)).toHaveCount(0);
  await page.getByRole("link", { name: "Start the quiz" }).click();
  await takeQuiz(page, { ...LIKELY_FIT_PICKS, recentDenial: "Yes" }, async () => {});

  // Case 6 (rules v1.4 keeps it): no history and turned down, so a secured card first.
  const top = page.getByRole("region", { name: "Top match" });
  await expect(top.getByRole("heading", { level: 3 })).toHaveText("Capital One Platinum Secured");
  await expect(top.getByText(SECURED_LINE)).toBeVisible();
  await expectDisclosureBeside(page.getByRole("button", { name: /^Check if you’re preapproved:/ }));
  await expectDisclosureBeside(page.getByRole("button", { name: /^Apply at Capital One:/ }));
  await checkA11y("results: secured top match");
  await shot(page, "01-results-no-credit-denied");

  // The secured line's link opens Penny's checked answer; Back returns to Your match.
  await top.getByRole("link", { name: "What is a secured card?" }).click();
  await expect(page).toHaveURL(/\/learn\/penny\?answer=secured-card&from=results$/);
  await expect(page.getByText(/A secured card starts with a deposit/)).toBeVisible();
  await shot(page, "02-penny-secured-answer");
  await page.getByRole("link", { name: "Back to Your match" }).click();
  await expect(page).toHaveURL(/\/results$/);
  await page.reload();
  await expect(top.getByText(SECURED_LINE)).toBeVisible();

  // The card page: the line under the name, the disclosure by both buttons and in both sheets.
  await top.getByRole("link", { name: "Capital One Platinum Secured" }).click();
  await expect(page).toHaveURL(/\/cards\/capital-one-platinum-secured\?from=results$/);
  await expect(page.getByText(SECURED_LINE)).toBeVisible();
  await expect(page.getByRole("link", { name: "What is a secured card?" })).toHaveAttribute(
    "href",
    "/learn/penny?answer=secured-card&from=capital-one-platinum-secured",
  );
  const preapproval = page.getByRole("button", { name: /^Check if you’re preapproved:/ });
  await expectDisclosureBeside(preapproval);
  await expectDisclosureBeside(page.getByRole("button", { name: /^Apply at Capital One:/ }));
  await shot(page, "03-card-page-secured");
  await preapproval.click();
  await expectDisclosureBeside(page.getByRole("button", { name: "Go to preapproval check" }));
  await checkA11y("card page: preapproval sheet");
  await shot(page, "04-preapproval-sheet");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Apply at Capital One:/ }).click();
  await expectDisclosureBeside(page.getByRole("button", { name: "Open Capital One application" }));
  await shot(page, "05-apply-sheet");
  await page.getByRole("button", { name: "Not ready yet" }).click();

  // From the card page, Penny's Back returns to it.
  await page.getByRole("link", { name: "What is a secured card?" }).click();
  await expect(page.getByText(/A secured card starts with a deposit/)).toBeVisible();
  // Back returns to the page as it was opened (with its own origin when there is history).
  await page.getByRole("link", { name: "Back to Card details" }).click();
  await expect(page).toHaveURL(/\/cards\/capital-one-platinum-secured(\?from=results)?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Capital One Platinum Secured" })).toBeVisible();
});

test("has a card, turned down: not steered to a secured card, neutral Home words, and a plan with three options to tap", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("card-flow-has-card"), async () => {});
  // Already has a card (Add a card), and an application that was turned down.
  await track(page, { id: "discover-it-student-cash-back", name: "Discover it Student Cash Back" }, "approved");
  const denied = await track(page, { id: "capital-one-quicksilver-students", name: "Quicksilver Rewards for Students" }, "rejected");
  await page.goto("/home");
  await expect(page.getByText(/first card/)).toHaveCount(0);

  await page.goto("/quiz");
  await takeQuiz(page, { ...LIKELY_FIT_PICKS, standing: "A loan or card open less than 6 months", recentDenial: "Yes" }, async () => {});
  // Rules v1.4: a recent denial no longer puts a secured card first for a
  // student who has credit. Before, this student was shown Capital One Platinum Secured.
  const top = page.getByRole("region", { name: "Top match" });
  await expect(top.getByText("Secured credit card")).toHaveCount(0);
  await expect(top.getByRole("heading", { level: 3 })).toHaveText("Discover it Student Chrome");
  await expect(page.getByText(SECURED_LINE)).toHaveCount(0);
  await expectDisclosureBeside(page.getByRole("button", { name: /^Check if you’re preapproved:/ }));
  await expectDisclosureBeside(page.getByRole("button", { name: /^Apply at Discover:/ }));
  await checkA11y("results: has a card, denied");
  await shot(page, "06-results-has-card-denied");

  // The denial plan: three options, each a link that goes somewhere.
  await page.goto(`/denied/plan?application=${denied}`);
  await page.getByRole("button", { name: /^Build credit another way/ }).click();
  const detail = page.getByText("When you’re ready, no rush:").locator("xpath=..");
  await expect(detail.getByRole("listitem")).toHaveCount(3);
  await expect(detail.getByRole("link", { name: "See cards that fit you" })).toHaveAttribute("href", "/results");
  await expect(detail.getByRole("link", { name: /How it works, from Capital One/ })).toHaveAttribute("target", "_blank");
  await checkA11y("denial plan: build credit open");
  await shot(page, "07-plan-build-credit");
  await detail.getByRole("link", { name: "Ask Penny: What is a secured card?" }).click();
  await expect(page.getByText(/A secured card starts with a deposit/)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("five-step");
  await page.getByRole("button", { name: /^Build credit another way/ }).click();
  await detail.getByRole("link", { name: "See cards that fit you" }).click();
  await expect(page).toHaveURL(/\/results$/);
});

test("a signed-out visitor on a secured card's page sees the line, no Penny link, and the disclosure", async ({ page }) => {
  await page.goto("/cards/discover-it-secured-cash-back");
  await expect(page.getByText(SECURED_LINE)).toBeVisible();
  await expect(page.getByRole("link", { name: "What is a secured card?" })).toHaveCount(0);
  await expectDisclosureBeside(page.getByRole("button", { name: /^Apply at Discover:/ }));
  await shot(page, "08-signed-out-secured-card");
});
