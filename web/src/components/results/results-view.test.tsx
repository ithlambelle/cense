// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SENSITIVE } from "@/lib/analytics";
import { listCards } from "@/lib/cards/catalog";
import {
  APPROVAL_LINES,
  cardDisplayName,
  ESTIMATE_DISCLAIMER,
  NOT_YET_NEXT_STEPS,
  RESULT_DISCLAIMER,
  RESULT_HEADLINES,
  TIER_LABELS,
  WHY_TITLE,
} from "@/lib/copy/results";
import { QUIZ_STEP_COUNT } from "@/lib/quiz/spending";
import { computeResult, type RewardsLookup } from "@/lib/results/compute";
import { GROCERY_CHROME } from "@/lib/results/rewards.fixtures";
import { cardPath, ROUTES } from "@/lib/routes";

import { ResultsView } from "./results-view";

vi.mock("next/navigation", () => ({ usePathname: () => "/results" }));
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  track,
}));

const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
const SPENDING = { spendingCategories: ["groceries"], spendingBand: "200_to_500" };
// Why a students-only card for no credit history fits ALL_SIX (rules v1.3).
const NO_HISTORY_STUDENT_CARD = "Made for students starting with no credit history, like you.";

function match(answers: unknown, rewardsFor?: RewardsLookup) {
  const view = computeResult(answers, listCards(), rewardsFor);
  if (view.kind !== "match") throw new Error("expected a match");
  return view;
}

describe("ResultsView", () => {
  it("sends an unfinished quiz back to the quiz, counting what is left as Home does", () => {
    const { unmount } = render(<ResultsView view={{ kind: "quiz_unfinished" }} />);
    expect(screen.getByRole("link", { name: "Start the quiz" }).getAttribute("href")).toBe("/quiz?from=results");
    expect(screen.getByText(`Answer ${QUIZ_STEP_COUNT} questions to see one`)).toBeTruthy();
    unmount();
    render(<ResultsView view={{ kind: "quiz_unfinished" }} answered={2} />);
    expect(screen.getByRole("link", { name: "Continue the quiz" }).getAttribute("href")).toBe("/quiz?from=results");
    expect(screen.getByText(`Answer ${QUIZ_STEP_COUNT - 2} more questions to see one`)).toBeTruthy();
  });

  it("gives a next step when no card fits: an authorized user, and the quiz again once there is income", () => {
    const { unmount } = render(<ResultsView view={{ kind: "no_card", ruleId: "G1", reason: "Issuers need income of your own." }} />);
    const next = screen.getByRole("region", { name: NOT_YET_NEXT_STEPS.title });
    expect(within(next).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      NOT_YET_NEXT_STEPS.authorizedUser,
      `${NOT_YET_NEXT_STEPS.ownIncome}${NOT_YET_NEXT_STEPS.ownIncomeLink}.`,
    ]);
    // The advice leads somewhere: the quiz.
    expect(within(next).getByRole("link", { name: NOT_YET_NEXT_STEPS.ownIncomeLink }).getAttribute("href")).toBe("/quiz?from=results");
    unmount();
    // No income reason: more income is not the answer, so only the first.
    render(<ResultsView view={{ kind: "no_card", ruleId: null, reason: null }} />);
    expect(within(screen.getByRole("region", { name: NOT_YET_NEXT_STEPS.title })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("goes back Home, never into the finished quiz", () => {
    render(<ResultsView view={{ kind: "no_card", ruleId: null, reason: null }} />);
    const back = screen.getByRole("link", { name: "Back to Home" });
    expect(back.getAttribute("href")).toBe(ROUTES.home);
    // G6: the arrow alone on screen; the destination is for screen readers only.
    expect(back.textContent).toBe("");
    expect(screen.queryByRole("link", { name: "Back to the questions" })).toBeNull();
  });

  it("shows the deposit only for a secured card that asks for one", () => {
    const view = match(ALL_SIX);
    const [top, ...rest] = view.options;
    const { unmount } = render(<ResultsView view={{ ...view, options: [{ ...top, card: { ...top.card, secured: false } }, ...rest] }} />);
    expect(screen.queryByText("Deposit")).toBeNull();
    unmount();
    render(<ResultsView view={{ ...view, options: [{ ...top, card: { ...top.card, secured: true, depositMinCents: 4900 } }, ...rest] }} />);
    expect(screen.getByText("From $49")).toBeTruthy();
  });

  it("shows the gate's reason, or a fallback, when no card fits", () => {
    const { unmount } = render(<ResultsView view={{ kind: "no_card", ruleId: "G2", reason: "Issuers need income." }} />);
    expect(screen.getByText("Issuers need income.")).toBeTruthy();
    expect(screen.getByText(RESULT_DISCLAIMER)).toBeTruthy();
    unmount();
    render(<ResultsView view={{ kind: "no_card", ruleId: null, reason: null }} />);
    expect(screen.getByText("None of the cards we list fits what you told us yet.")).toBeTruthy();
  });

  it("shows three cards, top match first, each one link to its card page", () => {
    const view = match(ALL_SIX);
    expect(view.options).toHaveLength(3);
    render(<ResultsView view={view} />);
    const [top, ...others] = view.options;
    expect(screen.getByRole("heading", { level: 1, name: RESULT_HEADLINES[top.fit.tier] })).toBeTruthy();
    const topMatch = within(screen.getByRole("region", { name: "Top match" }));
    expect(topMatch.getByRole("heading", { level: 3, name: cardDisplayName(top.card) })).toBeTruthy();
    expect(topMatch.getByText(TIER_LABELS[top.fit.tier])).toBeTruthy();
    const other = within(screen.getByRole("region", { name: "Other options" }));
    expect(other.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(
      others.map((option) => cardDisplayName(option.card)),
    );
    for (const option of view.options) {
      expect(screen.getByRole("link", { name: `View card: ${cardDisplayName(option.card)}` }).getAttribute("href")).toBe(
        cardPath(option.card.id, "results"),
      );
    }
    expect(screen.getByRole("link", { name: "Retake quiz" }).getAttribute("href")).toBe("/quiz?from=results");
    expect(screen.getByText(RESULT_DISCLAIMER)).toBeTruthy();
  });

  it("says why each card is right for the student in large lines: approval, value from their spending, bonus", () => {
    const view = match({ ...ALL_SIX, ...SPENDING }, GROCERY_CHROME);
    render(<ResultsView view={view} />);
    const top = within(screen.getByRole("region", { name: "Top match" }));
    expect(top.getByRole("heading", { name: WHY_TITLE })).toBeTruthy();
    const lines = top.getAllByRole("listitem").map((item) => item.textContent);
    // Under the approval line, why this card fits this student (rules v1.3).
    expect(lines).toEqual([
      `${APPROVAL_LINES.likely_fit}${NO_HISTORY_STUDENT_CARD}`,
      "About $143 in your first yearFrom your groceries",
      "$200 sign-up bonus after $1,000 in 90 days",
    ]);
    // The amount in the number font, the line itself in large text.
    expect(top.getByText("$143").className).toContain("font-number");
    expect(top.getByText("$143").parentElement?.className).toContain("text-body-m");
    expect(screen.getByText(ESTIMATE_DISCLAIMER)).toBeTruthy();
  });

  it("says why each card fits this student, not one line for every card", () => {
    const view = match(ALL_SIX);
    render(<ResultsView view={view} />);
    const details = view.options.map((option) => option.fit.reasons[0]);
    expect(details).toEqual([NO_HISTORY_STUDENT_CARD, NO_HISTORY_STUDENT_CARD, "Made for people starting with no credit history, like you."]);
    expect(details).not.toContain("You meet what the issuer says this card is for.");
    expect(screen.getAllByText(NO_HISTORY_STUDENT_CARD)).toHaveLength(2);
    expect(screen.getByText("Made for people starting with no credit history, like you.")).toBeTruthy();
  });

  it("has no value lines or estimate disclaimer when spending was skipped", () => {
    render(<ResultsView view={match(ALL_SIX, GROCERY_CHROME)} />);
    expect(screen.queryByText(/in your first year/)).toBeNull();
    expect(screen.queryByText(ESTIMATE_DISCLAIMER)).toBeNull();
  });

  it("masks every line that restates the student's answers or spending from session replay", () => {
    const { container } = render(<ResultsView view={match({ ...ALL_SIX, ...SPENDING }, GROCERY_CHROME)} />);
    const value = screen.getAllByText(/in your first year/)[0];
    expect(value.closest(`.${SENSITIVE}`)).not.toBeNull();
    expect(screen.getAllByText(APPROVAL_LINES.likely_fit)[0].closest(`.${SENSITIVE}`)).not.toBeNull();
    // Why it fits restates the student's credit history answer.
    expect(screen.getAllByText(NO_HISTORY_STUDENT_CARD)[0].closest(`.${SENSITIVE}`)).not.toBeNull();
    expect(container.querySelectorAll(`ul.${SENSITIVE}`)).toHaveLength(3);
  });

  it("labels a stretch as one, in words and with its caution", () => {
    const view = match(ALL_SIX);
    const reason = "The issuer says this card is for people with a bit more credit history. It may still work.";
    const [top, second, ...rest] = view.options;
    const stretch = { ...second, fit: { ...second.fit, tier: "stretch" as const, reasons: [reason] } };
    render(<ResultsView view={{ ...view, options: [top, stretch, ...rest] }} />);
    const other = within(screen.getByRole("region", { name: "Other options" }));
    expect(other.getByText(TIER_LABELS.stretch)).toBeTruthy();
    expect(other.getByText(APPROVAL_LINES.stretch)).toBeTruthy();
    expect(other.getByText(reason)).toBeTruthy();
  });

  it("draws the green check for good news and an info mark for a caution", () => {
    const view = match(ALL_SIX);
    const checks = (container: HTMLElement) => container.querySelectorAll('img[src*="fit-check"]').length;
    const [top] = view.options;
    const likely = { ...top, fit: { ...top.fit, tier: "likely_fit" as const }, rewards: null, estimate: null };
    const { container, unmount } = render(<ResultsView view={{ ...view, options: [likely] }} />);
    expect(checks(container)).toBe(1);
    unmount();
    const stretch = { ...likely, fit: { ...likely.fit, tier: "stretch" as const, reasons: ["A caution from the rules."] } };
    const second = render(<ResultsView view={{ ...view, options: [stretch] }} />);
    expect(checks(second.container)).toBe(0);
    expect(screen.getByText("A caution from the rules.")).toBeTruthy();
  });

  it("shows the issuer's card art, or a plain card where there is none", () => {
    const view = match(ALL_SIX, GROCERY_CHROME);
    const { container } = render(<ResultsView view={view} />);
    expect(container.querySelector('img[src*="discover-it-student-cash-back"]')).not.toBeNull();
    expect(screen.getAllByTestId("card-art-fallback").length).toBe(view.options.filter((option) => !option.rewards?.image).length);
  });

  it("tracks the top match's tier and how many options were shown, never the spending", () => {
    render(<ResultsView view={match({ ...ALL_SIX, ...SPENDING }, GROCERY_CHROME)} />);
    expect(track).toHaveBeenCalledWith("recommendation_viewed", { tier: "likely_fit", card_id: "discover-it-student-chrome", option_count: 3 });
  });
});
