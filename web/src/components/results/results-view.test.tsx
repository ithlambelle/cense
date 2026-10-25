// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { listCards } from "@/lib/cards/catalog";
import { NOT_YET_NEXT_STEPS, RESULT_DISCLAIMER, RESULT_HEADLINES, TIER_LABELS } from "@/lib/copy/results";
import { QUIZ_STEP_COUNT } from "@/lib/quiz/spending";
import { computeResult } from "@/lib/results/compute";
import { cardPath, ROUTES } from "@/lib/routes";

import { ResultsView } from "./results-view";

vi.mock("next/navigation", () => ({ usePathname: () => "/results" }));

const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };

describe("ResultsView", () => {
  it("sends an unfinished quiz back to the quiz, counting its questions as the quiz does", () => {
    render(<ResultsView view={{ kind: "quiz_unfinished" }} />);
    expect(screen.getByRole("link", { name: "Take the quiz" }).getAttribute("href")).toBe(ROUTES.quiz);
    expect(screen.getByText(`Answer ${QUIZ_STEP_COUNT} short questions to see one`)).toBeTruthy();
  });

  it("gives a next step when no card fits: an authorized user, and the quiz again once there is income", () => {
    const { unmount } = render(<ResultsView view={{ kind: "no_card", ruleId: "G1", reason: "Issuers need income of your own." }} />);
    const next = screen.getByRole("region", { name: NOT_YET_NEXT_STEPS.title });
    expect(within(next).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      NOT_YET_NEXT_STEPS.authorizedUser,
      NOT_YET_NEXT_STEPS.ownIncome,
    ]);
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
    const cards = listCards();
    const view = computeResult(ALL_SIX, cards);
    if (view.kind !== "match") throw new Error("expected a match");
    const { unmount } = render(<ResultsView view={{ ...view, card: { ...view.card, secured: false } }} />);
    expect(screen.queryByText("Deposit")).toBeNull();
    unmount();
    render(<ResultsView view={{ ...view, card: { ...view.card, secured: true, depositMinCents: 4900 } }} />);
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

  it("shows the card, the rules' reasons, another option and the disclaimer", () => {
    const view = computeResult(ALL_SIX, listCards());
    if (view.kind !== "match" || !view.alternative) throw new Error("expected a match with another option");
    render(<ResultsView view={view} />);

    expect(screen.getByRole("heading", { level: 1, name: RESULT_HEADLINES[view.fit.tier] })).toBeTruthy();
    expect(screen.getByRole("heading", { name: view.card.name })).toBeTruthy();
    const top = within(screen.getByRole("region", { name: "Top match" }));
    for (const reason of view.fit.reasons) expect(top.getByText(reason)).toBeTruthy();
    // The whole top card is one link, named for the card.
    expect(screen.getByRole("link", { name: `View card: ${view.card.name}` }).getAttribute("href")).toBe(
      cardPath(view.card.id, "results"),
    );
    expect(top.getByText(TIER_LABELS[view.fit.tier])).toBeTruthy();
    expect(screen.getByText("Another option")).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(view.alternative.card.name) }).getAttribute("href")).toBe(
      cardPath(view.alternative.card.id, "results"),
    );
    expect(screen.getByRole("link", { name: "Retake quiz" }).getAttribute("href")).toBe(ROUTES.quiz);
    expect(screen.getByText(RESULT_DISCLAIMER)).toBeTruthy();
  });

  it("labels another option with its own tier and first reason", () => {
    const view = computeResult(ALL_SIX, listCards());
    if (view.kind !== "match" || !view.alternative) throw new Error("expected a match with another option");
    const reason = "The issuer says this card is for people with a bit more credit history. It may still work.";
    const alternative = { ...view.alternative, fit: { ...view.alternative.fit, tier: "stretch" as const, reasons: [reason] } };
    render(<ResultsView view={{ ...view, alternative }} />);
    const option = screen.getByRole("link", { name: new RegExp(view.alternative.card.name) });
    expect(option.textContent).toContain(`Fit: ${TIER_LABELS.stretch}`);
    expect(option.textContent).toContain(reason);
  });

  it("draws the green check only beside a likely fit's reasons", () => {
    const view = computeResult(ALL_SIX, listCards());
    if (view.kind !== "match") throw new Error("expected a match");
    const checks = (container: HTMLElement) => container.querySelectorAll('img[src*="fit-check"]').length;
    const { container, unmount } = render(<ResultsView view={{ ...view, fit: { ...view.fit, tier: "likely_fit" } }} />);
    expect(checks(container)).toBe(view.fit.reasons.length);
    unmount();
    const stretch = render(
      <ResultsView view={{ ...view, fit: { ...view.fit, tier: "stretch", reasons: ["A caution from the rules."] } }} />,
    );
    expect(checks(stretch.container)).toBe(0);
    expect(screen.getByText("A caution from the rules.")).toBeTruthy();
  });
});
