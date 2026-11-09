import type { Acknowledged } from "./match";

// Things a person has looked at once and decided the weekly card data check
// should stop raising, by card id. Keep this list short and give every entry
// its reason: each one is a place the check no longer looks for you.
//
// - notThisCard: a figure on the card's page that is not this card's reward.
//   Dropped only while the page's wording around it stays the same.
// - notReadable: a stored rate the issuer states only where the check cannot
//   read it. The check skips it until the stored rate itself changes, and the
//   report lists it under "Not checked automatically"; the 120-day re-read
//   (rewards.test.ts) still covers it.
const DISCOVER_SECURED_TERMS =
  "Discover's secured card page has no rates and rewards pop-up for the check to open, unlike the other Discover pages; re-read this rate in the card's terms by hand.";

export const ACKNOWLEDGED: Readonly<Record<string, Acknowledged>> = {
  "discover-it-secured-cash-back": {
    notReadable: [
      { figure: "5%", category: "Capital One Entertainment purchases", why: DISCOVER_SECURED_TERMS },
      { figure: "5%", category: "booked through Capital One Travel", why: DISCOVER_SECURED_TERMS },
    ],
  },
};
