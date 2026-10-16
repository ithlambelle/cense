// Fixed wording for the hand-off to a card issuer. Sources: story US-06 and
// Notion "Fit Tier Rules v1.0" (note N1). Change only when a source changes.
export const PREAPPROVAL_LABEL = "Check if you’re preapproved";
export const PREAPPROVAL_LINE = "This check won’t affect your credit score.";
export const NO_PREAPPROVAL_LINE = "This issuer has no preapproval check, so applying is the only way to find out.";
export const HAND_OFF_LINE =
  "Cense doesn’t submit applications or see your credit report. Preapproval is not a guarantee of approval.";
export const DID_YOU_APPLY = "Did you finish applying?";

export function applyLabel(issuer: string): string {
  return `Apply on ${issuer}’s site`;
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
