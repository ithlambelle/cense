// Fixed wording for the hand-off to a card issuer. Source: story US-06. Change
// only when the source changes. Notes N1 and N2 come from cardNotes in the
// fit tier rules, so they are never repeated here.
export const PREAPPROVAL_LABEL = "Check if you’re preapproved";
export const PREAPPROVAL_LINE = "This check won’t affect your credit score.";
export const HAND_OFF_LINE =
  "Cense doesn’t submit applications or see your credit report. Preapproval is not a guarantee of approval.";
export const DID_YOU_APPLY = "Did you finish applying?";

// The referral disclosure, shown next to every link to an issuer: both
// buttons, inside both sheets, on Your match and the card page (Ben,
// 2026-11-26; decisions D10 and D11, story US-06). The FTC asks for it next
// to the link, not in a footer (16 CFR 255.5). This wording is true only
// while no issuer pays Cense: every card's referralDisclosure in the catalog
// is null, and catalog.test.ts fails if one is set while this line is shown.
export const NO_REFERRAL_DISCLOSURE =
  "Cense isn’t paid by card issuers. If that changes, we’ll say so here, and it won’t change the order.";

// The line next to a card's issuer links: the card's own disclosure once a
// deal exists, else NO_REFERRAL_DISCLOSURE.
export function referralDisclosure(card: { referralDisclosure: string | null }): string {
  return card.referralDisclosure ?? NO_REFERRAL_DISCLOSURE;
}

export function applyLabel(issuer: string): string {
  return `Apply on ${issuer}’s site`;
}

// The shorter label on the top match on Your match ("Apply at Discover", Figma 821:9231).
export function applyAtLabel(issuer: string): string {
  return `Apply at ${issuer}`;
}

// Only an https address returned by the API may be opened (never http,
// javascript: or anything else). Returns null when it must not be opened.
export function safeIssuerUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === "https:" ? url.toString() : null;
}
