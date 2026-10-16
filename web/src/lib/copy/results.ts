import type { ApiData } from "../api-client/client";

export type FitTier = ApiData<"/recommendations/latest", "get">["fitTier"];

// Source: Notion "Fit Tier Rules v1.0", section 1. Every result carries this
// line, word for word. Change it only when that page changes.
export const GUIDANCE_LINE =
  "This is guidance from what you told us and what the issuer publishes. It is not a guarantee. Issuers also weigh things this tool does not score, including your income. The issuer's own preapproval check is the real test.";

// Source: Notion "Fit Tier Rules v1.0", section 1.
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
