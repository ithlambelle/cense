// Created with Claude Code (2026-11-19).
import { describe, expect, it } from "vitest";

import { findCard, listCards } from "../cards/catalog";
import { CARD_REWARDS, cardRewards, type CardRewards } from "../cards/rewards";
import { estimateYearOne } from "../results/value";
import type { CardFit } from "../rules/fit-tier";
import {
  autopayLines,
  autopaySummary,
  dateLines,
  datesSummary,
  estimateShort,
  feeLines,
  feesSummary,
  issuerRulesSummary,
  rewardsSummary,
  spendLimitLines,
  spendLimitSummary,
  whyItFits,
} from "./card-details";

function rewardsFor(id: string): CardRewards {
  const rewards = cardRewards(id);
  if (!rewards) throw new Error(`${id} has no rewards`);
  return rewards;
}

const FIXED = { condition: null, pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null } as const;

describe("rewardsSummary", () => {
  it("says Discover's rotating 5% and its 1% on the rest, as the K1 and K2 frames do", () => {
    expect(rewardsSummary(rewardsFor("discover-it-student-cash-back"))).toBe("5% in rotating categories, 1% on the rest");
  });

  it("leads with the top fixed rate and the base rate", () => {
    const rewards: CardRewards = {
      ...rewardsFor("discover-it-student-cash-back"),
      rates: [
        { amount: 3, unit: "percent", category: "Dining", earnsOn: ["food-and-dining"], ...FIXED },
        { amount: 1, unit: "percent", category: "All other purchases", earnsOn: "all", ...FIXED },
      ],
    };
    expect(rewardsSummary(rewards)).toBe("Up to 3% back, 1% on the rest");
  });

  it("writes points as points", () => {
    const rewards: CardRewards = {
      ...rewardsFor("discover-it-student-cash-back"),
      kind: "points",
      rates: [
        { amount: 3, unit: "points_per_dollar", category: "Dining", earnsOn: ["food-and-dining"], ...FIXED },
        { amount: 1, unit: "points_per_dollar", category: "Everything else", earnsOn: "all", ...FIXED },
      ],
    };
    expect(rewardsSummary(rewards)).toBe("Up to 3x points, 1x on the rest");
  });

  it("says a flat rate is on everything", () => {
    const rewards: CardRewards = {
      ...rewardsFor("discover-it-student-cash-back"),
      rates: [{ amount: 1.5, unit: "percent", category: "All purchases", earnsOn: "all", ...FIXED }],
    };
    expect(rewardsSummary(rewards)).toBe("1.5% back on everything");
  });

  it("says plainly when a card earns nothing", () => {
    expect(rewardsSummary(rewardsFor("capital-one-platinum"))).toBe("No rewards on purchases");
    expect(rewardsSummary(null)).toBe("No rewards on purchases");
  });

  it("gives every card in the catalog a short summary with no tilde or em dash", () => {
    for (const [id, rewards] of Object.entries(CARD_REWARDS)) {
      const summary = rewardsSummary(rewards);
      expect(summary, id).not.toMatch(/[~—]/);
      expect(summary.length, id).toBeLessThanOrEqual(45);
    }
  });
});

describe("feesSummary and feeLines", () => {
  it("says the annual and foreign fees in one line, as the frames do", () => {
    const card = findCard("discover-it-student-cash-back")!;
    expect(feesSummary(card)).toBe("$0 annual fee · 0% foreign fee");
    expect(feeLines(card)).toEqual(["Annual fee · $0", "Foreign fee · 0%", "Credit check · Yes"]);
  });

  it("adds the deposit for a secured card, closed and open", () => {
    const card = findCard("capital-one-platinum-secured")!;
    expect(card.secured).toBe(true);
    expect(card.depositMinCents).toBe(4900);
    expect(feesSummary(card)).toBe("$0 annual fee · 0% foreign fee · $49 deposit");
    expect(feeLines(card)).toContain(`Deposit · From $${card.depositMinCents / 100}`);
  });

  it("names the deposit in the closed line of every card that needs one, and only those", () => {
    const cards = listCards();
    const withDeposit = cards.filter((card) => card.secured && card.depositMinCents > 0);
    expect(withDeposit.length).toBeGreaterThan(0);
    for (const card of cards) {
      const summary = feesSummary(card);
      if (withDeposit.includes(card)) expect(summary, card.id).toMatch(/ · \$[\d,]+ deposit$/);
      else expect(summary, card.id).not.toContain("deposit");
    }
    // A secured card with no deposit (money moved in is the limit) says none.
    const chime = findCard("chime-card")!;
    expect(chime.secured && chime.depositMinCents === 0).toBe(true);
    expect(feesSummary(chime)).not.toContain("deposit");
  });
});

describe("issuerRulesSummary", () => {
  it("names the issuer", () => {
    expect(issuerRulesSummary("Discover")).toBe("From Discover’s own rules");
  });
});

describe("whyItFits", () => {
  const likely: CardFit = {
    cardId: "discover-it-student-cash-back",
    tier: "likely_fit",
    ruleIds: [],
    reasons: ["Made for students, like you.", "You meet what the issuer asks, so check preapproval first."],
    notes: [],
  };

  it("leads a likely fit with its reason, as the K2 frame does, then the value and the bonus", () => {
    const rewards = rewardsFor("discover-it-student-cash-back");
    const estimate = estimateYearOne(rewards, { categories: ["groceries"], band: "200_to_500" });
    const why = whyItFits(likely, rewards, estimate)!;
    expect(why.summary).toBe("Made for students, like you");
    expect(why.lines.map((line) => line.id)).toEqual(["approval", "value"]);
    expect(why.lines[0]).toMatchObject({ text: "Made for students, like you.", detail: null });
    expect(why.lines[1].text).toMatch(/^About \$\d+ in your first year$/);
  });

  it("keeps the caution for a stretch", () => {
    const stretch: CardFit = { ...likely, tier: "stretch", ruleIds: ["C1"], reasons: ["The issuer says this card is for people with a bit more credit history."] };
    const why = whyItFits(stretch, rewardsFor("discover-it-student-cash-back"), null)!;
    expect(why.summary).toBe("Approval is less certain for you");
    expect(why.lines[0].detail).toBe("The issuer says this card is for people with a bit more credit history.");
  });

  it("has nothing to say for a card that is not a fit yet, or with no quiz", () => {
    expect(whyItFits({ ...likely, tier: "not_yet", reasons: ["This card is only for students."] }, null, null)).toBeNull();
    expect(whyItFits(null, null, null)).toBeNull();
  });
});

describe("estimateShort", () => {
  it("writes the K2 fit row's estimate, or nothing without one", () => {
    const rewards = rewardsFor("discover-it-student-cash-back");
    const estimate = estimateYearOne(rewards, { categories: ["groceries"], band: "200_to_500" });
    expect(estimateShort(estimate)).toMatch(/^\$\d+ year one, est\.$/);
    expect(estimateShort(null)).toBeNull();
  });
});

describe("the student's own card (K1)", () => {
  const set = { statementClosingDay: 18, paymentDueDay: 12 };
  const unset = { statementClosingDay: null, paymentDueDay: null };

  it("writes the saved days, never 'from your bank' (that needs linked bank dates)", () => {
    expect(datesSummary(set)).toBe("Statement closes day 18 · due day 12");
    expect(dateLines(set)).toEqual(["Statement closes · Day 18", "Payment due · Day 12"]);
    expect(datesSummary(unset)).toBe("Not set yet");
    expect(dateLines(unset)).toEqual([]);
    expect(datesSummary({ statementClosingDay: 18, paymentDueDay: null })).toBe("Not set yet");
  });

  it("says whether autopay and reminders are on", () => {
    const on = { autopayStatus: "on" as const, autopayPaymentType: "statement_balance" as const };
    expect(autopaySummary(on, "on")).toBe("Autopay on · reminders on");
    expect(autopayLines(on, "on")).toEqual(["Autopay · On, statement balance", "Reminders · On"]);
    const unknown = { autopayStatus: "unknown" as const, autopayPaymentType: null };
    expect(autopaySummary(unknown, "not_set")).toBe("Autopay not set yet · reminders not set yet");
    expect(autopayLines({ autopayStatus: "off", autopayPaymentType: null }, "off")).toEqual(["Autopay · Off", "Reminders · Off"]);
    // Autopay saved on before the payment type existed: just On.
    expect(autopayLines({ autopayStatus: "on", autopayPaymentType: null }, "on")[0]).toBe("Autopay · On");
  });

  it("writes the spend limit as the frame does, with the credit limit when known", () => {
    expect(spendLimitSummary({ spendLimitCents: 15000, creditLimitCents: 50000 })).toBe("$150 a month, your pick");
    expect(spendLimitLines({ spendLimitCents: 15000, creditLimitCents: 50000 })).toEqual(["Spend limit · $150 a month", "Credit limit · $500"]);
    expect(spendLimitSummary({ spendLimitCents: null, creditLimitCents: null })).toBe("Not set yet");
    expect(spendLimitLines({ spendLimitCents: null, creditLimitCents: null })).toEqual([]);
  });
});
