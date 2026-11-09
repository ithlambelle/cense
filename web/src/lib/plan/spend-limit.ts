// The suggested monthly spending limit on the first-month plan (US-04): 30% of
// the card's credit limit. A guide, not a hard stop, and lower is better.
//
// Where the 30% comes from (each page read on SPEND_LIMIT_VERIFIED_AT):
// - CFPB: experts advise using no more than 30 percent of your total credit
//   limit.
// - Experian: 30% is the point where a balance starts to have a more
//   pronounced negative effect on a credit score.
//
// Rounded down to whole dollars, so the suggestion never goes over 30%.

export const SPEND_LIMIT_PERCENT = 30;

export const SPEND_LIMIT_SOURCE = {
  name: "CFPB",
  url: "https://www.consumerfinance.gov/ask-cfpb/how-do-i-get-and-keep-a-good-credit-score-en-318/",
} as const;

export const SPEND_LIMIT_SOURCES = [
  SPEND_LIMIT_SOURCE,
  {
    name: "Experian",
    url: "https://www.experian.com/blogs/ask-experian/credit-education/score-basics/credit-utilization-rate/",
  },
] as const;

export const SPEND_LIMIT_VERIFIED_AT = "2026-11-03";

// The suggested monthly limit in whole cents, or null when there is no credit
// limit to work from (setup skipped, or a limit of $0).
export function suggestedSpendLimitCents(creditLimitCents: number | null): number | null {
  if (creditLimitCents === null || !Number.isInteger(creditLimitCents) || creditLimitCents <= 0) return null;
  const exact = Math.floor((creditLimitCents * SPEND_LIMIT_PERCENT) / 100);
  const wholeDollars = Math.floor(exact / 100) * 100;
  // A limit under about $4 has no whole dollar to suggest: keep the cents.
  return wholeDollars > 0 ? wholeDollars : exact;
}

// "Pick your limit" (S3, Figma 477:1149) offers a tighter choice beside the
// suggestion: 20% of the credit limit ($100 on $500), rounded the same way.
// Null without a limit, or when it would not be below the suggestion.
export const TIGHTER_SPEND_LIMIT_PERCENT = 20;

export function tighterSpendLimitCents(creditLimitCents: number | null): number | null {
  const suggested = suggestedSpendLimitCents(creditLimitCents);
  if (suggested === null || creditLimitCents === null) return null;
  const exact = Math.floor((creditLimitCents * TIGHTER_SPEND_LIMIT_PERCENT) / 100);
  const wholeDollars = Math.floor(exact / 100) * 100;
  const tighter = wholeDollars > 0 ? wholeDollars : exact;
  return tighter > 0 && tighter < suggested ? tighter : null;
}
