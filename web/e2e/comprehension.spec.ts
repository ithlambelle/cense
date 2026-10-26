// Four things a student reading the screens could not make sense of (the QA
// suite's student-comprehension pass on main, Oct 25): Home promised one
// number of questions and the quiz counted another, and after a few answers
// still promised them all; Your account told a new
// student to take the quiz or add a card and offered neither; a result with no
// card gave no next step; and a secured card's page never said what the
// deposit is.
import { expect, test, type Page } from "@playwright/test";

import { QUESTIONS } from "../src/lib/quiz/questions";
import { axeChecker, blockExternalRequests, LIKELY_FIT_PICKS, signUp, takeQuiz, uniqueEmail } from "./helpers";

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

// Home's quiz card: how many questions it says are left, and how many stars
// are lit. "N questions" before starting, "N more questions" once started.
async function homePrompt(page: Page): Promise<{ left: number; lit: number; stars: number }> {
  const heading = page.getByRole("heading", { name: /^\d+ (more )?questions? to your first card$/ });
  await expect(heading).toBeVisible();
  const card = page.getByRole("region", { name: (await heading.textContent())!.trim() });
  return {
    left: Number((await heading.textContent())!.split(" ")[0]),
    lit: await card.locator("ol li img").count(),
    stars: await card.locator("ol li").count(),
  };
}

// The quiz's own count, "Question i of N".
async function quizCount(page: Page): Promise<{ at: number; of: number }> {
  const line = page.getByText(/^Question \d+ of \d+$/);
  await expect(line).toBeVisible();
  const [, at, of] = /^Question (\d+) of (\d+)$/.exec((await line.textContent())!.trim())!;
  return { at: Number(at), of: Number(of) };
}

test("Home counts the questions the quiz has left, for a new student and one picking it back up", async ({ page }) => {
  await signUp(page, uniqueEmail("count"), async () => {});
  // New: all of them, one star per question, the first lit as drawn.
  const fresh = await homePrompt(page);
  await page.getByRole("link", { name: "Start the quiz" }).click();
  const start = await quizCount(page);
  expect(start.at).toBe(1);
  expect(fresh).toEqual({ left: start.of, lit: 1, stars: start.of });

  // Two answers, then Home: what is left from question 3, and two stars lit.
  for (const question of QUESTIONS.slice(0, 2)) {
    await page.getByRole("group", { name: question.title }).getByRole("button", { name: LIKELY_FIT_PICKS[question.field]!, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: question.title })).toBeHidden();
  }
  await page.goto("/home");
  const resumed = await homePrompt(page);
  await expect(page.getByRole("heading", { name: `${start.of - 2} more questions to your first card` })).toBeVisible();
  // Results, before a match, says the same as Home: what is left, and Continue.
  await page.goto("/results");
  await expect(page.getByText(`Answer ${start.of - 2} more questions to see one`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Start the quiz" })).toHaveCount(0);
  await page.getByRole("link", { name: "Continue the quiz" }).click();
  const back = await quizCount(page);
  expect(back).toEqual({ at: 3, of: start.of });
  expect(resumed).toEqual({ left: back.of - back.at + 1, lit: 2, stars: back.of });
});

test("Your account, for a student with no card, offers the quiz it mentions, and adding a card once", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("empty-account"), async () => {});
  await page.goto("/settings");
  const yourCard = page.getByRole("region", { name: "Your card" });
  await expect(yourCard.getByText("No card tracked yet.")).toBeVisible();
  await checkA11y("account: no card");
  // In Home's words.
  const quiz = yourCard.getByRole("link", { name: "Start the quiz" });
  expect((await quiz.boundingBox())!.height, "quiz link: tap target").toBeGreaterThanOrEqual(44);
  await quiz.click();
  await expect(page).toHaveURL(/\/quiz$/);
  // Adding a card is one row, not two.
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "Add a card I already have" })).toHaveCount(1);
  await page.getByRole("link", { name: "Add a card I already have" }).click();
  await expect(page).toHaveURL(/\/home\/add-card$/);
});

test("a result with no card that fits gives a next step", async ({ page }) => {
  const checkA11y = axeChecker(page);
  await signUp(page, uniqueEmail("not-yet-next"), async () => {});
  await page.getByRole("link", { name: "Start the quiz" }).click();
  await takeQuiz(page, { ...LIKELY_FIT_PICKS, incomeBand: "None" }, async () => {});
  await expect(page.getByRole("heading", { level: 1, name: "Not quite yet" })).toBeVisible();
  const next = page.getByRole("region", { name: "What you can do now" });
  await expect(next).toBeVisible();
  await expect(next.getByRole("listitem")).toHaveCount(2);
  await expect(next).toContainText("authorized user");
  await expect(next).toContainText("income or savings of your own");
  await checkA11y("results: not yet, with a next step");
  // The advice leads somewhere.
  await next.getByRole("link", { name: "take the quiz again" }).click();
  await expect(page).toHaveURL(/\/quiz$/);
});

test("a secured card's page says what the deposit is, and calls it refundable only where the issuer does", async ({ page }) => {
  // The issuer says the deposit is refundable.
  await page.goto("/cards/capital-one-platinum-secured");
  await expect(page.getByText("A refundable deposit backs the card.", { exact: false })).toBeVisible();
  await expect(page.getByText(/close the account and pay the balance in full/)).toBeVisible();
  await axeChecker(page)("card page: secured");
  // Bank of America only says it may return the deposit after a review.
  await page.goto("/cards/bofa-bankamericard-secured");
  await expect(page.getByText("A deposit backs the card.", { exact: false })).toBeVisible();
  await expect(page.getByText(/refundable/i)).toHaveCount(0);
  // In each issuer's own conditions.
  await page.goto("/cards/us-bank-altitude-go-secured");
  await expect(page.getByText("U.S. Bank returns it if it moves you to the regular card.", { exact: false })).toBeVisible();
  await page.goto("/cards/citi-secured");
  await expect(page.getByText(/in good standing/)).toBeVisible();
  // No deposit (Chime) and unsecured cards say nothing about one.
  for (const id of ["chime-card", "discover-it-student-cash-back"]) {
    await page.goto(`/cards/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/deposit backs the card/)).toHaveCount(0);
  }
});
