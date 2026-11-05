// What each recommended card earns and its sign-up bonus, for the card's page
// (Ben, Oct 29). Kept apart from cards.json like deposit.ts: these are display
// facts, not inputs to the fit rules, and they change often, so editing them
// never changes a saved recommendation's card data version.
//
// Every value is in the issuer's own terms, read on the issuer's page listed
// as sourceUrl on verifiedAt. Change a value only after re-reading that page.
// Where the page gives no number (Discover's quarterly maximum), there is no
// number here either.

export type RewardRate = {
  // 3 means 3% cash back, or 3 points per $1 for a points card
  amount: number;
  unit: "percent" | "points_per_dollar";
  // where it applies, as the issuer words it
  category: string;
  // a cap, an activation step or another condition on the issuer's page
  condition: string | null;
};

export type SignUpBonus = {
  // one line a student can read
  summary: string;
  // the bonus in cents when the issuer states a dollar value, else null
  valueCents: number | null;
  // what to spend, and in how many days, when the issuer says
  spendCents: number | null;
  withinDays: number | null;
};

export type CardRewards = {
  kind: "cash_back" | "points" | "none";
  rates: RewardRate[];
  bonus: SignUpBonus | null;
  // official card art in web/public, or null when the issuer has none without
  // an ad printed on it (Chime's page shows a photo, not the card)
  image: string | null;
  sourceUrl: string;
  verifiedAt: string;
};

const CHECKED = "2026-11-04";

export const CARD_REWARDS: Readonly<Record<string, CardRewards>> = {
  "capital-one-savor-students": {
    kind: "cash_back",
    rates: [
      { amount: 8, unit: "percent", category: "Capital One Entertainment purchases", condition: null },
      { amount: 5, unit: "percent", category: "Hotels, vacation rentals and rental cars booked through Capital One Travel", condition: null },
      { amount: 3, unit: "percent", category: "Grocery stores, dining, entertainment and popular streaming services", condition: "Grocery stores exclude superstores like Walmart and Target." },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null },
    ],
    bonus: { summary: "$50 cash bonus once you spend $100 on purchases within 3 months from account opening.", valueCents: 5_000, spendCents: 10_000, withinDays: 90 },
    image: "/cards/capital-one-savor-students.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/savor-student/",
    verifiedAt: CHECKED,
  },
  "capital-one-quicksilver-students": {
    kind: "cash_back",
    rates: [{ amount: 1.5, unit: "percent", category: "Every purchase", condition: null }],
    bonus: { summary: "$50 cash bonus once you spend $100 on purchases within 3 months from account opening.", valueCents: 5_000, spendCents: 10_000, withinDays: 90 },
    image: "/cards/capital-one-quicksilver-students.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/quicksilver-student/",
    verifiedAt: CHECKED,
  },
  "capital-one-platinum": {
    kind: "none",
    rates: [],
    bonus: null,
    image: "/cards/capital-one-platinum.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/platinum/",
    verifiedAt: CHECKED,
  },
  "capital-one-platinum-secured": {
    kind: "none",
    rates: [],
    bonus: null,
    image: "/cards/capital-one-platinum-secured.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/platinum-secured/",
    verifiedAt: CHECKED,
  },
  "discover-it-student-cash-back": {
    kind: "cash_back",
    rates: [
      { amount: 5, unit: "percent", category: "Everyday purchases at places that change each quarter, like grocery stores, restaurants and gas stations", condition: "Up to the quarterly maximum, when you activate each quarter." },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null },
    ],
    bonus: { summary: "Cashback Match: Discover matches all the cash back you earn in your first year, dollar for dollar, with no limit.", valueCents: null, spendCents: null, withinDays: 365 },
    image: "/cards/discover-it-student-cash-back.png",
    sourceUrl: "https://www.discover.com/credit-cards/student-credit-card/it-card/",
    verifiedAt: CHECKED,
  },
  "discover-it-student-chrome": {
    kind: "cash_back",
    rates: [
      { amount: 2, unit: "percent", category: "Gas stations and restaurants", condition: "On up to $1,000 in combined purchases each quarter." },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null },
    ],
    bonus: { summary: "Cashback Match: Discover matches all the cash back you earn in your first year, dollar for dollar, with no limit.", valueCents: null, spendCents: null, withinDays: 365 },
    image: "/cards/discover-it-student-chrome.png",
    sourceUrl: "https://www.discover.com/credit-cards/student-credit-card/chrome-card/",
    verifiedAt: CHECKED,
  },
  "discover-it-secured-cash-back": {
    kind: "cash_back",
    rates: [
      { amount: 5, unit: "percent", category: "Everyday purchases at places that change each quarter", condition: "Up to the quarterly maximum, when you activate each quarter." },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null },
    ],
    bonus: { summary: "Cashback Match: Discover matches all the cash back you earn in your first year, dollar for dollar, with no limit.", valueCents: null, spendCents: null, withinDays: 365 },
    image: "/cards/discover-it-secured-cash-back.png",
    sourceUrl: "https://www.discover.com/credit-cards/secured-credit-card/",
    verifiedAt: CHECKED,
  },
  "chime-card": {
    kind: "cash_back",
    rates: [
      {
        amount: 5,
        unit: "percent",
        category: "A category you choose",
        condition: "5% as a Chime Prime member ($3,000+ in qualifying direct deposits in the past 34 days), 2% as a Chime Plus member. On up to $1,500 of eligible purchases.",
      },
    ],
    bonus: null,
    image: null,
    sourceUrl: "https://www.chime.com/credit/credit-builder/",
    verifiedAt: CHECKED,
  },
  "chase-freedom-rise": {
    kind: "cash_back",
    rates: [{ amount: 1.5, unit: "percent", category: "Every purchase", condition: null }],
    bonus: {
      summary: "$25 statement credit when you sign up for automatic payments within the first 3 months and stay enrolled for at least 90 days.",
      valueCents: 2_500,
      spendCents: null,
      withinDays: 90,
    },
    image: "/cards/chase-freedom-rise.png",
    sourceUrl: "https://www.chase.com/personal/credit-cards/freedom/rise",
    verifiedAt: CHECKED,
  },
  "bofa-customized-cash-students": {
    kind: "cash_back",
    rates: [
      {
        amount: 3,
        unit: "percent",
        category: "A category you choose: gas and EV charging, online shopping, dining, travel, drug stores, or home improvement",
        condition: "6% in the first year from account opening. 3% and 2% apply to the first $2,500 in combined choice category and grocery purchases each quarter, then 1%.",
      },
      { amount: 2, unit: "percent", category: "Grocery stores and wholesale clubs", condition: "Within the same $2,500 quarterly maximum." },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null },
    ],
    bonus: { summary: "$200 online cash rewards bonus after $1,000 in purchases in the first 90 days.", valueCents: 20_000, spendCents: 100_000, withinDays: 90 },
    // The issuer's only card art has a "NEW OFFER" banner printed on it, which
    // would outlive the offer. Left out until there is art without it.
    image: null,
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/student-cash-back-credit-card/",
    verifiedAt: CHECKED,
  },
  "bofa-unlimited-cash-students": {
    kind: "cash_back",
    rates: [{ amount: 1.5, unit: "percent", category: "All purchases", condition: null }],
    bonus: { summary: "$250 online cash rewards bonus after $1,000 in purchases in the first 90 days (limited time).", valueCents: 25_000, spendCents: 100_000, withinDays: 90 },
    // The issuer's only card art has a "NEW OFFER" banner printed on it, which
    // would outlive the offer. Left out until there is art without it.
    image: null,
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/unlimited-cash-back-student-credit-card/",
    verifiedAt: CHECKED,
  },
  "bofa-travel-rewards-students": {
    kind: "points",
    rates: [{ amount: 1.5, unit: "points_per_dollar", category: "Everyday purchases", condition: null }],
    bonus: {
      summary: "25,000 online bonus points after $1,000 in purchases in the first 90 days, redeemable for a $250 statement credit toward travel and dining.",
      valueCents: 25_000,
      spendCents: 100_000,
      withinDays: 90,
    },
    image: "/cards/bofa-travel-rewards-students.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/student-rewards-credit-card/",
    verifiedAt: CHECKED,
  },
  "bofa-bankamericard-students": {
    kind: "none",
    rates: [],
    bonus: null,
    image: "/cards/bofa-bankamericard-students.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/low-interest-student-credit-card/",
    verifiedAt: CHECKED,
  },
};

// The card's rewards, or null for a card not covered yet (the explore cards).
export function cardRewards(cardId: string): CardRewards | null {
  return CARD_REWARDS[cardId] ?? null;
}
