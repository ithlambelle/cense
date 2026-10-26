import type { Card } from "./catalog";

// What the deposit on a secured card is, in one line on the card's page: the
// designers' own words from the result frame ("A refundable deposit backs the
// card.", Figma 397:847), then when it comes back. "Refundable" only where the
// issuer's own page says so; each entry below was checked on that page on
// 2026-10-25. Not listed, on purpose:
// - Bank of America's four secured cards: their pages say only that you "may
//   qualify to have your security deposit returned" after a review, and "Not
//   all customers will qualify". Their line uses the catalog's own review
//   condition instead.
// - The Chime Card: no deposit (money moved in is the limit), so no line.
// Kept apart from cards.json: these are display facts, not inputs to the fit
// rules, whose catalog conditions mirror the rules page.
export type DepositRefund = { whenBack: string; sourceUrl: string; verifiedAt: string };

export const DEPOSIT_REFUNDS: Readonly<Record<string, DepositRefund>> = {
  "capital-one-platinum-secured": {
    whenBack: "You get it back when you close the account and pay the balance in full, or when Capital One upgrades you to an unsecured card.",
    sourceUrl: "https://www.capitalone.com/credit-cards/platinum-secured/",
    verifiedAt: "2026-10-25",
  },
  "capital-one-quicksilver-secured": {
    whenBack: "You get it back when you close the account and pay the balance in full, or when Capital One upgrades you to the unsecured Quicksilver card.",
    sourceUrl: "https://www.capitalone.com/credit-cards/quicksilver-secured/",
    verifiedAt: "2026-10-25",
  },
  "discover-it-secured-cash-back": {
    whenBack: "You get it back when you close the account and pay the balance in full, or when Discover moves you to its regular card.",
    sourceUrl: "https://www.discover.com/credit-cards/secured-credit-card/",
    verifiedAt: "2026-10-25",
  },
  "citi-secured": {
    whenBack: "Citi generally returns it when you close the account in good standing with the balance paid in full.",
    sourceUrl: "https://www.citi.com/credit-cards/citi-secured-credit-card",
    verifiedAt: "2026-10-25",
  },
  "us-bank-secured-visa": {
    whenBack: "U.S. Bank returns it if the account is upgraded or closed.",
    sourceUrl: "https://www.usbank.com/credit-cards/secured-visa-credit-card.html",
    verifiedAt: "2026-10-25",
  },
  "us-bank-altitude-go-secured": {
    whenBack: "U.S. Bank returns it if it moves you to the regular card.",
    sourceUrl: "https://www.usbank.com/credit-cards/altitude-go-secured-visa-credit-card.html",
    verifiedAt: "2026-10-25",
  },
  "us-bank-cash-plus-secured": {
    whenBack: "U.S. Bank returns it if it moves you to the regular card.",
    sourceUrl: "https://www.usbank.com/credit-cards/cash-plus-secured-visa-credit-card.html",
    verifiedAt: "2026-10-25",
  },
};

// Secured cards with a deposit whose issuer does not say it is refundable.
export const DEPOSIT_NOT_CALLED_REFUNDABLE = [
  "bofa-bankamericard-secured",
  "bofa-customized-cash-secured",
  "bofa-unlimited-cash-secured",
  "bofa-travel-rewards-secured",
] as const;

// The line for a card's page, or null for a card with no deposit.
export function depositLine(card: Pick<Card, "id" | "secured" | "depositMinCents" | "conditions">): string | null {
  if (!card.secured || card.depositMinCents <= 0) return null;
  const refund = DEPOSIT_REFUNDS[card.id];
  if (refund) return `A refundable deposit backs the card. ${refund.whenBack}`;
  const review = card.conditions.find((condition) => condition.kind === "graduation_review");
  return review ? `A deposit backs the card. ${review.text}` : "A deposit backs the card.";
}
