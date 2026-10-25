// Four things a student reading the screens could not make sense of (the QA
// suite's student-comprehension pass on main, Oct 25): Home promised one
// number of questions and the quiz counted another; Your account told a new
// student to take the quiz or add a card and offered neither; a result with no
// card gave no next step; and a secured card's page never said what the
// deposit is.
import { expect, test, type Page } from "@playwright/test";

import { QUESTIONS } from "../src/lib/quiz/questions";
import { blockExternalRequests, LIKELY_FIT_PICKS, signUp, uniqueEmail } from "./helpers";

test.beforeEach(async ({ context }) => {
  await blockExternalRequests(context);
});

// The number in Home's "N questions to your first card".
async function homeCount(page: Page): Promise<number> {
  const heading = page.getByRole("heading", { name: /^\d+ questions to your first card$/ });
  await expect(heading).toBeVisible();
  return Number((await heading.textContent())!.split(" ")[0]);
}

// The quiz's own count, "Question i of N".
async function quizCount(page: Page): Promise<{ at: number; of: number }> {
  const line = page.getByText(/^Question \d+ of \d+$/);
  await expect(line).toBeVisible();
  const [, at, of] = /^Question (\d+) of (\d+)$/.exec((await line.textContent())!.trim())!;
  return { at: Number(at), of: Number(of) };
}

test("Home's number of questions is the quiz's, from the start and when picking it back up", async ({ page }) => {
  await signUp(page, uniqueEmail("count"), async () => {});
  const promised = await homeCount(page);
  // One star per question on the card, too.
  await expect(page.getByRole("region", { name: `${promised} questions to your first card` }).locator("ol li")).toHaveCount(promised);
  await page.getByRole("link", { name: "Start the quiz" }).click();
  expect(await quizCount(page)).toEqual({ at: 1, of: promised });

  // Two answers, then Home and back: the same total, two further on.
  for (const question of QUESTIONS.slice(0, 2)) {
    await page.getByRole("group", { name: question.title }).getByRole("button", { name: LIKELY_FIT_PICKS[question.field]!, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: question.title })).toBeHidden();
  }
  await page.goto("/home");
  expect(await homeCount(page)).toBe(promised);
  await page.getByRole("link", { name: "Continue the quiz" }).click();
  expect(await quizCount(page)).toEqual({ at: 3, of: promised });
});
