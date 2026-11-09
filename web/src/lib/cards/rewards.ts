// What each card in the catalog earns and its sign-up bonus, for the card's
// page and for estimating a student's first-year value (Ben, Oct 29). Kept
// apart from cards.json like deposit.ts: they never change a card's tier. Since
// fit rules v1.3 the first-year value built from them breaks the last ties in
// the card order, so save.ts hashes them into card_data_version: editing a rate
// or bonus changes it.
//
// Every value is in the issuer's own terms, read on the issuer's page listed
// as sourceUrl on verifiedAt, including the rewards terms that page links to
// (Capital One's "Rewards terms", Discover's rates and rewards pop-up, Bank of
// America's Terms and Conditions). Those terms list rates the page body can
// leave out, such as the Capital One Travel and Entertainment rates. Change a
// value only after re-reading them. Where the issuer gives no number, there
// is no number here either.
//
// How issuer categories map to the quiz's spending categories (earnsOn). The
// rule is to never overstate: when a category is unclear, it is left out and
// the card's base rate applies to that spending instead.
// - dining, restaurants, takeout, food delivery, fast food -> food-and-dining
// - supermarkets, grocery stores, wholesale clubs -> groceries, even with a
//   superstore exclusion, but not when limited to a named store
// - gas stations and EV charging, alone or with rideshare and transit ->
//   gas-and-rides. Rideshare and transit without gas (U.S. Bank Cash+ ground
//   transportation) are not mapped: for a student who drives, gas is most of
//   that spending, and the rides rate would be counted on it.
// - travel, airfare and hotels booked through any channel -> travel-home.
//   Travel only through the issuer's own portal (Capital One Travel, Chase
//   Travel, Citi Travel, the U.S. Bank Travel Center) earns on nothing here.
// - online shopping, online retail, streaming services -> shopping-and-subscriptions
// - anything else (drug stores, home improvement, entertainment, phone plans,
//   utilities, named merchants, issuer portals) -> not mapped
// A rate covering several issuer categories maps to the union of the mapped
// ones. Rotating quarterly categories map to nothing and set rotating, since
// the student cannot know them in advance.

// The quiz's spending categories (SPENDING_CATEGORIES in quiz/spending.ts).
export type SpendingCategoryId =
  | "food-and-dining"
  | "groceries"
  | "gas-and-rides"
  | "travel-home"
  | "shopping-and-subscriptions";

export type RewardCap = {
  // the most spending that earns this rate in each period, in cents
  cents: number;
  per: "month" | "quarter" | "year";
  // the category of the other rate(s) sharing this cap, or null
  sharedWith: string | null;
};

export type RewardRate = {
  // 3 means 3% cash back, or 3 points (or miles) per $1 for a points card
  amount: number;
  unit: "percent" | "points_per_dollar";
  // where it applies, as the issuer words it
  category: string;
  // a cap, an activation step or another condition on the issuer's page
  condition: string | null;
  // the quiz categories this rate is earned on; "all" is the card's base rate
  // on everything else
  earnsOn: SpendingCategoryId[] | "all";
  // the student chooses one (or, where the category says so, two) of earnsOn
  pickOne: boolean;
  // categories change each quarter and need activation: not counted in estimates
  rotating: boolean;
  // a condition the student may not meet, like a direct deposit, or null
  requires: string | null;
  // the rate in the first year when the issuer states a different one, else null
  yearOneAmount: number | null;
  // the spend cap on this rate where the issuer states one, else null
  cap: RewardCap | null;
};

export type SignUpBonus = {
  // one line a student can read
  summary: string;
  // the bonus in cents when the issuer states a dollar value, else null
  valueCents: number | null;
  // what to spend, and in how many days, when the issuer says
  spendCents: number | null;
  withinDays: number | null;
  // how the result states a bonus that is not a spend target, in the
  // issuer's own terms, kept short; null for a spend target or a match
  resultLine?: { text: string; detail: string };
};

export type CardRewards = {
  kind: "cash_back" | "points" | "none";
  rates: RewardRate[];
  bonus: SignUpBonus | null;
  // cents per point when the issuer states a cash or statement credit value
  // for points; null for cash back, or when the issuer states none
  pointValueCents: number | null;
  // official card art in web/public, or null when the issuer has none without
  // an ad printed on it (Chime's page shows a photo, not the card)
  image: string | null;
  sourceUrl: string;
  verifiedAt: string;
};

// Most rates are earned on fixed categories with no cap or condition.
const FIXED = { pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null } as const;

// All 53 cards were read on READ: the 40 explore cards for the first time, and
// the 13 recommended cards (first read on 2026-11-04) again in an independent
// audit of every field against the issuer's page and its rewards terms.
const READ = "2026-11-07";

// Capital One's rewards terms, worded the same on every card that earns them
// (Capital One cards, and Discover cards since Capital One bought Discover).
const C1_ENTERTAINMENT = "Capital One Entertainment purchases";
const C1_ENTERTAINMENT_CONDITION = "Tickets purchased on the Capital One Entertainment ticketing platform only.";
const C1_TRAVEL = "Hotels, vacation rentals and rental cars booked through Capital One Travel";
const C1_TRAVEL_WITH_ACTIVITIES = "Hotels, vacation rentals, rental cars and activities booked through Capital One Travel";

export const CARD_REWARDS: Readonly<Record<string, CardRewards>> = {
  "capital-one-savor-students": {
    kind: "cash_back",
    rates: [
      { amount: 8, unit: "percent", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      { amount: 5, unit: "percent", category: C1_TRAVEL, condition: null, earnsOn: [], ...FIXED },
      {
        amount: 3,
        unit: "percent",
        category: "Grocery stores, dining, entertainment and popular streaming services",
        condition: "Grocery stores exclude superstores like Walmart and Target.",
        earnsOn: ["food-and-dining", "groceries", "shopping-and-subscriptions"],
        ...FIXED,
      },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", ...FIXED },
    ],
    bonus: { summary: "$50 cash bonus once you spend $100 on purchases within 3 months from account opening.", valueCents: 5_000, spendCents: 10_000, withinDays: 90 },
    pointValueCents: null,
    image: "/cards/capital-one-savor-students.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/savor-student/",
    verifiedAt: READ,
  },
  "capital-one-quicksilver-students": {
    kind: "cash_back",
    // The two 5% rates are in the page's Rewards terms, not its body.
    rates: [
      { amount: 5, unit: "percent", category: C1_TRAVEL, condition: null, earnsOn: [], ...FIXED },
      { amount: 5, unit: "percent", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      { amount: 1.5, unit: "percent", category: "Every purchase", condition: null, earnsOn: "all", ...FIXED },
    ],
    bonus: { summary: "$50 cash bonus once you spend $100 on purchases within 3 months from account opening.", valueCents: 5_000, spendCents: 10_000, withinDays: 90 },
    pointValueCents: null,
    image: "/cards/capital-one-quicksilver-students.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/quicksilver-student/",
    verifiedAt: READ,
  },
  "capital-one-platinum": {
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    image: "/cards/capital-one-platinum.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/platinum/",
    verifiedAt: READ,
  },
  "capital-one-platinum-secured": {
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    image: "/cards/capital-one-platinum-secured.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/platinum-secured/",
    verifiedAt: READ,
  },
  "discover-it-student-cash-back": {
    kind: "cash_back",
    rates: [
      {
        amount: 5,
        unit: "percent",
        category: "Everyday purchases at places that change each quarter, like grocery stores, restaurants and gas stations",
        condition: "On up to $1,500 in purchases each quarter when you activate, then 1%.",
        earnsOn: [],
        ...FIXED,
        rotating: true,
        // The card's terms say only "the quarterly maximum"; Discover's
        // cashback calendar page states "up to $1,500 ... each quarter".
        cap: { cents: 150_000, per: "quarter", sharedWith: null },
      },
      { amount: 5, unit: "percent", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      { amount: 5, unit: "percent", category: C1_TRAVEL_WITH_ACTIVITIES, condition: null, earnsOn: [], ...FIXED },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", ...FIXED },
    ],
    bonus: { summary: "Cashback Match: Discover matches all the cash back you earn in your first year, dollar for dollar, with no limit.", valueCents: null, spendCents: null, withinDays: 365 },
    pointValueCents: null,
    // Discover's own art (cardart-student-it-iridescent-shadow.png), without
    // the decorative disc behind the card in the earlier image.
    image: "/cards/discover-it-student-cash-back.png",
    sourceUrl: "https://www.discover.com/credit-cards/student-credit-card/it-card/",
    verifiedAt: READ,
  },
  "discover-it-student-chrome": {
    kind: "cash_back",
    rates: [
      { amount: 5, unit: "percent", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      { amount: 5, unit: "percent", category: C1_TRAVEL_WITH_ACTIVITIES, condition: null, earnsOn: [], ...FIXED },
      {
        amount: 2,
        unit: "percent",
        category: "Gas stations and restaurants",
        condition: "On up to $1,000 in combined purchases each quarter.",
        earnsOn: ["gas-and-rides", "food-and-dining"],
        ...FIXED,
        cap: { cents: 100_000, per: "quarter", sharedWith: null },
      },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", ...FIXED },
    ],
    bonus: { summary: "Cashback Match: Discover matches all the cash back you earn in your first year, dollar for dollar, with no limit.", valueCents: null, spendCents: null, withinDays: 365 },
    pointValueCents: null,
    image: "/cards/discover-it-student-chrome.png",
    sourceUrl: "https://www.discover.com/credit-cards/student-credit-card/chrome-card/",
    verifiedAt: READ,
  },
  "discover-it-secured-cash-back": {
    kind: "cash_back",
    rates: [
      {
        amount: 5,
        unit: "percent",
        category: "Everyday purchases at places that change each quarter",
        condition: "On up to $1,500 in purchases each quarter when you activate, then 1%.",
        earnsOn: [],
        ...FIXED,
        rotating: true,
        // As the student card: the $1,500 is on Discover's cashback calendar page.
        cap: { cents: 150_000, per: "quarter", sharedWith: null },
      },
      { amount: 5, unit: "percent", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      // This card's terms leave activities out of the Capital One Travel rate.
      { amount: 5, unit: "percent", category: C1_TRAVEL, condition: null, earnsOn: [], ...FIXED },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", ...FIXED },
    ],
    bonus: { summary: "Cashback Match: Discover matches all the cash back you earn in your first year, dollar for dollar, with no limit.", valueCents: null, spendCents: null, withinDays: 365 },
    pointValueCents: null,
    image: "/cards/discover-it-secured-cash-back.png",
    sourceUrl: "https://www.discover.com/credit-cards/secured-credit-card/",
    verifiedAt: READ,
  },
  "chime-card": {
    kind: "cash_back",
    // Read on chime.com/credit/chime-card/ and its Cash Rewards Program
    // Addendum. The categories, as Chime words them: "Utilities and bills"
    // (streaming services, utilities bills and more), "Groceries" (supermarkets
    // and grocery stores), "Gas" (at-the-pump purchases), "Travel and more"
    // (flights, hotels, car rentals, ride shares, restaurants). The member
    // selects one each calendar month; purchases outside it earn nothing, and
    // without Prime or Plus there is no cash back.
    rates: [
      {
        amount: 5,
        unit: "percent",
        category: "A category you choose",
        condition: "5% as a Chime Prime member ($3,000+ in qualifying direct deposits in the past 34 days), 2% as a Chime Plus member. On up to $1,500 of eligible purchases.",
        earnsOn: ["food-and-dining", "groceries", "gas-and-rides", "travel-home", "shopping-and-subscriptions"],
        pickOne: true,
        rotating: false,
        requires: "Chime Prime: $3,000+ in qualifying direct deposits to your Chime Checking Account in the past 34 days",
        yearOneAmount: null,
        // Addendum: "$1,500.00 in Eligible Purchases per calendar month". Prime
        // and Plus are alternative tiers, so the two rates do not share a cap.
        cap: { cents: 150_000, per: "month", sharedWith: null },
      },
      {
        amount: 2,
        unit: "percent",
        category: "A category you choose",
        condition: "2% as a Chime Plus member. On up to $1,500 of eligible purchases each calendar month.",
        earnsOn: ["food-and-dining", "groceries", "gas-and-rides", "travel-home", "shopping-and-subscriptions"],
        pickOne: true,
        rotating: false,
        requires: "Chime Plus: a single $200+ qualifying direct deposit, or $400+ in cumulative qualifying direct deposits to your Chime Checking Account in the preceding 34 days",
        yearOneAmount: null,
        cap: { cents: 150_000, per: "month", sharedWith: null },
      },
    ],
    bonus: null,
    pointValueCents: null,
    // chime.com shows the card only in phone mockups or a three-card stack, and
    // Chime's press kit is hosted off chime.com (brandfolder.com).
    image: null,
    // The Chime Card's own page. The Credit Builder page (the catalog's
    // applyUrl) now says "Credit Builder is now Chime Card" and lists no
    // categories.
    sourceUrl: "https://www.chime.com/credit/chime-card/",
    verifiedAt: READ,
  },
  "chase-freedom-rise": {
    kind: "cash_back",
    rates: [
      {
        amount: 2,
        unit: "percent",
        category: "Lyft products and services bought in the Lyft app",
        condition: "2% total through 09/30/2027 on rideshare, bike and scooter rides, and Lyft subscriptions and memberships.",
        // A named merchant, so not mapped.
        earnsOn: [],
        ...FIXED,
      },
      { amount: 1.5, unit: "percent", category: "Every purchase", condition: null, earnsOn: "all", ...FIXED },
    ],
    bonus: {
      summary: "$25 statement credit when you sign up for automatic payments within the first 3 months and stay enrolled for at least 90 days.",
      valueCents: 2_500,
      spendCents: null,
      withinDays: 90,
      // Chase's own short form of the offer
      resultLine: { text: "$25 for enrolling in automatic payments", detail: "Sign up in your first 3 months and stay enrolled 90 days." },
    },
    pointValueCents: null,
    image: "/cards/chase-freedom-rise.png",
    sourceUrl: "https://creditcards.chase.com/cash-back-credit-cards/freedom/rise",
    verifiedAt: READ,
  },
  "bofa-customized-cash-students": {
    kind: "cash_back",
    rates: [
      {
        amount: 3,
        unit: "percent",
        category: "A category you choose: gas and EV charging stations; online shopping, including cable, internet, phone plans and streaming; dining; travel; drug stores and pharmacies; or home improvement and furnishings",
        condition: "6% in the first year from account opening (3% plus a 3% first-year bonus). 3% and 2% apply to the first $2,500 in combined choice category and grocery store and wholesale club purchases each quarter, then 1%. You can change the category once each calendar month.",
        // drug stores and home improvement map to no quiz category
        earnsOn: ["gas-and-rides", "shopping-and-subscriptions", "food-and-dining", "travel-home"],
        pickOne: true,
        rotating: false,
        requires: null,
        yearOneAmount: 6,
        cap: { cents: 250_000, per: "quarter", sharedWith: "Grocery stores and wholesale clubs" },
      },
      {
        amount: 2,
        unit: "percent",
        category: "Grocery stores and wholesale clubs",
        condition: "Within the same $2,500 quarterly maximum as the choice category, then 1%. Excludes superstores.",
        earnsOn: ["groceries"],
        ...FIXED,
        cap: {
          cents: 250_000,
          per: "quarter",
          sharedWith:
            "A category you choose: gas and EV charging stations; online shopping, including cable, internet, phone plans and streaming; dining; travel; drug stores and pharmacies; or home improvement and furnishings",
        },
      },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", ...FIXED },
    ],
    bonus: { summary: "$200 online cash rewards bonus after $1,000 in purchases in the first 90 days.", valueCents: 20_000, spendCents: 100_000, withinDays: 90 },
    pointValueCents: null,
    // The art the student page shows today, without the "NEW OFFER" banner
    // printed on its og:image.
    image: "/cards/bofa-customized-cash-students.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/student-cash-back-credit-card/",
    verifiedAt: READ,
  },
  "bofa-unlimited-cash-students": {
    kind: "cash_back",
    rates: [{ amount: 1.5, unit: "percent", category: "All purchases", condition: null, earnsOn: "all", ...FIXED }],
    bonus: { summary: "$250 online cash rewards bonus after $1,000 in purchases in the first 90 days (limited time).", valueCents: 25_000, spendCents: 100_000, withinDays: 90 },
    pointValueCents: null,
    // The art on this card's page has a "LIMITED-TIME OFFER" banner printed on
    // it, which would outlive the offer. The only clean rendition of the design
    // on bankofamerica.com is the Secured card's (bofa_cshcm_v_sky_250.png).
    image: null,
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/unlimited-cash-back-student-credit-card/",
    verifiedAt: READ,
  },
  "bofa-travel-rewards-students": {
    kind: "points",
    rates: [
      {
        amount: 3,
        unit: "points_per_dollar",
        category: "Purchases made through the Travel Center",
        condition: "Bank of America's Travel Center only (1.5 bonus points plus the 1.5 base points). Stated in the card's Terms and Conditions.",
        earnsOn: [], // issuer portal only
        ...FIXED,
      },
      { amount: 1.5, unit: "points_per_dollar", category: "Everyday purchases", condition: null, earnsOn: "all", ...FIXED },
    ],
    bonus: {
      summary: "25,000 online bonus points after $1,000 in purchases in the first 90 days, redeemable for a $250 statement credit toward travel and dining.",
      valueCents: 25_000,
      spendCents: 100_000,
      withinDays: 90,
    },
    // 25,000 points for a $250 statement credit. The Terms and Conditions: "Each
    // point redeemed for a travel credit is worth $0.01"; for cash, $0.006.
    pointValueCents: 1,
    // The Visa Signature rendition the page shows (8blm_trvsigcm_v_250x158.png).
    image: "/cards/bofa-travel-rewards-students.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/student-rewards-credit-card/",
    verifiedAt: READ,
  },
  "bofa-bankamericard-students": {
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    image: "/cards/bofa-bankamericard-students.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/low-interest-student-credit-card/",
    verifiedAt: READ,
  },

  // The explore cards.
  // Capital One group. Every rate checked against the page and the Rewards
  // terms it links to, read in the rendered page.
  "capital-one-ventureone": {
    kind: "points",
    rates: [
      {
        amount: 5,
        unit: "points_per_dollar",
        category: "Hotels, vacation rentals and rental cars booked through Capital One Travel",
        condition: null,
        earnsOn: [], // Capital One Travel portal only
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      { amount: 5, unit: "points_per_dollar", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      {
        amount: 1.25,
        unit: "points_per_dollar",
        category: "Every purchase",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    bonus: {
      summary: "20,000 bonus miles once you spend $500 on purchases within the first 3 months from account opening.",
      valueCents: null, // the page gives no dollar value for the miles
      spendCents: 50_000,
      withinDays: 90,
    },
    // Not stated as a cash or statement credit value. The Rewards terms price
    // miles only for travel booked through Capital One Travel (the cost times
    // 100); a statement credit for past travel and cash state no rate.
    pointValueCents: null,
    image: "/cards/capital-one-ventureone.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/ventureone/",
    verifiedAt: READ,
  },
  "capital-one-quicksilver": {
    kind: "cash_back",
    rates: [
      {
        amount: 5,
        unit: "percent",
        category: "Hotels, vacation rentals and rental cars booked through Capital One Travel",
        condition: null,
        earnsOn: [], // Capital One Travel portal only
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 5,
        unit: "percent",
        category: "Capital One Entertainment purchases",
        condition: "Tickets purchased on the Capital One Entertainment ticketing platform only.",
        earnsOn: [],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 1.5,
        unit: "percent",
        category: "Every purchase",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    bonus: { summary: "$200 cash bonus once you spend $500 on purchases within 3 months from account opening.", valueCents: 20_000, spendCents: 50_000, withinDays: 90 },
    pointValueCents: null,
    image: "/cards/capital-one-quicksilver.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/quicksilver/",
    verifiedAt: READ,
  },
  "capital-one-savor": {
    kind: "cash_back",
    rates: [
      {
        amount: 8,
        unit: "percent",
        category: "Capital One Entertainment purchases",
        condition: "Tickets purchased on the Capital One Entertainment ticketing platform only.",
        earnsOn: [],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 5,
        unit: "percent",
        category: "Hotels, vacation rentals and rental cars booked through Capital One Travel",
        condition: null,
        earnsOn: [], // Capital One Travel portal only
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 3,
        unit: "percent",
        category: "Grocery stores, dining, entertainment and popular streaming services",
        condition: "Grocery stores exclude superstores like Walmart and Target.",
        earnsOn: ["food-and-dining", "groceries", "shopping-and-subscriptions"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 1,
        unit: "percent",
        category: "All other purchases",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    bonus: { summary: "$200 cash bonus once you spend $500 on purchases within the first 3 months from account opening.", valueCents: 20_000, spendCents: 50_000, withinDays: 90 },
    pointValueCents: null,
    image: "/cards/capital-one-savor.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/savor/",
    verifiedAt: READ,
  },
  "capital-one-quicksilver-secured": {
    kind: "cash_back",
    // The two 5% rates are in the page's Rewards terms, not its body.
    rates: [
      { amount: 5, unit: "percent", category: C1_TRAVEL_WITH_ACTIVITIES, condition: null, earnsOn: [], ...FIXED },
      { amount: 5, unit: "percent", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      {
        amount: 1.5,
        unit: "percent",
        category: "Every purchase",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    bonus: null, // the page shows no sign-up bonus
    pointValueCents: null,
    image: "/cards/capital-one-quicksilver-secured.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/quicksilver-secured/",
    verifiedAt: READ,
  },
  "capital-one-quicksilver-good-credit": {
    kind: "cash_back",
    // The two 5% rates are in the page's Rewards terms, not its body.
    rates: [
      { amount: 5, unit: "percent", category: C1_TRAVEL_WITH_ACTIVITIES, condition: null, earnsOn: [], ...FIXED },
      { amount: 5, unit: "percent", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      {
        amount: 1.5,
        unit: "percent",
        category: "Every purchase",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    // "You'll earn the usual Quicksilver rewards, but won't be eligible for new cardmember bonus cash or 0% intro APR"
    bonus: null,
    pointValueCents: null,
    image: "/cards/capital-one-quicksilver-good-credit.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/quicksilver-good-credit/",
    verifiedAt: READ,
  },
  "capital-one-savor-good-credit": {
    kind: "cash_back",
    rates: [
      { amount: 8, unit: "percent", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      { amount: 5, unit: "percent", category: C1_TRAVEL, condition: null, earnsOn: [], ...FIXED },
      {
        amount: 3,
        unit: "percent",
        category: "Grocery stores, dining, entertainment and popular streaming services",
        condition: "Grocery stores exclude superstores like Walmart and Target.",
        earnsOn: ["food-and-dining", "groceries", "shopping-and-subscriptions"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 1,
        unit: "percent",
        category: "All other purchases",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    // "You'll earn the usual Savor grocery store, dining and entertainment rewards, but won't be eligible for new cardmember bonus cash or 0% intro APR"
    bonus: null,
    pointValueCents: null,
    image: "/cards/capital-one-savor-good-credit.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/savor-good-credit/",
    verifiedAt: READ,
  },
  "capital-one-ventureone-good-credit": {
    kind: "points",
    rates: [
      {
        amount: 5,
        unit: "points_per_dollar",
        category: "Hotels, vacation rentals and rental cars booked through Capital One Travel",
        condition: null,
        earnsOn: [], // Capital One Travel portal only
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      { amount: 5, unit: "points_per_dollar", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      {
        amount: 1.25,
        unit: "points_per_dollar",
        category: "Every purchase",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    // "You'll earn the usual VentureOne travel rewards, but won't be eligible for new cardmember bonus miles or 0% intro APR"
    bonus: null,
    // As VentureOne: no cash or statement credit value per mile is stated.
    pointValueCents: null,
    image: "/cards/capital-one-ventureone-good-credit.png",
    sourceUrl: "https://www.capitalone.com/credit-cards/ventureone-good-credit/",
    verifiedAt: READ,
  },

  "discover-it-cash-back": {
    kind: "cash_back",
    rates: [
      {
        amount: 5,
        unit: "percent",
        category: "Everyday purchases at different places you shop each quarter",
        condition: "On up to $1,500 in purchases each quarter when you activate, then 1%.",
        earnsOn: [],
        pickOne: false,
        rotating: true,
        requires: null,
        yearOneAmount: null,
        // The card's terms say only "the quarterly maximum"; Discover's
        // cashback calendar page states "up to $1,500 ... each quarter".
        cap: { cents: 150_000, per: "quarter", sharedWith: null },
      },
      { amount: 5, unit: "percent", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      { amount: 5, unit: "percent", category: C1_TRAVEL_WITH_ACTIVITIES, condition: null, earnsOn: [], ...FIXED },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    // The page shows BOTH a $200 bonus (footnote 9: "available by applying through this page") and the
    // unlimited Cashback Match for the first 365 days. The structured fields hold the $200 bonus; the match is in the summary.
    bonus: {
      summary: "$200 bonus statement credit when you spend $500 in the first 3 months, plus Cashback Match: Discover matches all the cash back you earn in your first year, with no limit.",
      valueCents: 20_000,
      spendCents: 50_000,
      withinDays: 90,
    },
    pointValueCents: null,
    image: "/cards/discover-it-cash-back.png",
    sourceUrl: "https://www.discover.com/credit-cards/cash-back/it-card/",
    verifiedAt: READ,
  },
  "discover-it-chrome": {
    kind: "cash_back",
    rates: [
      { amount: 5, unit: "percent", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      { amount: 5, unit: "percent", category: C1_TRAVEL_WITH_ACTIVITIES, condition: null, earnsOn: [], ...FIXED },
      {
        amount: 2,
        unit: "percent",
        category: "Gas stations and restaurants",
        condition: "On up to $1,000 in combined purchases each quarter, automatically.",
        earnsOn: ["gas-and-rides", "food-and-dining"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: { cents: 100_000, per: "quarter", sharedWith: null },
      },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    bonus: { summary: "Cashback Match: Discover matches all the cash back you earn in your first year, dollar for dollar, with no limit.", valueCents: null, spendCents: null, withinDays: 365 },
    pointValueCents: null,
    image: "/cards/discover-it-chrome.png",
    sourceUrl: "https://www.discover.com/credit-cards/cash-back/chrome/",
    verifiedAt: READ,
  },
  "discover-it-miles": {
    kind: "points",
    rates: [
      { amount: 5, unit: "points_per_dollar", category: C1_TRAVEL, condition: null, earnsOn: [], ...FIXED },
      { amount: 5, unit: "points_per_dollar", category: C1_ENTERTAINMENT, condition: C1_ENTERTAINMENT_CONDITION, earnsOn: [], ...FIXED },
      { amount: 1.5, unit: "points_per_dollar", category: "Travel purchases and all your everyday purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    bonus: { summary: "Discover matches all the miles you earn in your first year, mile for mile, with no limit.", valueCents: null, spendCents: null, withinDays: 365 },
    // "100 miles = $1 to redeem for cash or travel credit."
    pointValueCents: 1,
    image: "/cards/discover-it-miles.png",
    sourceUrl: "https://www.discover.com/credit-cards/travel/",
    verifiedAt: READ,
  },
  "chase-freedom-unlimited": {
    kind: "cash_back",
    rates: [
      { amount: 5, unit: "percent", category: "Travel purchased through Chase Travel", condition: null, earnsOn: [], pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
      {
        amount: 3,
        unit: "percent",
        category: "Dining at restaurants, including takeout and eligible delivery services, and drugstores",
        condition: null,
        earnsOn: ["food-and-dining"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 2,
        unit: "percent",
        category: "Lyft products and services bought in the Lyft app",
        condition: "2% total through 09/30/2027 on rideshare, bike and scooter rides, and Lyft subscriptions and memberships.",
        // A named merchant, so not mapped.
        earnsOn: [],
        ...FIXED,
      },
      { amount: 1.5, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    bonus: { summary: "$200 bonus after you spend $500 on purchases in the first 3 months from account opening.", valueCents: 20_000, spendCents: 50_000, withinDays: 90 },
    // Cash back card: the page says "each $1 in Cash Back rewards earned is equal to 100 points", but kind is cash_back so null.
    pointValueCents: null,
    image: "/cards/chase-freedom-unlimited.png",
    sourceUrl: "https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited",
    verifiedAt: READ,
  },
  "chase-freedom-flex": {
    kind: "cash_back",
    rates: [
      {
        amount: 5,
        unit: "percent",
        category: "Rotating categories each quarter you activate",
        condition: "On up to $1,500 in combined purchases in the quarterly bonus categories each quarter you activate, then 1%.",
        earnsOn: [],
        pickOne: false,
        rotating: true,
        requires: null,
        yearOneAmount: null,
        cap: { cents: 150_000, per: "quarter", sharedWith: null },
      },
      { amount: 5, unit: "percent", category: "Travel purchased through Chase Travel", condition: null, earnsOn: [], pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
      {
        amount: 3,
        unit: "percent",
        category: "Dining at restaurants, including takeout and eligible delivery services, and drugstores",
        condition: null,
        earnsOn: ["food-and-dining"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 2,
        unit: "percent",
        category: "Lyft products and services bought in the Lyft app",
        condition: "2% total through 09/30/2027 on rideshare, bike and scooter rides, and Lyft subscriptions and memberships.",
        // A named merchant, so not mapped.
        earnsOn: [],
        ...FIXED,
      },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    bonus: { summary: "$200 bonus after you spend $500 on purchases in the first 3 months from account opening.", valueCents: 20_000, spendCents: 50_000, withinDays: 90 },
    pointValueCents: null,
    image: "/cards/chase-freedom-flex.png",
    sourceUrl: "https://creditcards.chase.com/cash-back-credit-cards/freedom/flex",
    verifiedAt: READ,
  },
  "chase-slate-edge": {
    // No rewards program on the page: no annual fee, a variable APR, credit-building tools. No intro APR shown.
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    // The page's art has a "NO ANNUAL FEE" banner printed across the corner;
    // this is the same design without it, from chase.com's card-art folder
    // (unified-assets/card-art/chase-slate/slate-edge/card_slate_edge_V.png).
    image: "/cards/chase-slate-edge.png",
    sourceUrl: "https://creditcards.chase.com/credit-building-credit-cards/slate/edge",
    verifiedAt: READ,
  },
  "chase-slate": {
    // Page is live (no redirect). No rewards: 0% intro APR for 21 months on purchases and balance transfers only.
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    // The page's art has a "NO ANNUAL FEE" banner printed across the corner;
    // this is the same design without it, from chase.com's card-art folder
    // (unified-assets/card-art/chase-slate/slate/card_slate_V.png).
    image: "/cards/chase-slate.png",
    sourceUrl: "https://creditcards.chase.com/balance-transfer-credit-cards/slate",
    verifiedAt: READ,
  },

  "citi-strata": {
    kind: "points",
    rates: [
      {
        amount: 5,
        unit: "points_per_dollar",
        category: "Hotels, car rentals and attractions booked through Citi Travel via cititravel.com",
        condition: null,
        // Citi Travel portal only.
        earnsOn: [],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 3,
        unit: "points_per_dollar",
        category: "Supermarkets",
        condition: "Excludes general merchandise and discount superstores, warehouse clubs and convenience stores. No spending cap stated.",
        earnsOn: ["groceries"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 3,
        unit: "points_per_dollar",
        category: "Gas & EV Charging Stations and Select Transit",
        condition: "Select transit includes car rentals, ferries, commuter and passenger railways, subways, taxis, limousines and car services, bridge and road tolls, parking, bus lines and RV rentals. No spending cap stated.",
        earnsOn: ["gas-and-rides"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 3,
        unit: "points_per_dollar",
        category: "An eligible Self-Select Category of your choice: Fitness Clubs, Select Streaming Services, Live Entertainment, Cosmetic Stores/Barber Shops/Hair Salons, or Pet Supply Stores",
        condition: "The default is Select Streaming Services (Netflix, Spotify, Hulu and others). You may change your Self-Select Category once each calendar quarter.",
        // Only Select Streaming Services maps to a quiz category.
        earnsOn: ["shopping-and-subscriptions"],
        pickOne: true,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 2,
        unit: "points_per_dollar",
        category: "Restaurants",
        condition: "Includes cafes, bars, fast-food restaurants, restaurant delivery services and take out restaurants.",
        earnsOn: ["food-and-dining"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 1,
        unit: "points_per_dollar",
        category: "All Other Purchases",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    bonus: {
      summary: "Earn 20,000 bonus points after spending $1,000 in the first 3 months.",
      // Citi states no dollar value for the bonus points.
      valueCents: null,
      spendCents: 100_000,
      withinDays: 90,
    },
    // Citi's page and Additional Information state no cash or statement-credit
    // value per ThankYou Point for this card (redemption values vary).
    pointValueCents: null,
    image: "/cards/citi-strata.png",
    sourceUrl: "https://www.citi.com/credit-cards/citi-strata-credit-card",
    verifiedAt: READ,
  },
  "citi-double-cash": {
    kind: "cash_back",
    rates: [
      {
        amount: 5,
        unit: "percent",
        category: "Hotels, car rentals and attractions booked through the Citi Travel portal",
        condition: "An additional 3% cash back on top of the 1% when you buy and the 1% as you pay.",
        // Citi Travel portal only.
        earnsOn: [],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 2,
        unit: "percent",
        category: "Every purchase",
        condition: "1% cash back when you buy, plus an additional 1% as you pay for those purchases. No caps on the cash back you earn.",
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    // Citi's hero renders these numbers from its own pricing API
    // (offerPricingPositioning, productIdentifier 142: cashBackAmount 200,
    // hurdleAmount 1,500, hurdleDuration 6; paid as 20,000 bonus ThankYou
    // Points). The rendered hero template is "Earn $_ cash back bonus after
    // spending $_ on purchases in the first _ months of account opening".
    bonus: {
      summary: "$200 cash back bonus after spending $1,500 on purchases in the first 6 months of account opening.",
      valueCents: 20_000,
      spendCents: 150_000,
      withinDays: 180,
    },
    // Cash back card. Citi earns it as ThankYou Points and states "redeem
    // 10,000 ThankYou Points for a $100 direct deposit, statement credit, or
    // check", but the spec keeps pointValueCents null for cash back cards.
    pointValueCents: null,
    image: "/cards/citi-double-cash.png",
    sourceUrl: "https://www.citi.com/credit-cards/citi-double-cash-credit-card",
    verifiedAt: READ,
  },
  "citi-simplicity": {
    // Citi: "does not earn rewards"; intro APR only.
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    image: "/cards/citi-simplicity.png",
    sourceUrl: "https://www.citi.com/credit-cards/citi-simplicity-credit-card",
    verifiedAt: READ,
  },
  "citi-diamond-preferred": {
    // Citi: "does not earn rewards"; intro APR only.
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    image: "/cards/citi-diamond-preferred.png",
    sourceUrl: "https://www.citi.com/credit-cards/citi-diamond-preferred-credit-card",
    verifiedAt: READ,
  },
  "citi-secured": {
    // Citi: the card "does not earn rewards".
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    image: "/cards/citi-secured.png",
    sourceUrl: "https://www.citi.com/credit-cards/citi-secured-credit-card",
    verifiedAt: READ,
  },
  "amex-blue-cash-everyday": {
    kind: "cash_back",
    rates: [
      {
        amount: 3,
        unit: "percent",
        category: "U.S. supermarkets",
        condition: "On up to $6,000 per year in purchases (then 1%).",
        earnsOn: ["groceries"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        // Amex: "for each category on up to $6,000 per year", so each cap is its own.
        cap: { cents: 600_000, per: "year", sharedWith: null },
      },
      {
        amount: 3,
        unit: "percent",
        category: "U.S. online retail purchases",
        condition: "On up to $6,000 per year in purchases (then 1%). Physical goods bought online from U.S. retailers; services such as streaming do not count.",
        earnsOn: ["shopping-and-subscriptions"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: { cents: 600_000, per: "year", sharedWith: null },
      },
      {
        amount: 3,
        unit: "percent",
        category: "Gas at U.S. gas stations",
        condition: "On up to $6,000 per year in purchases (then 1%).",
        earnsOn: ["gas-and-rides"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: { cents: 600_000, per: "year", sharedWith: null },
      },
      {
        amount: 1,
        unit: "percent",
        category: "Other eligible purchases",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    // The $84 Disney Streaming Credit (up to $7 a month) and the Home Chef
    // credit are statement credits, not rates or a sign-up bonus, so they are
    // not modelled.
    bonus: {
      summary: "Earn $200 cash back after you spend $2,000 in purchases on your new Card in the first 6 months of Card Membership.",
      valueCents: 20_000,
      spendCents: 200_000,
      withinDays: 180,
    },
    // Cash back card (received as Reward Dollars redeemable for a statement credit).
    pointValueCents: null,
    image: "/cards/amex-blue-cash-everyday.png",
    sourceUrl: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/",
    verifiedAt: READ,
  },
  "apple-card": {
    kind: "cash_back",
    rates: [
      {
        amount: 3,
        unit: "percent",
        category: "Everything you buy at Apple",
        condition: "Includes Apple products, App Store purchases and services like Apple Music and Apple TV.",
        // Named-merchant rate, not a quiz category.
        earnsOn: [],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 3,
        unit: "percent",
        category: "Select merchants with Apple Pay: Ace Hardware, Booking.com, ChargePoint, Duane Reade, Exxon Mobil, Hertz, Nike, Uber, Uber Eats and Walgreens",
        condition: "Limitations apply; each merchant has its own terms.",
        // Named-merchant rates (Uber, Uber Eats, Exxon Mobil and so on) are left
        // out of the quiz categories so the 2% Apple Pay rate applies there.
        earnsOn: [],
        pickOne: false,
        rotating: false,
        requires: "Paying with Apple Card through Apple Pay",
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 2,
        unit: "percent",
        category: "Every purchase using Apple Card with Apple Pay",
        condition: "No limits or deadlines. Apple says Apple Pay is accepted at 85 percent of merchants in the United States.",
        // Judged broadly usable: Apple Card needs an iPhone to apply, so every
        // holder has Apple Pay, and Apple states 85% U.S. merchant acceptance
        // with no category limit. Mapped to every quiz category but kept off
        // "all" (the base rate) and flagged through `requires`.
        earnsOn: ["food-and-dining", "groceries", "gas-and-rides", "travel-home", "shopping-and-subscriptions"],
        pickOne: false,
        rotating: false,
        requires: "Paying with Apple Card through Apple Pay",
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 1,
        unit: "percent",
        category: "Every purchase with the titanium card",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    // apple.com/apple-card shows no sign-up bonus.
    bonus: null,
    pointValueCents: null,
    // Front face cropped from Apple's own titanium card image
    // (apple.com/v/apple-card/n/images/overview/titanium_card__edutuqq7hsuq_large.jpg,
    // which stacks the front and back).
    image: "/cards/apple-card.png",
    sourceUrl: "https://www.apple.com/apple-card/",
    verifiedAt: READ,
  },

  // Bank of America explore cards. BofA pages render in JavaScript; all values
  // read from the rendered pages and each card's Terms and Conditions on
  // 2026-11-07. Not modelled on any BofA card: the BofA Rewards bonus (10% to
  // 75% more on every purchase, by banking relationship tier). It is a
  // multiplier tied to the student's deposits, not a card earn rate, and the
  // card pages state no number for it, so the estimates leave it out.
  "bofa-customized-cash": {
    kind: "cash_back",
    rates: [
      {
        amount: 3,
        unit: "percent",
        category: "A category you choose: gas and EV charging stations; online shopping, including cable, internet, phone plans and streaming; dining; travel; drug stores and pharmacies; or home improvement and furnishings",
        condition: "6% in the first year from account opening (3% plus a 3% first-year bonus). 3% and 2% apply to the first $2,500 in combined choice category and grocery store and wholesale club purchases each quarter, then 1%. You can change the category once each calendar month.",
        earnsOn: ["gas-and-rides", "shopping-and-subscriptions", "food-and-dining", "travel-home"],
        pickOne: true,
        rotating: false,
        requires: null,
        yearOneAmount: 6,
        cap: { cents: 250_000, per: "quarter", sharedWith: "Grocery stores and wholesale clubs" },
      },
      {
        amount: 2,
        unit: "percent",
        category: "Grocery stores and wholesale clubs",
        condition: "Within the same $2,500 quarterly maximum as the choice category, then 1%. Excludes superstores.",
        earnsOn: ["groceries"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: {
          cents: 250_000,
          per: "quarter",
          sharedWith: "A category you choose: gas and EV charging stations; online shopping, including cable, internet, phone plans and streaming; dining; travel; drug stores and pharmacies; or home improvement and furnishings",
        },
      },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    bonus: { summary: "$200 online cash rewards bonus after making at least $1,000 in purchases in the first 90 days of account opening.", valueCents: 20_000, spendCents: 100_000, withinDays: 90 },
    pointValueCents: null,
    // Card art the page shows today (8ckn_cshsigcm_v_300x188_promo02.png), no banner on it.
    image: "/cards/bofa-customized-cash.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/cash-back-credit-card/",
    verifiedAt: READ,
  },
  "bofa-unlimited-cash": {
    kind: "cash_back",
    rates: [{ amount: 1.5, unit: "percent", category: "All purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null }],
    bonus: { summary: "$250 online cash rewards bonus after making at least $1,000 in purchases in the first 90 days of account opening (limited time).", valueCents: 25_000, spendCents: 100_000, withinDays: 90 },
    pointValueCents: null,
    // The art on this card's page has a "LIMITED-TIME OFFER" banner printed on
    // it, which would outlive the offer. The only clean rendition of the design
    // on bankofamerica.com is the Secured card's (bofa_cshcm_v_sky_250.png).
    image: null,
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/unlimited-cash-back-credit-card/",
    verifiedAt: READ,
  },
  "bofa-travel-rewards": {
    kind: "points",
    rates: [
      {
        amount: 3,
        unit: "points_per_dollar",
        category: "Purchases made through the Travel Center",
        condition: "Bank of America's Travel Center only (1.5 bonus points plus the 1.5 base points). Stated in the card's Terms and Conditions.",
        earnsOn: [], // issuer portal only
        ...FIXED,
      },
      { amount: 1.5, unit: "points_per_dollar", category: "Everyday purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    bonus: {
      summary: "25,000 online bonus points after making at least $1,000 in purchases in the first 90 days of account opening, redeemable for a $250 statement credit toward travel and dining purchases.",
      valueCents: 25_000,
      spendCents: 100_000,
      withinDays: 90,
    },
    // "25,000 online bonus points ... which can be redeemed for a $250 statement credit toward travel and dining purchases" -> 1 cent per point.
    // The Terms and Conditions: "Each point redeemed for a travel credit is worth $0.01"; for cash, $0.006.
    pointValueCents: 1,
    image: "/cards/bofa-travel-rewards.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/travel-rewards-credit-card/",
    verifiedAt: READ,
  },
  "bofa-bankamericard": {
    // Intro APR only (0% for 21 billing cycles); no rewards and no bonus.
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    image: "/cards/bofa-bankamericard.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/bankamericard-credit-card/",
    verifiedAt: READ,
  },
  "bofa-bankamericard-secured": {
    // "Secured card products are not eligible for a new account bonus offer"; no rewards.
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    // The page shows the same art file as the BankAmericard (8cae_nrwcm_mc_250x158.png).
    image: "/cards/bofa-bankamericard-secured.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/secured-credit-card/",
    verifiedAt: READ,
  },
  "bofa-customized-cash-secured": {
    kind: "cash_back",
    rates: [
      {
        amount: 3,
        unit: "percent",
        category: "A category you choose: gas and EV charging stations; online shopping, including cable, internet, phone plans and streaming; dining; travel; drug stores and pharmacies; or home improvement and furnishings",
        condition: "6% in the first year from account opening (3% plus a 3% first-year bonus). 3% and 2% apply to the first $2,500 in combined choice category and grocery store and wholesale club purchases each quarter, then 1%. You can change the category once each calendar month.",
        earnsOn: ["gas-and-rides", "shopping-and-subscriptions", "food-and-dining", "travel-home"],
        pickOne: true,
        rotating: false,
        requires: null,
        yearOneAmount: 6,
        cap: { cents: 250_000, per: "quarter", sharedWith: "Grocery stores and wholesale clubs" },
      },
      {
        amount: 2,
        unit: "percent",
        category: "Grocery stores and wholesale clubs",
        condition: "Within the same $2,500 quarterly maximum as the choice category, then 1%. Excludes superstores.",
        earnsOn: ["groceries"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: {
          cents: 250_000,
          per: "quarter",
          sharedWith: "A category you choose: gas and EV charging stations; online shopping, including cable, internet, phone plans and streaming; dining; travel; drug stores and pharmacies; or home improvement and furnishings",
        },
      },
      { amount: 1, unit: "percent", category: "All other purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    // "Secured cards are not eligible for a new account bonus ... However, this offer is eligible for the first-year 3% bonus."
    bonus: null,
    pointValueCents: null,
    image: "/cards/bofa-customized-cash-secured.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/cash-back-secured-credit-card/",
    verifiedAt: READ,
  },
  "bofa-unlimited-cash-secured": {
    kind: "cash_back",
    rates: [{ amount: 1.5, unit: "percent", category: "All purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null }],
    // "Secured cards are not eligible for a new account bonus, like a cash rewards bonus offer"
    bonus: null,
    pointValueCents: null,
    image: "/cards/bofa-unlimited-cash-secured.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/unlimited-cash-back-secured-credit-card/",
    verifiedAt: READ,
  },
  "bofa-travel-rewards-secured": {
    kind: "points",
    rates: [
      {
        amount: 3,
        unit: "points_per_dollar",
        category: "Purchases made through the Travel Center",
        condition: "Bank of America's Travel Center only (1.5 bonus points plus the 1.5 base points). Stated in the card's Terms and Conditions.",
        earnsOn: [], // issuer portal only
        ...FIXED,
      },
      { amount: 1.5, unit: "points_per_dollar", category: "Everyday purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    // "Secured card products are not eligible for a new account bonus offer, like a bonus points offer"
    bonus: null,
    // The card's Terms and Conditions: "Each point redeemed for a travel credit
    // is worth $0.01 (2,500 points = $25)", a statement credit toward travel and
    // dining purchases, as on the other Travel Rewards cards. Cash is $0.006.
    pointValueCents: 1,
    image: "/cards/bofa-travel-rewards-secured.png",
    sourceUrl: "https://www.bankofamerica.com/credit-cards/products/travel-rewards-secured-credit-card/",
    verifiedAt: READ,
  },

  "wells-fargo-active-cash": {
    kind: "cash_back",
    rates: [
      { amount: 2, unit: "percent", category: "Purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    bonus: { summary: "$100 cash rewards bonus when you spend $500 in purchases in the first 3 months.", valueCents: 10_000, spendCents: 50_000, withinDays: 90 },
    pointValueCents: null,
    image: "/cards/wells-fargo-active-cash.png",
    sourceUrl: "https://creditcards.wellsfargo.com/active-cash-credit-card/",
    verifiedAt: READ,
  },
  "wells-fargo-autograph": {
    kind: "points",
    rates: [
      { amount: 3, unit: "points_per_dollar", category: "Restaurants", condition: null, earnsOn: ["food-and-dining"], pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
      { amount: 3, unit: "points_per_dollar", category: "Travel", condition: "Airlines, hotels, timeshares, car rentals, cruise lines, travel agencies, discount travel sites and campgrounds.", earnsOn: ["travel-home"], pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
      { amount: 3, unit: "points_per_dollar", category: "Gas and transit", condition: "Gas stations, EV charging stations, passenger railways, taxis, limousines, ferries, tolls and parking.", earnsOn: ["gas-and-rides"], pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
      { amount: 3, unit: "points_per_dollar", category: "Popular streaming services", condition: null, earnsOn: ["shopping-and-subscriptions"], pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
      { amount: 3, unit: "points_per_dollar", category: "Phone plans", condition: null, earnsOn: [], pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
      { amount: 1, unit: "points_per_dollar", category: "Other purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    bonus: {
      summary: "20,000 bonus points when you spend $1,000 in purchases in the first 3 months, a $200 cash redemption value.",
      valueCents: 20_000,
      spendCents: 100_000,
      withinDays: 90,
    },
    // "Earn 20,000 bonus points when you spend $1,000 in purchases in the first
    // 3 months – that's a $200 cash redemption value" and "51,960 points x $0.01
    // per point" on the issuer's page.
    pointValueCents: 1,
    image: "/cards/wells-fargo-autograph.png",
    sourceUrl: "https://creditcards.wellsfargo.com/autograph-visa-credit-card/",
    verifiedAt: READ,
  },
  "wells-fargo-reflect": {
    // Intro APR card (0% for 21 months); the page lists no rewards and no bonus.
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    image: "/cards/wells-fargo-reflect.png",
    sourceUrl: "https://creditcards.wellsfargo.com/reflect-visa-credit-card/",
    verifiedAt: READ,
  },
  "us-bank-secured-visa": {
    // Credit-building card; the page lists no rewards and no bonus.
    kind: "none",
    rates: [],
    bonus: null,
    pointValueCents: null,
    image: "/cards/us-bank-secured-visa.png",
    sourceUrl: "https://www.usbank.com/credit-cards/secured-visa-credit-card.html",
    verifiedAt: READ,
  },
  "us-bank-altitude-go-secured": {
    kind: "points",
    rates: [
      {
        amount: 4,
        unit: "points_per_dollar",
        category: "Dining, takeout and restaurant delivery",
        condition: "On your first $2,000 each quarter, then 1X. Includes restaurant, fast-food restaurant and bar purchases.",
        earnsOn: ["food-and-dining"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: { cents: 200_000, per: "quarter", sharedWith: null },
      },
      {
        amount: 2,
        unit: "points_per_dollar",
        category: "Grocery stores and gas stations/EV charging stations",
        condition: "Excludes discount stores/supercenters and wholesale clubs.",
        earnsOn: ["groceries", "gas-and-rides"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 2,
        unit: "points_per_dollar",
        category: "Streaming services",
        condition: "Plus a $15 statement credit after 11 consecutive months of eligible streaming purchases.",
        earnsOn: ["shopping-and-subscriptions"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      { amount: 1, unit: "points_per_dollar", category: "All other eligible purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    bonus: null,
    // The page says "Maximum Point value applies to Points redeemed for a deposit
    // into an eligible U.S. Bank Account" but never states that value.
    pointValueCents: null,
    image: "/cards/us-bank-altitude-go-secured.png",
    sourceUrl: "https://www.usbank.com/credit-cards/altitude-go-secured-visa-credit-card.html",
    verifiedAt: READ,
  },
  "us-bank-cash-plus-secured": {
    kind: "cash_back",
    rates: [
      {
        amount: 5,
        unit: "percent",
        // Of these, only fast food and TV, internet and streaming map to quiz
        // categories. Ground transportation is left unmapped, as on Cash+ (see
        // that entry).
        category: "Two categories you choose each quarter: fast food, home utilities, TV, internet and streaming, department stores, cell phone, electronics stores, sporting goods, furniture stores, movie theaters, ground transportation, gyms/fitness centers, or select clothing stores",
        condition: "Choose two and activate them each quarter. On your first $2,000 in combined eligible purchases each quarter in the two categories, then 1%.",
        earnsOn: ["food-and-dining", "shopping-and-subscriptions"],
        pickOne: true,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: { cents: 200_000, per: "quarter", sharedWith: null },
      },
      {
        amount: 5,
        unit: "percent",
        category: "Prepaid air, hotel and car reservations booked directly in the Travel Center",
        condition: null,
        earnsOn: [],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 2,
        unit: "percent",
        category: "One everyday category you choose each quarter: grocery stores and grocery delivery, restaurants, or gas stations and EV charging stations",
        condition: "Choose and activate it each quarter. Grocery excludes discount stores/supercenters and wholesale clubs; gas also excludes grocery stores/supermarkets. No limit on 2% earnings.",
        earnsOn: ["groceries", "food-and-dining", "gas-and-rides"],
        pickOne: true,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      { amount: 1, unit: "percent", category: "All other eligible purchases", condition: null, earnsOn: "all", pickOne: false, rotating: false, requires: null, yearOneAmount: null, cap: null },
    ],
    bonus: null,
    pointValueCents: null,
    image: "/cards/us-bank-cash-plus-secured.png",
    sourceUrl: "https://www.usbank.com/credit-cards/cash-plus-secured-visa-credit-card.html",
    verifiedAt: READ,
  },

  // Group "usb": U.S. Bank. Every value read on usbank.com on 2026-11-07 (page
  // text plus its footnotes). Card art is the flat card face from usbank.com's
  // card-art folder; U.S. Bank cards are vertical, so the PNGs are portrait.
  "us-bank-cash-plus": {
    kind: "cash_back",
    rates: [
      {
        amount: 5,
        unit: "percent",
        category: "Two categories you choose each quarter: fast food, home utilities, TV, internet and streaming, department stores, cell phone, electronics stores, sporting goods, furniture stores, movie theaters, ground transportation, gyms/fitness centers or select clothing stores",
        condition: "Choose two and enroll each quarter, or everything earns 1%. On your first $2,000 in combined eligible purchases each quarter, then 1%. Category options may change each quarter.",
        // Only fast food and TV, internet and streaming map to quiz categories.
        // Ground transportation is defined on U.S. Bank's Cash+ rewards site
        // (cashplus.usbank.com/cash-plus/samplemerchants) as bus and passenger
        // rail tickets, taxi fares and car services like Uber and limousines,
        // excluding parking and tolls. Gas stations are a separate 2% option.
        // It covers rides but not gas, so it is not mapped to gas-and-rides:
        // that would count 5% on gas, which this card pays at most 2% on.
        earnsOn: ["food-and-dining", "shopping-and-subscriptions"],
        pickOne: true,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: { cents: 200_000, per: "quarter", sharedWith: null },
      },
      {
        amount: 5,
        unit: "percent",
        category: "Prepaid air, hotel and car reservations booked directly in the Travel Center",
        condition: null,
        earnsOn: [],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 2,
        unit: "percent",
        category: "One everyday category you choose each quarter: grocery stores and grocery delivery, restaurants, or gas stations and EV charging stations",
        condition: "Choose and enroll in it each quarter. Grocery excludes discount stores/supercenters and wholesale clubs; gas also excludes grocery stores/supermarkets. No limit on 2% earnings.",
        earnsOn: ["groceries", "food-and-dining", "gas-and-rides"],
        pickOne: true,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 1,
        unit: "percent",
        category: "All other eligible purchases",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    bonus: {
      summary: "$200 rewards bonus after you spend $1,000 in eligible purchases within the first 90 days of account opening (limited time).",
      valueCents: 20_000,
      spendCents: 100_000,
      withinDays: 90,
    },
    pointValueCents: null,
    image: "/cards/us-bank-cash-plus.png",
    sourceUrl: "https://www.usbank.com/credit-cards/cash-plus-visa-signature-credit-card.html",
    verifiedAt: READ,
  },
  "us-bank-altitude-go": {
    kind: "points",
    rates: [
      {
        amount: 4,
        unit: "points_per_dollar",
        category: "Dining, takeout and restaurant delivery",
        condition: "On your first $2,000 each quarter, then 1X. Includes restaurant, fast-food restaurant and bar purchases.",
        earnsOn: ["food-and-dining"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: { cents: 200_000, per: "quarter", sharedWith: null },
      },
      {
        amount: 2,
        unit: "points_per_dollar",
        category: "Grocery stores and gas stations/EV charging stations",
        condition: "Excludes discount stores/supercenters and wholesale clubs.",
        earnsOn: ["groceries", "gas-and-rides"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        // The separate $15 streaming credit (a statement credit per 12-month
        // period after 11 consecutive months of streaming purchases) is a
        // credit, not a rate, so it is not modelled here.
        amount: 2,
        unit: "points_per_dollar",
        category: "Streaming services",
        condition: "Qualifying streaming subscription services on U.S. Bank's list.",
        earnsOn: ["shopping-and-subscriptions"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 1,
        unit: "points_per_dollar",
        category: "All other eligible purchases",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    bonus: {
      // The page states no dollar value for the bonus in text; see pointValueCents.
      summary: "20,000 bonus points after $1,000 in Net Purchases in the first 90 days.",
      valueCents: null,
      spendCents: 100_000,
      withinDays: 90,
    },
    // No sentence on the page gives a dollar value. The page's own rewards
    // calculator shows "That's equivalent to $X as a deposit to an eligible
    // U.S. Bank account", computed in usbank.com's script as 0.01 x points.
    // Footnote: "Maximum Point value applies to Points redeemed for a deposit
    // into an eligible U.S. Bank Account." Set to null if a calculator result
    // does not count as a stated value.
    pointValueCents: 1,
    image: "/cards/us-bank-altitude-go.png",
    sourceUrl: "https://www.usbank.com/credit-cards/altitude-go-visa-signature-credit-card.html",
    verifiedAt: READ,
  },
  "us-bank-altitude-connect": {
    kind: "points",
    rates: [
      {
        amount: 5,
        unit: "points_per_dollar",
        category: "Prepaid hotels and car rentals booked directly in the Travel Center",
        condition: null,
        earnsOn: [],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        // Any channel: the footnote defines travel as travel-category
        // purchases "such as purchases made directly with airlines, hotels,
        // car rentals, taxicabs, limousines, passenger trains and cruise line
        // companies". Taxicabs are listed, but rideshare is not named, so
        // gas-and-rides is not mapped here.
        amount: 4,
        unit: "points_per_dollar",
        category: "Travel",
        condition: "Purchases made directly with airlines, hotels, car rentals, taxicabs, limousines, passenger trains and cruise lines.",
        earnsOn: ["travel-home"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 4,
        unit: "points_per_dollar",
        category: "Gas stations/EV charging stations",
        condition: "On your first $1,000 each quarter, then 1X. Excludes discount stores/supercenters, wholesale clubs and grocery stores.",
        earnsOn: ["gas-and-rides"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: { cents: 100_000, per: "quarter", sharedWith: null },
      },
      {
        amount: 2,
        unit: "points_per_dollar",
        category: "Dining, streaming services and grocery stores",
        condition: "Grocery excludes discount stores/supercenters and wholesale clubs.",
        earnsOn: ["food-and-dining", "shopping-and-subscriptions", "groceries"],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
      {
        amount: 1,
        unit: "points_per_dollar",
        category: "All other eligible purchases",
        condition: null,
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    bonus: {
      // The page states no dollar value for the bonus in text; see pointValueCents.
      summary: "20,000 bonus points after $1,000 in Net Purchases in the first 90 days.",
      valueCents: null,
      spendCents: 100_000,
      withinDays: 90,
    },
    // As Altitude Go: no sentence gives a dollar value; the page's calculator
    // converts points at 0.01 x points "in travel or as a deposit to an
    // eligible U.S. Bank account". Footnote: "Maximum Point value applies to
    // Points redeemed for deposit into an eligible U.S. Bank Account or
    // travel." Set to null if a calculator result does not count.
    pointValueCents: 1,
    image: "/cards/us-bank-altitude-connect.png",
    sourceUrl: "https://www.usbank.com/credit-cards/altitude-connect-visa-signature-credit-card.html",
    verifiedAt: READ,
  },
  "us-bank-smartly": {
    // The issuer says "cash back" (earned as points at 2 per $1, redeemed as
    // cash back), so kind is cash_back and amounts are percent. The boosted
    // tiers are earned on every purchase, but earnsOn may only be "all" once
    // (the base rate), so each tier lists all five quiz categories and its
    // deposit condition is in requires. Only one tier applies at a time.
    kind: "cash_back",
    rates: [
      {
        amount: 4,
        unit: "percent",
        category: "Every purchase, with a $100,000+ qualifying balance",
        condition: "On your first $10,000 in eligible Net Purchases each billing cycle, then 2%. Education, gift cards, insurance, tax, business-to-business and bill-pay purchases earn 2%.",
        earnsOn: ["food-and-dining", "groceries", "gas-and-rides", "travel-home", "shopping-and-subscriptions"],
        pickOne: false,
        rotating: false,
        requires: "A U.S. Bank Smartly Savings account plus a qualifying balance of $100,000 or more in U.S. Bank Smartly Checking and/or Safe Debit account(s).",
        yearOneAmount: null,
        // "each billing cycle" stored as month
        cap: { cents: 1_000_000, per: "month", sharedWith: null },
      },
      {
        amount: 3,
        unit: "percent",
        category: "Every purchase, with a $50,000 to $99,999 qualifying balance",
        condition: "On your first $10,000 in eligible Net Purchases each billing cycle, then 2%. Education, gift cards, insurance, tax, business-to-business and bill-pay purchases earn 2%.",
        earnsOn: ["food-and-dining", "groceries", "gas-and-rides", "travel-home", "shopping-and-subscriptions"],
        pickOne: false,
        rotating: false,
        requires: "A U.S. Bank Smartly Savings account plus a qualifying balance of $50,000 to $99,999 in U.S. Bank Smartly Checking and/or Safe Debit account(s).",
        yearOneAmount: null,
        cap: { cents: 1_000_000, per: "month", sharedWith: null },
      },
      {
        amount: 2.5,
        unit: "percent",
        category: "Every purchase, with a $10,000 to $49,999 qualifying balance",
        condition: "On your first $10,000 in eligible Net Purchases each billing cycle, then 2%. Education, gift cards, insurance, tax, business-to-business and bill-pay purchases earn 2%.",
        earnsOn: ["food-and-dining", "groceries", "gas-and-rides", "travel-home", "shopping-and-subscriptions"],
        pickOne: false,
        rotating: false,
        requires: "A U.S. Bank Smartly Savings account plus a qualifying balance of $10,000 to $49,999 in U.S. Bank Smartly Checking and/or Safe Debit account(s).",
        yearOneAmount: null,
        cap: { cents: 1_000_000, per: "month", sharedWith: null },
      },
      {
        amount: 2,
        unit: "percent",
        category: "Every purchase",
        condition: "Unlimited, with no caps.",
        earnsOn: "all",
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    // No welcome bonus on the page (only a 0% intro APR for 12 billing cycles).
    bonus: null,
    pointValueCents: null,
    image: "/cards/us-bank-smartly.png",
    sourceUrl: "https://www.usbank.com/credit-cards/bank-smartly-visa-signature-credit-card.html",
    verifiedAt: READ,
  },
  "us-bank-shield": {
    // An intro APR card (0% for 21 billing cycles, limited time) whose only
    // earn rate is the Travel Center one; other purchases earn nothing, so
    // there is no "all" rate. The $20 annual statement credit after 11
    // consecutive months of purchases is a credit, not a rate or a sign-up
    // bonus, so it is not modelled.
    kind: "cash_back",
    rates: [
      {
        amount: 4,
        unit: "percent",
        category: "Prepaid air, hotel and car reservations booked directly in the Travel Center",
        condition: null,
        earnsOn: [],
        pickOne: false,
        rotating: false,
        requires: null,
        yearOneAmount: null,
        cap: null,
      },
    ],
    bonus: null,
    pointValueCents: null,
    image: "/cards/us-bank-shield.png",
    sourceUrl: "https://www.usbank.com/credit-cards/shield-visa-credit-card.html",
    verifiedAt: READ,
  },

};

// The card's rewards, or null for a card not in the catalog.
export function cardRewards(cardId: string): CardRewards | null {
  return CARD_REWARDS[cardId] ?? null;
}
