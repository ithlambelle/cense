import { describe, expect, it } from "vitest";

import type { CardRewards, RewardRate } from "../../src/lib/cards/rewards";
import { checkCard, endDates, keywordStems, missingFromText, newBonuses, newFigures, notReadable } from "./match";

// Made-up cards in the shape of rewards.ts, so these tests never move when the
// real data is re-read.
function rate(amount: number, category: string, extra: Partial<RewardRate> = {}): RewardRate {
  return {
    amount,
    unit: "percent",
    category,
    condition: null,
    earnsOn: [],
    pickOne: false,
    rotating: false,
    requires: null,
    yearOneAmount: null,
    cap: null,
    ...extra,
  };
}

const CARD: CardRewards = {
  kind: "cash_back",
  rates: [rate(3, "Dining at restaurants and drugstores", { earnsOn: ["food-and-dining"] }), rate(1.5, "All other purchases", { earnsOn: "all" })],
  bonus: { summary: "$200 bonus after you spend $500 on purchases in the first 3 months.", valueCents: 20_000, spendCents: 50_000, withinDays: 90 },
  pointValueCents: null,
  image: null,
  sourceUrl: "https://issuer.example/card",
  verifiedAt: "2026-11-07",
};

const PAGE =
  "Earn 3% cash back on dining at restaurants, including takeout. Earn 1.5% on all other purchases. Earn a $200 bonus after you spend $500 on purchases in the first 3 months.";

const page = (visibleText: string, fullText = visibleText) => ({ visibleText, fullText, requestedUrl: CARD.sourceUrl, finalUrl: CARD.sourceUrl });

describe("stored figures still on the page", () => {
  it("is quiet when every stored figure is there with its words", () => {
    expect(checkCard(CARD, page(PAGE), "2026-11-09")).toEqual([]);
  });

  it("reports a rate whose figure is gone, quoting what the page says now", () => {
    const [finding] = missingFromText(CARD, PAGE.replace("3% cash back", "4% cash back"), PAGE.replace("3% cash back", "4% cash back"));
    expect(finding.kind).toBe("rate-missing");
    expect(finding.stored).toBe('3% on "Dining at restaurants and drugstores"');
    expect(finding.page).toContain("4% cash back on dining");
  });

  it("never takes a longer number for the stored one", () => {
    for (const figure of ["13%", "3.5%", "2.3%", "30%"]) {
      const stored = missingFromText(CARD, PAGE.replace("3% cash back", `${figure} cash back`)).map((finding) => finding.stored);
      expect(stored, figure).toEqual(['3% on "Dining at restaurants and drugstores"']);
    }
    expect(missingFromText(CARD, PAGE.replace("1.5%", "1.55%")).map((finding) => finding.stored)).toEqual(['1.5% on "All other purchases"']);
  });

  it("never takes a figure in another unit for the stored one", () => {
    expect(missingFromText(CARD, PAGE.replace("3% cash back on dining", "3X points on dining")).map((finding) => finding.stored)).toEqual([
      '3% on "Dining at restaurants and drugstores"',
    ]);
  });

  it("reads 1.50% and 3 percent for cash back, 3X and 3 points per $1 for points", () => {
    expect(missingFromText(CARD, "3 percent back at restaurants. 1.50% on everything else. $200 bonus once you spend $500 on purchases.")).toEqual([]);
    const points: CardRewards = { ...CARD, kind: "points", rates: [rate(3, "Restaurants", { unit: "points_per_dollar" })], bonus: null };
    expect(missingFromText(points, "Earn 3X points at restaurants")).toEqual([]);
    expect(missingFromText(points, "Earn 3 points per $1 at restaurants")).toEqual([]);
    expect(missingFromText(points, "Earn 3 ThankYou Points per $1 at restaurants")).toEqual([]);
  });

  it("reports a figure that is only near other words", () => {
    const [finding] = missingFromText(
      CARD,
      "Earn 1.5% on all other purchases. $200 bonus after you spend $500 on purchases. " + "x".repeat(400) + " 3% balance transfer fee.",
    );
    expect(finding.note).toContain("never near the words of its category");
  });

  it("matches short category words whole, long ones by their first letters", () => {
    expect(keywordStems("Lyft products bought in the Lyft app")).toEqual(["lyfts?\\b", "apps?\\b"]);
    expect(keywordStems("Gas at grocery stores")).toEqual(["gass?\\b", "groce", "store"]);
  });

  it("reports a missing bonus amount or spend, and a bonus figure only away from bonus words", () => {
    const kinds = (text: string) => missingFromText(CARD, text).map((finding) => finding.stored);
    expect(kinds(PAGE.replace("$200 bonus", "$150 bonus"))).toEqual([`$200 bonus (bonus: "${CARD.bonus?.summary}")`]);
    expect(kinds(PAGE.replace("$500", "$1,000"))).toEqual([`$500 to spend (bonus: "${CARD.bonus?.summary}")`]);
    expect(kinds(`Earn 3% on dining. 1.5% on all other purchases. Spend $500 on purchases. ${"z ".repeat(100)}Gift shop: $200`)).toHaveLength(1);
  });

  it("finds $1,000 written with or without the comma", () => {
    const card: CardRewards = { ...CARD, bonus: { summary: "$200 after $1,000 in purchases.", valueCents: 20_000, spendCents: 100_000, withinDays: 90 } };
    expect(missingFromText(card, PAGE.replace("$500", "$1000"))).toEqual([]);
    expect(missingFromText(card, PAGE.replace("$500", "$1,000.00"))).toEqual([]);
  });

  it("skips a stored rate marked not readable, until that rate changes", () => {
    const acknowledged = { notReadable: [{ figure: "3%", category: "Dining at restaurants", why: "Only in a PDF." }] };
    const [finding] = missingFromText(CARD, "Earn 1.5% on all other purchases. $200 bonus after you spend $500 on purchases.");
    expect(notReadable(finding, acknowledged)).toBe(true);
    const changed: CardRewards = { ...CARD, rates: [rate(4, "Dining at restaurants and drugstores"), CARD.rates[1]] };
    const [after] = missingFromText(changed, "Earn 1.5% on all other purchases. $200 bonus after you spend $500 on purchases.");
    expect(notReadable(after, acknowledged)).toBe(false);
  });
});

describe("new figures on the page", () => {
  const figures = (line: string) => newFigures(CARD, `${PAGE}\n${line}`).map((finding) => finding.note.split(" ")[0]);

  it("reports a reward rate the data does not have", () => {
    expect(figures("Now earn 5% cash back on groceries.")).toEqual(["5%"]);
    expect(figures("Earn 2X points on gas.")).toEqual(["2X"]);
  });

  it("ignores APRs, fees, discounts, review scores and multipliers", () => {
    for (const line of [
      "0% intro APR for 15 months, then 19.24% to 29.99% variable APR. Balance transfer fee: 5% of each transfer.",
      "Earn rewards and get 10% off at partner stores.",
      "4.5 based on 737 reviews. 91 % of reviewers recommend this card's rewards.",
      "Earn 10% more rewards with Preferred Rewards.",
      "Best cash back card - 5X winner",
    ]) {
      expect(figures(line), line).toEqual([]);
    }
  });

  it("ignores another product's rates: an upgrade, a cross-sell, a question", () => {
    expect(figures("With the upgrade, you'll get 5% on travel and 4% cash back on dining.")).toEqual([]);
    expect(figures("Looking for a travel rewards card that gets you 2X miles?")).toEqual([]);
    expect(figures("Explore cards that offer 2% cash back on every purchase.")).toEqual([]);
  });

  it("takes an additional rate on top of the base rate for the stored total", () => {
    const travel: CardRewards = { ...CARD, rates: [rate(5, "Prepaid travel in the Travel Center"), rate(1, "All other purchases", { earnsOn: "all" })] };
    expect(newFigures(travel, "Cardmembers earn an additional 4% cash back on prepaid travel.")).toEqual([]);
    expect(newFigures(travel, "Cardmembers earn 3% cash back on prepaid travel.")).toHaveLength(1);
  });

  it("ignores other cards in a card comparison section, and resumes after it", () => {
    const text = `${PAGE}\nMore from Issuer\nPremium Card\n6% cash back at U.S. supermarkets\n4X points at restaurants\nCompare These Cards\nNow earn 5% cash back on groceries.`;
    expect(newFigures(CARD, text).map((finding) => finding.note.split(" ")[0])).toEqual(["5%"]);
  });

  it("drops a figure acknowledged in the same wording, not in new wording", () => {
    const acknowledged = [{ figure: "5%", context: "Partner offer: 5% cash back", why: "Another company's offer." }];
    expect(newFigures(CARD, "Partner offer: 5% cash back at Example Store.", acknowledged)).toEqual([]);
    expect(newFigures(CARD, "Earn 5% cash back on groceries.", acknowledged)).toHaveLength(1);
  });

  it("reports a sign-up bonus the data does not have, but not fees or per-dollar rates", () => {
    const none: CardRewards = { ...CARD, bonus: null };
    expect(newBonuses(none, "Earn a $250 bonus after you spend $1,000 in the first 90 days.").map((finding) => finding.note)).toEqual([
      "$250 reads as part of a sign-up bonus, and the stored bonus has no $250.",
      "$1,000 reads as part of a sign-up bonus, and the stored bonus has no $1,000.",
    ]);
    expect(newBonuses(none, "Earn 20,000 bonus points after you spend $500.").map((finding) => finding.note.split(" ")[0])).toEqual(["$500", "20,000"]);
    expect(newBonuses(CARD, "Balance transfer fee: 3% of each transfer ($5 minimum) in the first 4 months.")).toEqual([]);
    expect(newBonuses(CARD, "4 points (1 base and 3 bonus points) for every $1 spent on dining.")).toEqual([]);
    expect(newBonuses(none, "Secured cards are not eligible for a new account bonus, like a $200 bonus offer.")).toEqual([]);
  });
});

describe("end dates and moved pages", () => {
  const dated: CardRewards = { ...CARD, rates: [rate(2, "Lyft rides", { expiresOn: "2027-09-30" }), CARD.rates[1]] };

  it("warns 30 days ahead and reports an ended promotion", () => {
    expect(endDates(dated, "2027-08-30")).toEqual([]);
    expect(endDates(dated, "2027-08-31").map((finding) => finding.note)).toEqual(["Ends 2027-09-30, in 30 days. Check whether the issuer extended it."]);
    expect(endDates(dated, "2027-09-30").map((finding) => finding.kind)).toEqual(["ends-soon"]);
    expect(endDates(dated, "2027-10-01").map((finding) => finding.kind)).toEqual(["ended"]);
  });

  it("reports a source page that now redirects, but not a trailing slash", () => {
    const moved = checkCard(CARD, { ...page(PAGE), finalUrl: "https://issuer.example/all-cards" }, "2026-11-09");
    expect(moved.map((finding) => finding.kind)).toEqual(["moved"]);
    expect(checkCard(CARD, { ...page(PAGE), finalUrl: "https://www.issuer.example/card/" }, "2026-11-09")).toEqual([]);
  });
});
