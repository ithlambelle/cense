import { describe, expect, it } from "vitest";

import { cardRewards } from "../cards/rewards";
import { fixtureRate, fixtureRewards } from "../results/rewards.fixtures";
import type { YearOneEstimate } from "../results/value";
import type { CardFit } from "../rules/fit-tier";
import { APPROVAL_LINES, BONUS_OUT_OF_REACH, MATCH_LINE, whyLines } from "./results";

const LIKELY: CardFit = { cardId: "a", tier: "likely_fit", ruleIds: [], reasons: ["Made for students starting with no credit history, like you."], notes: [] };
const STRETCH: CardFit = { cardId: "a", tier: "stretch", ruleIds: ["C1"], reasons: ["The issuer says this card is for people with a bit more credit history."], notes: [] };

function estimate(extra: Partial<YearOneEstimate> = {}): YearOneEstimate {
  return { rankingCents: 0, rewardsCents: 4_763, points: null, matchCents: 0, bonus: null, drivers: [], ...extra };
}

const BONUS = { summary: "$200 after $1,000 in 90 days.", valueCents: 20_000, spendCents: 100_000, withinDays: 90 };
const MATCH = { summary: "Cashback Match: all the cash back you earn in your first year, matched.", valueCents: null, spendCents: null, withinDays: 365 };

describe("whyLines", () => {
  it("says in words whether the student is likely to be approved, with the rules' reason under it", () => {
    expect(whyLines({ fit: LIKELY, rewards: null, estimate: null })).toEqual([
      { id: "approval", mark: "check", text: APPROVAL_LINES.likely_fit, amount: null, detail: LIKELY.reasons[0] },
    ]);
    const [stretch] = whyLines({ fit: STRETCH, rewards: null, estimate: null });
    expect(stretch).toMatchObject({ mark: "info", text: APPROVAL_LINES.stretch, detail: STRETCH.reasons[0] });
  });

  it("gives the year-one value in whole dollars and the areas that drive it", () => {
    const lines = whyLines({ fit: LIKELY, rewards: fixtureRewards([fixtureRate(1, "all")]), estimate: estimate({ drivers: ["groceries", "food-and-dining"] }) });
    expect(lines[1]).toEqual({ id: "value", mark: "check", text: "About $48 in your first year", amount: "$48", detail: "From your groceries and dining" });
    const flat = whyLines({ fit: LIKELY, rewards: fixtureRewards([fixtureRate(1, "all")]), estimate: estimate() });
    expect(flat[1].detail).toBe("On everything you buy");
  });

  it("has no value line without an estimate or with nothing to earn", () => {
    expect(whyLines({ fit: LIKELY, rewards: fixtureRewards([]), estimate: null }).map((line) => line.id)).toEqual(["approval"]);
    expect(whyLines({ fit: LIKELY, rewards: fixtureRewards([]), estimate: estimate({ rewardsCents: 0 }) }).map((line) => line.id)).toEqual(["approval"]);
  });

  it("shows points when the issuer gives them no dollar value", () => {
    const lines = whyLines({ fit: LIKELY, rewards: null, estimate: estimate({ rewardsCents: null, points: 9_240 }) });
    expect(lines[1]).toMatchObject({ text: "About 9,240 points in your first year", amount: "9,240 points" });
  });

  it("folds a Cashback Match into the value line, and says it on its own without an estimate", () => {
    const rewards = fixtureRewards([fixtureRate(1, "all")], { bonus: MATCH });
    const withEstimate = whyLines({ fit: LIKELY, rewards, estimate: estimate({ rewardsCents: 4_200, matchCents: 4_200 }) });
    expect(withEstimate.map((line) => line.id)).toEqual(["approval", "value"]);
    expect(withEstimate[1]).toMatchObject({ text: "About $84 in your first year", detail: "On everything you buy, with Cashback Match" });
    expect(whyLines({ fit: LIKELY, rewards, estimate: null })[1]).toMatchObject({ id: "bonus", text: MATCH_LINE });
  });

  it("states a bonus with its target, and says when it is likely out of reach", () => {
    const rewards = fixtureRewards([fixtureRate(1, "all")], { bonus: BONUS });
    expect(whyLines({ fit: LIKELY, rewards, estimate: null })[1]).toEqual({
      id: "bonus",
      mark: "check",
      text: "$200 sign-up bonus after $1,000 in 90 days",
      amount: "$200",
      detail: null,
    });
    const out = whyLines({ fit: LIKELY, rewards, estimate: estimate({ bonus: { cents: 20_000, spendCents: 100_000, withinDays: 90, reachable: false } }) });
    expect(out[2]).toMatchObject({ mark: "info", text: "$200 sign-up bonus after $1,000 in 90 days", detail: BONUS_OUT_OF_REACH });
  });

  it("keeps a bonus with no spend target short, with the issuer's words as the detail", () => {
    const autopay = { summary: "$25 statement credit when you sign up for automatic payments.", valueCents: 2_500, spendCents: null, withinDays: 90 };
    const [, bonus] = whyLines({ fit: LIKELY, rewards: fixtureRewards([], { bonus: autopay }), estimate: null });
    expect(bonus).toMatchObject({ text: "$25 sign-up bonus", detail: autopay.summary });
  });

  it("uses the issuer's short form when the card has one (Chase's autopay credit)", () => {
    const rise = cardRewards("chase-freedom-rise")?.bonus;
    expect(rise?.resultLine).toBeDefined();
    const [, bonus] = whyLines({ fit: LIKELY, rewards: fixtureRewards([], { bonus: rise ?? null }), estimate: null });
    expect(bonus).toMatchObject({ text: "$25 for enrolling in automatic payments", amount: "$25", detail: "Sign up in your first 3 months and stay enrolled 90 days." });
  });

  it("is never more than three lines, and never uses an em dash or a tilde", () => {
    const rewards = fixtureRewards([fixtureRate(1, "all")], { bonus: BONUS });
    const lines = whyLines({ fit: STRETCH, rewards, estimate: estimate({ drivers: ["gas-and-rides"] }) });
    expect(lines).toHaveLength(3);
    expect(JSON.stringify(lines)).not.toMatch(/[—~]/);
  });
});
