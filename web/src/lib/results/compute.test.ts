import { describe, expect, it } from "vitest";

import { listCards } from "../cards/catalog";
import { evaluateFit } from "../rules/fit-tier";
import { computeResult } from "./compute";

const cards = listCards();
const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true } as const;

describe("computeResult", () => {
  it("asks for the quiz when nothing is saved", () => {
    expect(computeResult(undefined, cards)).toEqual({ kind: "quiz_unfinished" });
    expect(computeResult(null, cards)).toEqual({ kind: "quiz_unfinished" });
  });

  it("asks for the quiz when an answer is missing", () => {
    const five: Record<string, unknown> = { ...ALL_SIX };
    delete five.canDeposit;
    expect(computeResult(five, cards)).toEqual({ kind: "quiz_unfinished" });
  });

  it("asks for the quiz when the saved answers do not match the schema", () => {
    expect(computeResult({ incomeBand: "lots" }, cards)).toEqual({ kind: "quiz_unfinished" });
  });

  it("shows no card with the income gate's reason when there is no income or savings", () => {
    const view = computeResult({ ...ALL_SIX, incomeBand: "none" }, cards);
    expect(view.kind).toBe("no_card");
    if (view.kind !== "no_card") return;
    expect(view.ruleId).toBe("G1");
    expect(view.reason).toContain("under 21");
  });

  it("shows the rules' pick and a different card as another option", () => {
    const view = computeResult(ALL_SIX, cards);
    expect(view.kind).toBe("match");
    if (view.kind !== "match") return;

    const rules = evaluateFit(ALL_SIX, cards);
    expect(rules.status).toBe("complete");
    if (rules.status !== "complete") return;
    expect(view.card.id).toBe(rules.recommendedCardId);
    expect(view.fit.cardId).toBe(view.card.id);
    expect(view.fit.reasons.length).toBeGreaterThan(0);
    expect(view.alternative).not.toBeNull();
    expect(view.alternative?.id).not.toBe(view.card.id);
  });

  it("leaves out another option when only one card is listed", () => {
    const top = computeResult(ALL_SIX, cards);
    if (top.kind !== "match") throw new Error("expected a match");
    const view = computeResult(ALL_SIX, [top.card]);
    expect(view.kind).toBe("match");
    if (view.kind === "match") expect(view.alternative).toBeNull();
  });
});
