import type { CardRewards, RewardRate, SpendingCategoryId } from "../cards/rewards";
import type { QuizAnswers } from "../quiz/questions";
import { spendingFromAnswers, type SpendingBand } from "../quiz/spending";

// Estimated value in a card's first year, from the spending question (Ben,
// 2026-11-07). It is the last tie-breaker in the pick order (fit rules v1.3),
// ordering only cards the rules cannot otherwise tell apart, and the "About $X
// in your first year" line on the result. It never
// decides fit. Pure: whole cents out, nothing read or saved here.
//
// Every assumption lives in this block, so a change is one edit here.
export const VALUE_ASSUMPTIONS = {
  // The middle of each monthly band the student picked. Over $500 is counted
  // as $600 and never more: we do not stretch a rough answer upward.
  monthlySpendCents: { under_200: 15_000, "200_to_500": 35_000, over_500: 60_000 } satisfies Record<SpendingBand, number>,
  // With one or two areas picked, this share of the month is split evenly
  // across them and the rest goes on everything else at the card's base rate.
  // With none picked, it all goes on everything else.
  pickedShare: 0.6,
  monthsInYear: 12,
  // A bonus window in days is read as months of 30 days.
  daysPerMonth: 30,
  // A cap per period, as a number of those periods in a year.
  periodsPerYear: { month: 12, quarter: 4, year: 1 },
} as const;
// Also assumed, and shown in the breakdown rather than guessed:
// - No band answered: no estimate at all. Spend is never guessed.
// - A rate that rotates, or needs something the student may not have
//   (`requires`, such as direct deposit), is left out: that spend earns the base rate.
// - A pick-one rate (choose your category) goes on the student's best match,
//   once, even where the issuer lets a student choose two.
// - A first-year rate (`yearOneAmount`) is used instead of the regular one.
// - Spend over a cap earns the base rate. Rates sharing a cap share it in
//   proportion to their spend, as purchases would interleave.
// - A points card's points count at the issuer's stated cash value per point,
//   or no dollar value at all when the issuer states none.
// - A first-year Cashback Match doubles the year's cash back.
// - A sign-up bonus counts only when the monthly spend reaches its target
//   within its window; otherwise it is shown as likely out of reach.

export type { SpendingCategoryId };

const CATEGORY_IDS: readonly SpendingCategoryId[] = [
  "food-and-dining",
  "groceries",
  "gas-and-rides",
  "travel-home",
  "shopping-and-subscriptions",
];

// The slice of a card's rewards (lib/cards/rewards.ts) the estimate reads.
export type EstimateRate = Pick<
  RewardRate,
  "amount" | "unit" | "category" | "earnsOn" | "pickOne" | "rotating" | "requires" | "yearOneAmount" | "cap"
>;

export type EstimateRewards = Pick<CardRewards, "kind" | "bonus" | "pointValueCents"> & { rates: EstimateRate[] };

export type SpendingProfile = { categories: SpendingCategoryId[]; band: SpendingBand };

export type YearOneEstimate = {
  // What the ranking uses: cash back, the match and a reachable bonus. Points
  // with no stated value count as 0.
  rankingCents: number;
  // Year-one rewards in cash, or null for points with no stated cash value.
  rewardsCents: number | null;
  // The points earned, for a points card.
  points: number | null;
  // A first-year Cashback Match: the same again as rewardsCents. 0 without one.
  matchCents: number;
  // The sign-up bonus, other than a match. cents is null when the issuer
  // states no dollar value; reachable is false when the student's monthly
  // spend would not reach the target in time.
  bonus: { cents: number | null; spendCents: number | null; withinDays: number | null; reachable: boolean } | null;
  // The picked areas that earn more than the base rate on this card.
  drivers: SpendingCategoryId[];
};

// The student's spending answer as the estimate reads it, or null when they
// gave no monthly band (then there is no estimate, whatever they picked).
export function spendingProfile(answers: QuizAnswers): SpendingProfile | null {
  if (!answers.spendingBand) return null;
  const categories = spendingFromAnswers(answers).categories.filter((id): id is SpendingCategoryId =>
    (CATEGORY_IDS as readonly string[]).includes(id),
  );
  return { categories, band: answers.spendingBand };
}

// A first-year match in the Discover style: no dollar value, and the summary
// names it. The rewards data has no flag for it yet, so this is the one place
// that recognises it.
export function isCashbackMatch(rewards: Pick<EstimateRewards, "kind" | "bonus">): boolean {
  return rewards.kind === "cash_back" && rewards.bonus !== null && rewards.bonus.valueCents === null && /cashback match/i.test(rewards.bonus.summary);
}

// A rate the student can count on: not rotating, and needing nothing extra.
function usable(rate: EstimateRate): boolean {
  return !rate.rotating && rate.requires === null;
}

function yearOneRate(rate: EstimateRate): number {
  return rate.yearOneAmount ?? rate.amount;
}

type Bucket = { category: SpendingCategoryId | null; spendCents: number };

// One year of spend, split into the picked areas and everything else.
function buckets(profile: SpendingProfile): Bucket[] {
  const year = VALUE_ASSUMPTIONS.monthlySpendCents[profile.band] * VALUE_ASSUMPTIONS.monthsInYear;
  const picked = profile.categories;
  if (picked.length === 0) return [{ category: null, spendCents: year }];
  const share = (year * VALUE_ASSUMPTIONS.pickedShare) / picked.length;
  return [
    ...picked.map((category) => ({ category, spendCents: share })),
    { category: null, spendCents: year * (1 - VALUE_ASSUMPTIONS.pickedShare) },
  ];
}

// Which rate each bucket earns. Everything else earns the base rate. A
// picked area earns its best regular rate, then each pick-one rate goes on
// the one area where it adds the most.
function assign(rates: EstimateRate[], spend: Bucket[], base: EstimateRate | null): (EstimateRate | null)[] {
  const chosen = spend.map((bucket) => {
    if (bucket.category === null) return base;
    const category = bucket.category;
    const fixed = rates.filter((rate) => !rate.pickOne && Array.isArray(rate.earnsOn) && rate.earnsOn.includes(category));
    return [base, ...fixed].reduce<EstimateRate | null>(
      (best, rate) => (rate && (!best || yearOneRate(rate) > yearOneRate(best)) ? rate : best),
      null,
    );
  });
  for (const rate of rates.filter((entry) => entry.pickOne)) {
    let bestIndex = -1;
    let bestGain = 0;
    spend.forEach((bucket, index) => {
      if (bucket.category === null || !Array.isArray(rate.earnsOn) || !rate.earnsOn.includes(bucket.category)) return;
      const current = chosen[index];
      const gain = (yearOneRate(rate) - (current ? yearOneRate(current) : 0)) * bucket.spendCents;
      if (gain > bestGain) {
        bestGain = gain;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) chosen[bestIndex] = rate;
  }
  return chosen;
}

// Capped rates that share a cap form one pool (sharedWith names the other
// rates' categories). A rate with its own cap is a pool of one.
function capPools(rates: EstimateRate[]): EstimateRate[][] {
  const capped = rates.filter((rate) => rate.cap !== null);
  const pools: EstimateRate[][] = [];
  for (const rate of capped) {
    const linked = pools.filter((pool) =>
      pool.some((other) => shares(rate, other) || shares(other, rate)),
    );
    const merged = [rate, ...linked.flat()];
    for (const pool of linked) pools.splice(pools.indexOf(pool), 1);
    pools.push(merged);
  }
  return pools;
}

function shares(rate: EstimateRate, other: EstimateRate): boolean {
  const sharedWith = rate.cap?.sharedWith;
  return typeof sharedWith === "string" && sharedWith.includes(other.category);
}

function yearCap(pool: EstimateRate[]): number {
  return Math.min(
    ...pool.map((rate) => (rate.cap ? rate.cap.cents * VALUE_ASSUMPTIONS.periodsPerYear[rate.cap.per] : Infinity)),
  );
}

// What spend at a rate earns: cents of cash back, or points.
function earned(spendCents: number, rate: number, unit: EstimateRate["unit"]): number {
  return unit === "percent" ? (spendCents * rate) / 100 : (spendCents / 100) * rate;
}

// The card's year-one estimate for this spending, or null when the card has
// no rewards data or the student gave no monthly band.
export function estimateYearOne(rewards: EstimateRewards | null, profile: SpendingProfile | null): YearOneEstimate | null {
  if (!rewards || !profile) return null;
  const monthly = VALUE_ASSUMPTIONS.monthlySpendCents[profile.band];
  const rates = rewards.rates.filter(usable);
  const base = rates.find((rate) => rate.earnsOn === "all") ?? null;
  const spend = buckets(profile);
  const chosen = assign(rates, spend, base);

  // Spend per rate, then each cap pool trimmed to its cap with the rest at the base rate.
  const spendOn = new Map<EstimateRate, number>();
  spend.forEach((bucket, index) => {
    const rate = chosen[index];
    if (rate) spendOn.set(rate, (spendOn.get(rate) ?? 0) + bucket.spendCents);
  });
  let total = 0;
  let overflow = 0;
  const pooled = new Set<EstimateRate>();
  for (const pool of capPools(rates)) {
    const poolSpend = pool.reduce((sum, rate) => sum + (spendOn.get(rate) ?? 0), 0);
    const cap = yearCap(pool);
    const inCap = poolSpend > cap ? cap / poolSpend : 1;
    for (const rate of pool) {
      pooled.add(rate);
      const atRate = spendOn.get(rate) ?? 0;
      total += earned(atRate * inCap, yearOneRate(rate), rate.unit);
      overflow += atRate * (1 - inCap);
    }
  }
  for (const [rate, atRate] of spendOn) {
    if (!pooled.has(rate)) total += earned(atRate, yearOneRate(rate), rate.unit);
  }
  if (base) total += earned(overflow, yearOneRate(base), base.unit);

  const baseRate = base ? yearOneRate(base) : 0;
  const drivers = spend.flatMap((bucket, index) => {
    const rate = chosen[index];
    return bucket.category !== null && rate && yearOneRate(rate) > baseRate ? [bucket.category] : [];
  });

  let rewardsCents: number | null;
  let points: number | null = null;
  if (rewards.kind === "points") {
    points = Math.round(total);
    rewardsCents = rewards.pointValueCents === null ? null : Math.round(total * rewards.pointValueCents);
  } else {
    rewardsCents = Math.round(total);
  }

  const match = isCashbackMatch(rewards);
  const matchCents = match && rewardsCents !== null ? rewardsCents : 0;
  let bonus: YearOneEstimate["bonus"] = null;
  if (rewards.bonus && !match) {
    const { valueCents, spendCents, withinDays } = rewards.bonus;
    // No stated window: the first year.
    const months = (withinDays ?? 365) / VALUE_ASSUMPTIONS.daysPerMonth;
    const reachable = spendCents === null || monthly * months >= spendCents;
    bonus = { cents: valueCents, spendCents, withinDays, reachable };
  }
  const bonusCents = bonus?.reachable && bonus.cents !== null ? bonus.cents : 0;

  return {
    rankingCents: (rewardsCents ?? 0) + matchCents + bonusCents,
    rewardsCents,
    points,
    matchCents,
    bonus,
    drivers,
  };
}
