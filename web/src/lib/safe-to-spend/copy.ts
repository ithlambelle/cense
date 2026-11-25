import type { Bill, CoveredBy } from "./compute";

// The words of the safe-to-spend screens, from Flow C (Figma 222:2041,
// 222:2090, 222:2133). Kept short: in-app copy is read on a phone.

export const BILL_COPY: Record<Bill, { label: string; question: string; amountLabel: string }> = {
  rent: { label: "Rent", question: "Who covers your rent?", amountLabel: "Your rent each month" },
  phone: { label: "Phone", question: "Who covers your phone?", amountLabel: "Your phone bill each month" },
  // Asked per semester (Ben, Oct 27); the sum uses its monthly figure.
  tuition: { label: "Tuition", question: "Who covers your tuition?", amountLabel: "Your tuition each semester" },
  groceries: { label: "Groceries", question: "Who covers your groceries?", amountLabel: "Your groceries each month" },
  car: { label: "Car", question: "Who covers your car?", amountLabel: "Your car costs each month" },
};

// "Split" asks for the student's own part, so no 50/50 is assumed.
export const SHARE_LABEL = "Your share each month";
export const SEMESTER_SHARE_LABEL = "Your share each semester";
// The day a monthly bill is due: safe to spend keeps back only the bills
// still to come this month.
export const DUE_DAY_LABEL = "Due on day";

export const COVERED_BY_LABELS: Record<CoveredBy, string> = {
  me: "Me",
  family: "Family",
  split: "Split",
  none: "Not applicable",
};

export const SAFE_TO_SPEND_COPY = {
  preview: "Preview",
  // Shown only where PLAID_ENV is sandbox (test banks). With real banks for
  // the pilot, the note goes and the invitation says what it reads.
  sandboxNote: "Sandbox only, no live data",
  inviteTitle: "See what’s safe to spend",
  inviteBody: "A daily number from a sandbox bank. No real bank data.",
  inviteBodyLive: "A daily number from your bank. Read only.",
  // "Link your bank" (Flow 5 C1, 821:9643; the same screen as Flow 1 E1,
  // 821:8502). Up to 2 years: D46, Nov 18.
  connectTitle: "Link your bank",
  connectBody: "So Cense can find your next step and what’s safe to spend.",
  consent: [
    {
      title: "Read only",
      body: "We read balances and keep up to 2 years of transactions to find your bills and income. We can’t move money.",
    },
    { title: "Private", body: "We never see your bank login." },
    { title: "Yours to delete", body: "Disconnect anytime and we delete it all." },
  ],
  connectAction: "Link your bank",
  connectSkip: "Skip for now",
  securedBy: "Secured by Plaid.",
  familyNote: "Family support counts as income.",
  setAsideTitle: "Anything to keep aside each month?",
  // D4 (Flow D, 709:1427).
  setAsideBody: "Savings or a cushion. We leave this out of your Safe to spend.",
  setAsideLabel: "Set aside each month",
  reconnect: "Your bank needs you to sign in again.",
  relink: "Your bank connection ended.",
  lastNumbers: "Until then, these are the last numbers we read.",
  plaidCopy: "Plaid keeps its own copy of what it shared. Manage it at my.plaid.com.",
} as const;
