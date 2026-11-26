import { describe, expect, it } from "vitest";

import { listCards, type Card } from "../cards/catalog";
import { evaluateFit } from "../rules/fit-tier";
import { cardsToOffer, computeResult, RESULT_OPTIONS, type ResultView } from "./compute";
import { fixtureRate, fixtureRewards, GROCERY_CHROME, lookup } from "./rewards.fixtures";

const cards = listCards();
const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true } as const;
const GROCERIES = { spendingCategories: ["groceries"], spendingBand: "200_to_500" } as const;

function catalogCard(id: string): Card {
  const card = cards.find((entry) => entry.id === id);
  if (!card) throw new Error(`no card ${id}`);
  return card;
}

function options(view: ResultView) {
  if (view.kind !== "match") throw new Error(`expected a match, got ${view.kind}`);
  return view.options;
}

describe("computeResult", () => {
  it("asks for the quiz when nothing is saved", () => {
    expect(computeResult(undefined, cards)).toEqual({ kind: "quiz_unfinished" });
    expect(computeResult(null, cards)).toEqual({ kind: "quiz_unfinished" });
  });

  it("asks for the quiz when an answer is missing", () => {
    const five: Record<string, unknown> = { ...ALL_SIX };
    delete five.canDeposit;
    expect(computeResult(five, cards)).toEqual({ kind: "quiz_unfinished" });
    // The spending answer alone does not finish the quiz.
    expect(computeResult({ ...five, ...GROCERIES }, cards)).toEqual({ kind: "quiz_unfinished" });
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

  it("shows three cards, the rules' pick first, each with its own fit", () => {
    const shown = options(computeResult(ALL_SIX, cards));
    expect(shown).toHaveLength(RESULT_OPTIONS.max);
    const rules = evaluateFit(ALL_SIX, cards);
    if (rules.status !== "complete") throw new Error("expected complete answers");
    expect(shown[0].card.id).toBe(rules.recommendedCardId);
    for (const option of shown) {
      expect(option.fit).toEqual(rules.cards.find((fit) => fit.cardId === option.card.id));
      expect(option.fit.reasons.length).toBeGreaterThan(0);
    }
    expect(new Set(shown.map((option) => option.card.id)).size).toBe(shown.length);
    // In the rules' order.
    const order = shown.map((option) => rules.ranking.indexOf(option.card.id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("shows at most two cards from one issuer", () => {
    for (const answers of [ALL_SIX, { ...ALL_SIX, standing: "limited" }, { ...ALL_SIX, recentDenial: true }, { ...ALL_SIX, ...GROCERIES }] as const) {
      const brands = options(computeResult(answers, cards)).map((option) => option.card.brand);
      for (const brand of brands) expect(brands.filter((entry) => entry === brand).length, brand).toBeLessThanOrEqual(RESULT_OPTIONS.perIssuer);
    }
    // Three likely fits from one brand: the third gives way to another bank's card.
    const sameBrand = ["discover-it-student-cash-back", "discover-it-student-chrome", "discover-it-secured-cash-back"].map(catalogCard);
    const shown = options(computeResult(ALL_SIX, [...sameBrand, catalogCard("chase-freedom-rise")]));
    expect(shown.map((option) => option.card.brand)).toEqual(["Discover", "Discover", "Chase"]);
  });

  it("shows only likely fits when there are three, and fills with a stretch, marked, only when there are fewer", () => {
    expect(options(computeResult(ALL_SIX, cards)).map((option) => option.fit.tier)).toEqual(["likely_fit", "likely_fit", "likely_fit"]);
    // One likely fit and two cards that need more history than the student has.
    const few = ["discover-it-student-cash-back", "capital-one-savor-students", "capital-one-quicksilver-students"].map(catalogCard);
    const shown = options(computeResult(ALL_SIX, few));
    expect(shown.map((option) => option.fit.tier)).toEqual(["likely_fit", "stretch", "stretch"]);
    expect(shown[1].fit.ruleIds).toContain("C1");
  });

  it("shows fewer than three when fewer can be picked", () => {
    expect(options(computeResult(ALL_SIX, [catalogCard("discover-it-student-cash-back")]))).toHaveLength(1);
  });

  it("orders by year-one value only cards the rules cannot otherwise tell apart, when the student answered spending", () => {
    const withoutSpending = options(computeResult(ALL_SIX, cards, GROCERY_CHROME));
    expect(withoutSpending[0].card.id).toBe("discover-it-student-cash-back");
    expect(withoutSpending[0].estimate).toBeNull();
    const shown = options(computeResult({ ...ALL_SIX, ...GROCERIES }, cards, GROCERY_CHROME));
    expect(shown[0].card.id).toBe("discover-it-student-chrome");
    // $2,520 of groceries at 5%, $1,680 at 1%, and the $200 bonus within reach.
    expect(shown[0].estimate).toMatchObject({ rewardsCents: 12_600 + 1_680, rankingCents: 14_280 + 20_000, drivers: ["groceries"] });
    expect(shown[0].rewards?.bonus?.valueCents).toBe(20_000);
    // Never a stretch above a likely fit, whatever it would earn.
    expect(shown.map((option) => option.fit.tier)).toEqual(["likely_fit", "likely_fit", "likely_fit"]);
  });

  it("never lets value move a card past an earlier rule (rules v1.3: value is the last tie-breaker)", () => {
    // Chase Freedom Rise is not students-only, so it stays behind both Discover
    // student cards for a student, however much it would earn.
    const richChase = lookup({ "chase-freedom-rise": fixtureRewards([fixtureRate(10, "all")]) });
    const shown = options(computeResult({ ...ALL_SIX, ...GROCERIES }, cards, richChase));
    expect(shown.map((option) => option.card.id)).toEqual([
      "discover-it-student-cash-back",
      "discover-it-student-chrome",
      "chase-freedom-rise",
    ]);
  });

  it("gives a card with no rewards data no estimate", () => {
    const shown = options(computeResult({ ...ALL_SIX, ...GROCERIES }, cards, () => null));
    for (const option of shown) expect(option.estimate).toBeNull();
    expect(shown[0].rewards).toBeNull();
  });
});

describe("cardsToOffer", () => {
  // Devon (persona walk, Nov 25): his own Discover it Student Cash Back was
  // listed "Likely fit" with Apply.
  const ESTABLISHED = { ...ALL_SIX, under21: false, incomeBand: "5k_to_15k", standing: "established" } as const;
  const owns = (cardId: string | null, status = "approved") => ({ cardId, status });

  it("never offers a card the student already has", () => {
    const ids = (view: ResultView) => options(view).map((option) => option.card.id);
    // Before: his own two cards fit him, and the first is the top match.
    expect(ids(computeResult(ESTABLISHED, cards))[0]).toBe("discover-it-student-cash-back");
    const mine = [owns("discover-it-student-cash-back"), owns("chase-freedom-rise")];
    const after = ids(computeResult(ESTABLISHED, cardsToOffer(cards, mine)));
    expect(after).toHaveLength(RESULT_OPTIONS.max);
    expect(after).not.toContain("discover-it-student-cash-back");
    expect(after).not.toContain("chase-freedom-rise");
    expect(after[0]).toBe("discover-it-student-chrome");
  });

  it("keeps applied and denied cards, a card with no catalog id, and the whole catalog when nothing is owned", () => {
    expect(cardsToOffer(cards, [])).toBe(cards);
    expect(cardsToOffer(cards, [owns(null)])).toBe(cards);
    expect(cardsToOffer(cards, [owns("discover-it-student-cash-back", "applied"), owns("chase-freedom-rise", "rejected")])).toBe(cards);
    const offered = cardsToOffer(cards, [owns("discover-it-student-cash-back")]);
    expect(offered).toHaveLength(cards.length - 1);
    expect(offered.map((card) => card.id)).not.toContain("discover-it-student-cash-back");
  });
});

