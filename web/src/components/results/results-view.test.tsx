// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { listCards } from "@/lib/cards/catalog";
import { RESULT_DISCLAIMER, RESULT_HEADLINES } from "@/lib/copy/results";
import { computeResult } from "@/lib/results/compute";
import { cardPath, ROUTES } from "@/lib/routes";

import { ResultsView } from "./results-view";

vi.mock("next/navigation", () => ({ usePathname: () => "/results" }));

const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };

describe("ResultsView", () => {
  it("sends an unfinished quiz back to the quiz", () => {
    render(<ResultsView view={{ kind: "quiz_unfinished" }} />);
    expect(screen.getByRole("link", { name: "Take the quiz" }).getAttribute("href")).toBe(ROUTES.quiz);
  });

  it("goes back to the questions and closes to home", () => {
    render(<ResultsView view={{ kind: "no_card", ruleId: null, reason: null }} />);
    expect(screen.getByRole("link", { name: "Back to the questions" }).getAttribute("href")).toBe(ROUTES.quiz);
    expect(screen.getByRole("link", { name: "Close" }).getAttribute("href")).toBe(ROUTES.home);
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

  it("shows the card, the rules' reasons, another option and the guidance line", () => {
    const view = computeResult(ALL_SIX, listCards());
    if (view.kind !== "match" || !view.alternative) throw new Error("expected a match with another option");
    render(<ResultsView view={view} />);

    expect(screen.getByRole("heading", { level: 1, name: RESULT_HEADLINES[view.fit.tier] })).toBeTruthy();
    expect(screen.getByRole("heading", { name: view.card.name })).toBeTruthy();
    for (const reason of view.fit.reasons) expect(screen.getByText(reason)).toBeTruthy();
    expect(screen.getByRole("link", { name: "View card" }).getAttribute("href")).toBe(cardPath(view.card.id));
    expect(screen.getByText("Another option")).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(view.alternative.name) }).getAttribute("href")).toBe(
      cardPath(view.alternative.id),
    );
    expect(screen.getByRole("link", { name: "Retake quiz" }).getAttribute("href")).toBe(ROUTES.quiz);
    expect(screen.getByText(RESULT_DISCLAIMER)).toBeTruthy();
  });
});
