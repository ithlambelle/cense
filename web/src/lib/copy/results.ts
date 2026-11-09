import type { ApiData } from "../api-client/client";
import type { CardRewards } from "../cards/rewards";
import { moneyAmount } from "../money";
import type { CardFit } from "../rules/fit-tier";
import { isCashbackMatch, type SpendingCategoryId, type YearOneEstimate } from "../results/value";

export type FitTier = ApiData<"/recommendations/latest", "get">["fitTier"];

// Source: Notion "Fit Tier Rules v1.2", section 1. Every result carries this
// line, word for word. Change it only when that page changes.
export const GUIDANCE_LINE =
  "This is guidance from what you told us and what the issuer publishes. It is not a guarantee. Issuers also weigh things this tool does not score, including your income. The issuer's own preapproval check is the real test.";

// The line under the result, from Figma 61:2851. Ben chose it over
// GUIDANCE_LINE for the result screen on 2026-10-16, to refine over time.
// The Notion rules still ask for GUIDANCE_LINE on every result: update that
// page or bring it back when the wording is settled.
export const RESULT_DISCLAIMER = "Recommendations are educational, not financial advice.";

// Shown when no listed card fits and the rules gave no reason of their own.
export const NO_CARD_FALLBACK = "None of the cards we list fits what you told us yet.";

// The next step on a result with no card ("Not quite yet"). The first is the
// authorized-user option from the denial plan's "Build credit another way",
// the only one there that needs no income of the student's own; Capital One,
// "Do authorized users build credit?", checked 2026-10-25: it "may help you
// build credit", if the issuer reports it, and late payments by the cardholder
// can hurt (https://www.capitalone.com/learn-grow/money-management/do-authorized-users-build-credit/).
// The second follows the income rules (G1, G2): their own income or savings.
export const NOT_YET_NEXT_STEPS = {
  title: "What you can do now",
  authorizedUser:
    "Ask a family member to add you as an authorized user on their card. If the issuer reports it and they pay on time, it can start your credit history.",
  // Before and as the link to the quiz.
  ownIncome: "When you have income or savings of your own, ",
  ownIncomeLink: "take the quiz again",
} as const;

// Source: Notion "Fit Tier Rules v1.2", section 1.
export const TIER_LABELS: Record<FitTier, string> = {
  likely_fit: "Likely fit",
  stretch: "Stretch",
  not_yet: "Not yet",
};

// The header on the result screen (Figma 397:822 draws "Maya, here’s your
// match"; we do not collect names, so it is left out). It follows the tier, so
// a stretch or a not yet is never introduced as a sure match.
export const RESULT_HEADLINES: Record<FitTier, string> = {
  likely_fit: "Here’s your match",
  stretch: "A card that could work",
  not_yet: "Not quite yet",
};

// The card's name as students know it, with the brand in front when the
// catalog name leaves it out ("Platinum Secured" -> "Capital One Platinum Secured").
export function cardDisplayName(card: { brand: string; name: string }): string {
  return card.name.toLowerCase().startsWith(card.brand.toLowerCase()) ? card.name : `${card.brand} ${card.name}`;
}

// The small line above the card name on the result frame ("Secured credit card").
export function cardTypeLabel(card: { secured: boolean; studentsOnly: boolean }): string {
  if (card.secured) return "Secured credit card";
  if (card.studentsOnly) return "Student credit card";
  return "Credit card";
}

// The result card's "Why it's right for you" (Ben, 2026-11-07): at most three
// large lines, approval, value and bonus, each with an optional smaller detail.
// Taral said the result told her why a card was great, not why it was good for
// her; nobody noticed the Likely fit label. No small print as the main message.
export const WHY_TITLE = "Why it’s right for you";

// Under the cards whenever one shows an estimate. RESULT_DISCLAIMER stays too.
export const ESTIMATE_DISCLAIMER = "An estimate from what you told us, not a promise.";

export const APPROVAL_LINES = {
  likely_fit: "You’re likely to be approved",
  stretch: "Approval is less certain for you",
} as const;

export const BONUS_OUT_OF_REACH = "Likely out of reach at your spending";

export const MATCH_LINE = "Cashback Match doubles your first year’s cash back";

// How the picked areas read in "From your groceries and dining".
const AREA_WORDS: Record<SpendingCategoryId, string> = {
  "food-and-dining": "dining",
  groceries: "groceries",
  "gas-and-rides": "gas and rides",
  "travel-home": "trips home",
  "shopping-and-subscriptions": "shopping",
};

export type WhyLine = {
  id: "approval" | "value" | "bonus";
  // A check for good news, an info mark for a caution.
  mark: "check" | "info";
  text: string;
  // Part of text set in the number font ("$48").
  amount: string | null;
  detail: string | null;
};

// An estimate in whole dollars: "About $48", never "$47.63".
function aboutDollars(cents: number): string {
  return moneyAmount(Math.round(cents / 100) * 100);
}

// The value line alone, for the card page.
export function valueLine(estimate: YearOneEstimate | null): WhyLine | null {
  if (!estimate) return null;
  const areas = estimate.drivers.map((id) => AREA_WORDS[id]);
  const from = areas.length > 0 ? `From your ${areas.join(" and ")}` : "On everything you buy";
  if (estimate.rewardsCents !== null) {
    const cents = estimate.rewardsCents + estimate.matchCents;
    if (Math.round(cents / 100) <= 0) return null;
    const amount = aboutDollars(cents);
    const detail = estimate.matchCents > 0 ? `${from}, with Cashback Match` : from;
    return { id: "value", mark: "check", text: `About ${amount} in your first year`, amount, detail };
  }
  if (estimate.points !== null && estimate.points > 0) {
    const amount = `${estimate.points.toLocaleString("en-US")} points`;
    return { id: "value", mark: "check", text: `About ${amount} in your first year`, amount, detail: from };
  }
  return null;
}

function bonusLine(rewards: CardRewards | null, estimate: YearOneEstimate | null): WhyLine | null {
  const bonus = rewards?.bonus;
  if (!rewards || !bonus) return null;
  if (isCashbackMatch(rewards)) {
    // With an estimate the match is already in the value line.
    return estimate && estimate.matchCents > 0 ? null : { id: "bonus", mark: "check", text: MATCH_LINE, amount: null, detail: null };
  }
  const reachable = estimate?.bonus?.reachable ?? true;
  const mark = reachable ? "check" : "info";
  const detail = reachable ? null : BONUS_OUT_OF_REACH;
  const { valueCents, spendCents, withinDays } = bonus;
  if (valueCents !== null && spendCents !== null && withinDays !== null) {
    const amount = moneyAmount(valueCents);
    return { id: "bonus", mark, text: `${amount} sign-up bonus after ${moneyAmount(spendCents)} in ${withinDays} days`, amount, detail };
  }
  // Not a simple spend target (Chase's autopay credit): a short line, with
  // the issuer's words as the detail so the condition is never hidden.
  if (valueCents !== null) {
    const amount = moneyAmount(valueCents);
    if (bonus.resultLine) return { id: "bonus", mark, text: bonus.resultLine.text, amount, detail: detail ?? bonus.resultLine.detail };
    return { id: "bonus", mark, text: `${amount} sign-up bonus`, amount, detail: detail ?? bonus.summary };
  }
  return { id: "bonus", mark, text: bonus.summary, amount: null, detail };
}

export function whyLines(option: { fit: CardFit; rewards: CardRewards | null; estimate: YearOneEstimate | null }): WhyLine[] {
  const { fit, rewards, estimate } = option;
  const likely = fit.tier === "likely_fit";
  const approval: WhyLine = {
    id: "approval",
    mark: likely ? "check" : "info",
    text: likely ? APPROVAL_LINES.likely_fit : APPROVAL_LINES.stretch,
    amount: null,
    detail: fit.reasons[0] ?? null,
  };
  return [approval, valueLine(estimate), bonusLine(rewards, estimate)].filter((line): line is WhyLine => line !== null);
}

// A rate as the card page lists it: "3%" cash back, "3x" points per $1.
export function rateAmount(rate: { amount: number; unit: "percent" | "points_per_dollar" }): string {
  return rate.unit === "percent" ? `${rate.amount}%` : `${rate.amount}x`;
}
