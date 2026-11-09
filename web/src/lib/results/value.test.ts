import { describe, expect, it } from "vitest";

import {
  estimateYearOne,
  isCashbackMatch,
  spendingProfile,
  VALUE_ASSUMPTIONS,
  type EstimateRate,
  type EstimateRewards,
  type SpendingProfile,
} from "./value";

// TEST DATA ONLY, in the shape of lib/cards/rewards.ts. Not the real cards.
function rate(amount: number, earnsOn: EstimateRate["earnsOn"], extra: Partial<EstimateRate> = {}): EstimateRate {
  return {
    amount,
    unit: "percent",
    category: Array.isArray(earnsOn) ? earnsOn.join(" and ") : "All other purchases",
    earnsOn,
    pickOne: false,
    rotating: false,
    requires: null,
    yearOneAmount: null,
    cap: null,
    ...extra,
  };
}

function rewards(rates: EstimateRate[], extra: Partial<EstimateRewards> = {}): EstimateRewards {
  return { kind: "cash_back", rates, bonus: null, pointValueCents: null, ...extra };
}

const FLAT_1_5 = rewards([rate(1.5, "all")]);
// $350 a month for a year is $4,200.
const MIDDLE: SpendingProfile = { categories: [], band: "200_to_500" };
const DINING_AND_GROCERIES: SpendingProfile = { categories: ["food-and-dining", "groceries"], band: "200_to_500" };

describe("spendingProfile", () => {
  it("has no profile without a monthly band, whatever was picked", () => {
    expect(spendingProfile({})).toBeNull();
    expect(spendingProfile({ spendingCategories: ["groceries"] })).toBeNull();
  });

  it("reads the saved answer in the rewards data's names", () => {
    expect(spendingProfile({ spendingCategories: ["food_and_dining", "gas_and_rides"], spendingBand: "over_500" })).toEqual({
      categories: ["food-and-dining", "gas-and-rides"],
      band: "over_500",
    });
    expect(spendingProfile({ spendingBand: "under_200" })).toEqual({ categories: [], band: "under_200" });
  });
});

describe("estimateYearOne", () => {
  it("gives no estimate without a band or without rewards data", () => {
    expect(estimateYearOne(FLAT_1_5, null)).toBeNull();
    expect(estimateYearOne(null, MIDDLE)).toBeNull();
  });

  it("uses the middle of each band and never more than $600 a month", () => {
    expect(VALUE_ASSUMPTIONS.monthlySpendCents).toEqual({ under_200: 15_000, "200_to_500": 35_000, over_500: 60_000 });
    const yearly = (band: SpendingProfile["band"]) => estimateYearOne(FLAT_1_5, { categories: [], band })?.rewardsCents;
    // 1.5% of $1,800, $4,200 and $7,200.
    expect([yearly("under_200"), yearly("200_to_500"), yearly("over_500")]).toEqual([2_700, 6_300, 10_800]);
  });

  it("puts 60% on the picked areas, split evenly, and 40% at the base rate", () => {
    const card = rewards([rate(3, ["food-and-dining", "groceries"]), rate(1, "all")]);
    const estimate = estimateYearOne(card, DINING_AND_GROCERIES);
    // $2,520 at 3% is $75.60; $1,680 at 1% is $16.80.
    expect(estimate?.rewardsCents).toBe(9_240);
    expect(estimate?.drivers).toEqual(["food-and-dining", "groceries"]);
    // One picked area that earns no more than the base rate does not drive it.
    expect(estimateYearOne(card, { categories: ["gas-and-rides"], band: "200_to_500" })?.drivers).toEqual([]);
  });

  it("puts everything at the base rate when no area is picked", () => {
    const card = rewards([rate(3, ["groceries"]), rate(1, "all")]);
    expect(estimateYearOne(card, MIDDLE)?.rewardsCents).toBe(4_200);
    expect(estimateYearOne(card, MIDDLE)?.drivers).toEqual([]);
  });

  it("returns whole cents", () => {
    const card = rewards([rate(1.37, "all")]);
    const cents = estimateYearOne(card, { categories: [], band: "under_200" })?.rewardsCents;
    expect(Number.isInteger(cents)).toBe(true);
    expect(cents).toBe(2_466);
  });

  it("earns the base rate over a cap, converting the cap to a year", () => {
    // 2% on gas up to $100 a quarter ($400 a year); the student puts $4,320 there.
    const card = rewards([rate(2, ["gas-and-rides"], { cap: { cents: 10_000, per: "quarter", sharedWith: null } }), rate(1, "all")]);
    const estimate = estimateYearOne(card, { categories: ["gas-and-rides"], band: "over_500" });
    // $400 at 2% = $8, $3,920 at 1% = $39.20, everything else $2,880 at 1% = $28.80.
    expect(estimate?.rewardsCents).toBe(800 + 3_920 + 2_880);
    // A monthly cap is twelve of them.
    const monthly = rewards([rate(2, ["gas-and-rides"], { cap: { cents: 10_000, per: "month", sharedWith: null } }), rate(1, "all")]);
    // $1,200 at 2%, $3,120 at 1%, $2,880 at 1%.
    expect(estimateYearOne(monthly, { categories: ["gas-and-rides"], band: "over_500" })?.rewardsCents).toBe(2_400 + 3_120 + 2_880);
  });

  it("lets rates that share a cap share it", () => {
    const shared = { cents: 30_000, per: "year" as const };
    const card = rewards([
      rate(3, ["food-and-dining"], { category: "Dining", cap: { ...shared, sharedWith: "Grocery stores" } }),
      rate(2, ["groceries"], { category: "Grocery stores", cap: { ...shared, sharedWith: "Dining" } }),
      rate(1, "all"),
    ]);
    // $1,260 each on dining and groceries, $2,520 in the pool for a $300 cap:
    // $150 at 3% + $150 at 2% + $2,220 over the cap and $1,680 elsewhere at 1%.
    expect(estimateYearOne(card, DINING_AND_GROCERIES)?.rewardsCents).toBe(450 + 300 + 2_220 + 1_680);
  });

  it("uses the first-year rate when the issuer states one", () => {
    const card = rewards([rate(3, ["food-and-dining"], { yearOneAmount: 6 }), rate(1, "all")]);
    // $2,520 at 6% + $1,680 at 1%.
    expect(estimateYearOne(card, { categories: ["food-and-dining"], band: "200_to_500" })?.rewardsCents).toBe(15_120 + 1_680);
  });

  it("assumes the student picks their best area for a choose-one rate, once", () => {
    const card = rewards([
      rate(3, ["food-and-dining", "gas-and-rides", "shopping-and-subscriptions"], { pickOne: true }),
      rate(2, ["groceries"]),
      rate(1, "all"),
    ]);
    // Dining takes the 3%, groceries keep their 2%.
    // $1,260 at 3% + $1,260 at 2% + $1,680 at 1%.
    expect(estimateYearOne(card, DINING_AND_GROCERIES)?.rewardsCents).toBe(3_780 + 2_520 + 1_680);
    // Two areas the choice covers: only one gets it, the other earns the base rate.
    const both = estimateYearOne(card, { categories: ["food-and-dining", "gas-and-rides"], band: "200_to_500" });
    expect(both?.rewardsCents).toBe(3_780 + 1_260 + 1_680);
    expect(both?.drivers).toHaveLength(1);
  });

  it("leaves out rotating rates and rates that need something extra", () => {
    const card = rewards([
      rate(5, [], { rotating: true }),
      rate(5, ["food-and-dining"], { requires: "Chime Prime membership" }),
      rate(1, "all"),
    ]);
    expect(estimateYearOne(card, { categories: ["food-and-dining"], band: "200_to_500" })?.rewardsCents).toBe(4_200);
    // A card whose only rate needs something extra earns nothing we can count on.
    const chime = rewards([rate(5, ["food-and-dining"], { requires: "direct deposit" })]);
    expect(estimateYearOne(chime, { categories: ["food-and-dining"], band: "200_to_500" })).toMatchObject({ rewardsCents: 0, rankingCents: 0 });
  });

  it("counts a card with no rewards as nothing", () => {
    expect(estimateYearOne(rewards([], { kind: "none" }), MIDDLE)).toEqual({
      rankingCents: 0,
      rewardsCents: 0,
      points: null,
      matchCents: 0,
      bonus: null,
      drivers: [],
    });
  });

  it("values points at the issuer's stated cash value", () => {
    const card = rewards([rate(1.5, "all", { unit: "points_per_dollar" })], { kind: "points", pointValueCents: 1 });
    expect(estimateYearOne(card, MIDDLE)).toMatchObject({ points: 6_300, rewardsCents: 6_300, rankingCents: 6_300 });
  });

  it("shows points with no dollar value when the issuer states none, and ranks them as 0", () => {
    const card = rewards([rate(3, ["travel-home"], { unit: "points_per_dollar" }), rate(1, "all", { unit: "points_per_dollar" })], { kind: "points" });
    const estimate = estimateYearOne(card, { categories: ["travel-home"], band: "200_to_500" });
    expect(estimate).toMatchObject({ points: 7_560 + 1_680, rewardsCents: null, rankingCents: 0 });
  });

  describe("sign-up bonus", () => {
    const bonus = { summary: "$200 after $1,000 in 90 days.", valueCents: 20_000, spendCents: 100_000, withinDays: 90 };

    it("counts a bonus the student's spend reaches in time", () => {
      // $350 a month for three months is $1,050.
      const estimate = estimateYearOne(rewards([rate(1.5, "all")], { bonus }), MIDDLE);
      expect(estimate?.bonus).toEqual({ cents: 20_000, spendCents: 100_000, withinDays: 90, reachable: true });
      expect(estimate?.rankingCents).toBe(6_300 + 20_000);
    });

    it("shows but does not count a bonus out of reach at the student's spend", () => {
      // $150 a month for three months is $450.
      const estimate = estimateYearOne(rewards([rate(1.5, "all")], { bonus }), { categories: [], band: "under_200" });
      expect(estimate?.bonus?.reachable).toBe(false);
      expect(estimate?.rankingCents).toBe(2_700);
    });

    it("counts a bonus with no spend target", () => {
      const autopay = { summary: "$25 for autopay.", valueCents: 2_500, spendCents: null, withinDays: 90 };
      expect(estimateYearOne(rewards([rate(1.5, "all")], { bonus: autopay }), { categories: [], band: "under_200" })?.rankingCents).toBe(2_700 + 2_500);
    });

    it("counts nothing for a bonus with no stated dollar value", () => {
      const points = { summary: "Bonus points.", valueCents: null, spendCents: 50_000, withinDays: 90 };
      const estimate = estimateYearOne(rewards([rate(1, "all")], { bonus: points }), MIDDLE);
      expect(estimate?.bonus).toMatchObject({ cents: null, reachable: true });
      expect(estimate?.rankingCents).toBe(4_200);
    });

    it("doubles the first year's cash back with a Cashback Match, and labels it", () => {
      const match = { summary: "Cashback Match: we match all the cash back you earn in your first year.", valueCents: null, spendCents: null, withinDays: 365 };
      const card = rewards([rate(2, ["food-and-dining"], { cap: { cents: 100_000, per: "quarter", sharedWith: null } }), rate(1, "all")], { bonus: match });
      expect(isCashbackMatch(card)).toBe(true);
      const estimate = estimateYearOne(card, { categories: ["food-and-dining"], band: "200_to_500" });
      // $2,520 at 2% + $1,680 at 1%, then the same again.
      expect(estimate).toMatchObject({ rewardsCents: 5_040 + 1_680, matchCents: 5_040 + 1_680, rankingCents: 2 * (5_040 + 1_680), bonus: null });
    });

    it("is not a match when the bonus has a dollar value", () => {
      expect(isCashbackMatch(rewards([], { bonus: { ...bonus, summary: "Cashback Match plus $200" } }))).toBe(false);
    });
  });

  it("does not change the rewards or the profile it is given", () => {
    const card = rewards([rate(3, ["groceries"], { pickOne: true }), rate(1, "all")]);
    const copy = structuredClone(card);
    const profile = structuredClone(DINING_AND_GROCERIES);
    estimateYearOne(card, profile);
    expect(card).toEqual(copy);
    expect(profile).toEqual(DINING_AND_GROCERIES);
  });
});
