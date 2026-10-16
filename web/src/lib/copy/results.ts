import type { ApiData } from "../api-client/client";

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

// Source: Notion "Fit Tier Rules v1.2", section 1.
export const TIER_LABELS: Record<FitTier, string> = {
  likely_fit: "Likely fit",
  stretch: "Stretch",
  not_yet: "Not yet",
};

// The headline follows the tier, so a stretch or a not yet is never
// introduced as a great fit. Not from the hi-fi, which draws one outcome.
export const RESULT_HEADLINES: Record<FitTier, string> = {
  likely_fit: "Here’s a great place to start",
  stretch: "A card that could work",
  not_yet: "Not quite yet",
};

// Whole cents to a short fee line. Never implies a card is free of other costs.
export function annualFeeLine(annualFeeCents: number): string {
  if (annualFeeCents === 0) return "No annual fee";
  const dollars = annualFeeCents / 100;
  const amount = Number.isInteger(dollars) ? dollars.toString() : dollars.toFixed(2);
  return `$${amount} annual fee`;
}

type CardFacts = {
  secured: boolean;
  studentsOnly: boolean;
  depositMinCents: number;
  conditions: { kind: string; text: string }[];
};

// The small line above the card name on the result frame ("Secured credit card").
export function cardTypeLabel(card: CardFacts): string {
  if (card.secured) return "Secured credit card";
  if (card.studentsOnly) return "Student credit card";
  return "Credit card";
}

// The line under the card name. Built only from catalog facts; null when there
// is nothing more to say than the type label.
export function cardDescription(card: CardFacts): string | null {
  const limit = card.conditions.find((condition) => condition.kind === "limit_equals_money_moved");
  if (limit) return limit.text;
  if (card.secured && card.depositMinCents > 0) return "A refundable deposit backs the card.";
  if (card.studentsOnly) return "Made for college students.";
  return null;
}
