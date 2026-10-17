import { describe, expect, it } from "vitest";

import { listCards } from "../cards/catalog";
import { computeResult } from "../results/compute";
import { homeState, type Application } from "./state";

const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true };
const cards = listCards();

function app(id: string, status: Application["status"], statusUpdatedAt: string): Application {
  return {
    id: `00000000-0000-4000-8000-00000000000${id}`,
    cardId: null,
    cardName: `Card ${id}`,
    status,
    creditLimitCents: null,
    appliedAt: null,
    statusUpdatedAt,
  };
}

describe("homeState", () => {
  it("asks for the quiz when nothing is saved, and says when some answers are", () => {
    expect(homeState([], computeResult(undefined, cards), false)).toEqual({ kind: "no_quiz", started: false });
    expect(homeState([], computeResult({ under21: true }, cards), true)).toEqual({ kind: "no_quiz", started: true });
  });

  it("shows the match when the quiz is done and nothing is tracked", () => {
    const state = homeState([], computeResult(ALL_SIX, cards), true);
    expect(state.kind).toBe("matched");
  });

  it("shows no card with the rules' reason when none fits", () => {
    const state = homeState([], computeResult({ ...ALL_SIX, incomeBand: "none" }, cards), true);
    expect(state.kind).toBe("no_card");
    if (state.kind === "no_card") expect(state.reason).toContain("under 21");
  });

  it("puts tracked cards ahead of the quiz, newest change first", () => {
    const older = app("1", "approved", "2026-10-01T00:00:00Z");
    const newer = app("2", "rejected", "2026-10-10T00:00:00Z");
    const state = homeState([older, newer], computeResult(ALL_SIX, cards), true);
    expect(state).toEqual({ kind: "tracking", primary: newer, others: [older] });
  });

  it("treats a card the student already had like any approved card", () => {
    const added = { ...app("3", "approved", "2026-10-05T00:00:00Z"), creditLimitCents: 50000 };
    const state = homeState([added], computeResult(undefined, cards), false);
    expect(state).toEqual({ kind: "tracking", primary: added, others: [] });
  });
});
