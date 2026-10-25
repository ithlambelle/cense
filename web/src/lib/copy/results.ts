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
  ownIncome: "When you have income or savings of your own, take the quiz again.",
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
