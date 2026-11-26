// Created with Claude Code (2026-11-26). D10 (rank-blind links), end to end:
// what Your match shows (computeResult) and what is saved (recommendationRecord)
// must be the same with referral data stripped or randomised, for every answer
// combination, with and without spending. fit-tier.test.ts checks the rules alone.
import { describe, expect, it } from "vitest";

import { listCards } from "../cards/catalog";
import { ALL_RULE_ANSWERS, withoutReferralData, withRandomReferralData } from "../rules/fit-tier.fixtures";
import { computeResult, type ResultView } from "./compute";
import { recommendationRecord } from "./save";

const catalog = listCards();
const variants = { stripped: withoutReferralData(catalog), randomised: withRandomReferralData(catalog) };

// No spending answer (value plays no part), and two that let value break ties.
const SPENDING = [
  {},
  { spendingCategories: ["food_and_dining"], spendingBand: "200_to_500" },
  { spendingCategories: ["groceries", "travel_home"], spendingBand: "over_500" },
] as const;

// What the student sees, without the card records themselves (a variant's
// cards carry the referral data on purpose): each option's card, fit and estimate, in order.
function shown(view: ResultView) {
  if (view.kind !== "match") return view;
  return view.options.map((option) => ({ id: option.card.id, fit: option.fit, estimate: option.estimate }));
}

// The saved row, less the card data fingerprint: that hashes every card fact,
// referral fields included, so it is meant to differ.
function saved(answers: unknown, cards: Parameters<typeof recommendationRecord>[1]) {
  const record = recommendationRecord(answers, cards);
  if (!record) return null;
  const { p_card_data_version: version, ...rest } = record;
  expect(version).toMatch(/^cards-[0-9a-f]{12}$/);
  return rest;
}

describe("Your match and the saved result are blind to referral and payout data (D10)", () => {
  it("shows the same for every answer combination, with or without spending", { timeout: 120_000 }, () => {
    let compared = 0;
    for (const rules of ALL_RULE_ANSWERS) {
      for (const spending of SPENDING) {
        const answers = { ...rules, ...spending };
        const view = shown(computeResult(answers, catalog));
        for (const cards of [variants.stripped, variants.randomised]) {
          expect(shown(computeResult(answers, cards))).toEqual(view);
        }
        compared += 1;
      }
    }
    expect(compared).toBe(ALL_RULE_ANSWERS.length * SPENDING.length);
  });

  // Each record hashes the whole catalog, so each answer combination is saved
  // with one spending answer in turn rather than all three (about 10 seconds).
  it("saves the same record for every answer combination, the spending answers in turn", { timeout: 120_000 }, () => {
    ALL_RULE_ANSWERS.forEach((rules, index) => {
      const answers = { ...rules, ...SPENDING[index % SPENDING.length] };
      const record = saved(answers, catalog);
      for (const cards of [variants.stripped, variants.randomised]) {
        expect(saved(answers, cards)).toEqual(record);
      }
    });
  });
});
