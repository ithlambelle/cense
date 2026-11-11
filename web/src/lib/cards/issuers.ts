// Created with Claude Code (2026-11-08). Issuer link-out data (US-10, Figma
// Design Edits, Flow C I4 477:1784): where a student turns on autopay for each
// brand in the catalog that Cense recommends, and the issuer's own short steps.
// The autopay screen (I2) reads it. Keyed by the card's `brand` in cards.json:
// Discover cards are issued by Capital One, N.A. now but keep Discover's site
// and app.
//
// Every link is the issuer's own domain or its own store listing. Each issuer's
// steps are grounded in the help page in `source`, read on `verifiedAt`; no
// third-party pages. Ben, Nov 4: the example step wording is fine for now.
// Steps must still be checked in each issuer's app before launch (I2 NEEDS).

type IssuerStep = { title: string; detail: string };

export type Issuer = {
  // The brand as students know it, used in copy ("Open Discover").
  name: string;
  // The issuer's public site: the label shown on the button and its address.
  site: { label: string; url: string };
  appStoreUrl: string;
  playStoreUrl: string;
  steps: [IssuerStep, IssuerStep, IssuerStep];
  // Where the steps come from, and when they were last read there. Null when
  // the issuer's own steps page could not be read; the steps are then the
  // design's sample wording (I2, decided Nov 4) and need checking in the app.
  source: { url: string; verifiedAt: string } | null;
};

// The last step for a card paid from a bank account: the amount Cense
// suggests, from the design (I2 477:1631).
const STATEMENT_BALANCE: IssuerStep = {
  title: "Pick the statement balance",
  detail: "This helps avoid interest. Just make sure you keep enough in your checking.",
};

export const ISSUERS = {
  "Capital One": {
    name: "Capital One",
    site: { label: "capitalone.com", url: "https://www.capitalone.com" },
    appStoreUrl: "https://apps.apple.com/us/app/capital-one-mobile/id407558537",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.konylabs.capitalone",
    steps: [
      { title: "Open Capital One", detail: "In the app or on the site." },
      { title: "Find autopay", detail: "Pick your card, then set up AutoPay with your bank account." },
      STATEMENT_BALANCE,
    ],
    source: { url: "https://www.capitalone.com/help-center/credit-cards/how-to-set-up-autopay/", verifiedAt: "2026-11-08" },
  },
  Discover: {
    name: "Discover",
    site: { label: "discover.com", url: "https://www.discover.com" },
    appStoreUrl: "https://apps.apple.com/us/app/discover-mobile/id338010821",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.discoverfinancial.mobile",
    steps: [
      { title: "Open Discover", detail: "In the app or on the site." },
      { title: "Find autopay", detail: "Check payment settings, or try “make a payment” from the payment menu." },
      STATEMENT_BALANCE,
    ],
    // discover.com's autopay steps page answered 404 on 2026-11-08: these are
    // the design's sample steps (I2), to check in the Discover app.
    source: null,
  },
  "Bank of America": {
    name: "Bank of America",
    site: { label: "bankofamerica.com", url: "https://www.bankofamerica.com" },
    appStoreUrl: "https://apps.apple.com/us/app/bank-of-america-mobile-banking/id284847138",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.infonow.bofa",
    steps: [
      { title: "Open Bank of America", detail: "In the app or on the site." },
      { title: "Find autopay", detail: "Pay & Transfer, then Pay Bills. Pick your card and make it recurring." },
      STATEMENT_BALANCE,
    ],
    source: { url: "https://www.bankofamerica.com/credit-cards/payments-statements-faq.go", verifiedAt: "2026-11-08" },
  },
  Chase: {
    name: "Chase",
    site: { label: "chase.com", url: "https://www.chase.com" },
    appStoreUrl: "https://apps.apple.com/us/app/chase-mobile/id298867247",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.chase.sig.android",
    steps: [
      { title: "Open Chase", detail: "In the app or on the site." },
      { title: "Find autopay", detail: "Open your card, tap Pay card, then Set up next to Automatic payments." },
      STATEMENT_BALANCE,
    ],
    source: { url: "https://www.chase.com/digital/customer-service/helpful-tips/credit-cards/mobile/set-up-autopay", verifiedAt: "2026-11-08" },
  },
  // The Chime card is paid from the student's Chime account, not a bank
  // account elsewhere: Safer Credit Building pays the balance from it.
  Chime: {
    name: "Chime",
    site: { label: "chime.com", url: "https://www.chime.com" },
    appStoreUrl: "https://apps.apple.com/us/app/chime-mobile-banking/id836215269",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.onedebit.chime",
    steps: [
      { title: "Open Chime", detail: "In the app." },
      { title: "Find autopay", detail: "Profile, then Account details, then Safer Credit Building." },
      { title: "Turn it on", detail: "Chime pays your card from your Chime account. Keep enough in it." },
    ],
    source: { url: "https://help.chime.com/how-do-i-pay-off-my-credit-builder-card-statement-723d43b2", verifiedAt: "2026-11-08" },
  },
} as const satisfies Record<string, Issuer>;

type IssuerBrand = keyof typeof ISSUERS;

// The issuer data for a catalog card's brand, or null for a brand Cense has no
// steps for (or a card added from outside the catalog).
export function issuerForBrand(brand: string | null | undefined): Issuer | null {
  if (!brand || !Object.hasOwn(ISSUERS, brand)) return null;
  return ISSUERS[brand as IssuerBrand];
}
