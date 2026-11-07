import type { CardRewards, RewardRate } from "../cards/rewards";

import type { RewardsLookup } from "./compute";

// TEST DATA ONLY, in the shape of lib/cards/rewards.ts. Made-up rates on real
// card IDs, so tests of the order do not move when the real rewards data is
// re-read. Must not be imported outside tests.

export function fixtureRate(amount: number, earnsOn: RewardRate["earnsOn"], extra: Partial<RewardRate> = {}): RewardRate {
  return {
    amount,
    unit: "percent",
    category: Array.isArray(earnsOn) ? `Test ${earnsOn.join(", ")}` : "All other purchases",
    condition: null,
    earnsOn,
    pickOne: false,
    rotating: false,
    requires: null,
    yearOneAmount: null,
    cap: null,
    ...extra,
  };
}

export function fixtureRewards(rates: RewardRate[], extra: Partial<CardRewards> = {}): CardRewards {
  return {
    kind: rates.length === 0 ? "none" : "cash_back",
    rates,
    bonus: null,
    pointValueCents: null,
    image: null,
    sourceUrl: "https://example.com/rewards",
    verifiedAt: "2026-11-07",
    ...extra,
  };
}

export function lookup(table: Record<string, CardRewards>): RewardsLookup {
  return (cardId) => table[cardId] ?? null;
}

// Every card earns 1% except Discover it Student Chrome, which earns 5% on
// groceries. It ties Discover it Student Cash Back on every rule before value
// (both students-only, no history, no fee, unsecured), so a student who
// spends on groceries sees Chrome first, and one who skipped spending sees
// Cash Back first (card ID).
export const GROCERY_CHROME = lookup({
  "discover-it-student-cash-back": fixtureRewards([fixtureRate(1, "all")], { image: "/cards/discover-it-student-cash-back.png" }),
  "discover-it-student-chrome": fixtureRewards([fixtureRate(5, ["groceries"]), fixtureRate(1, "all")], {
    bonus: { summary: "$200 after $1,000 in 90 days.", valueCents: 20_000, spendCents: 100_000, withinDays: 90 },
  }),
  "chase-freedom-rise": fixtureRewards([fixtureRate(1, "all")]),
  "capital-one-platinum-secured": fixtureRewards([]),
});
