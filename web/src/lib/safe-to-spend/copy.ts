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
  sandboxNote: "Sandbox only, no live data",
  inviteTitle: "See what’s safe to spend",
  inviteBody: "A daily number from a sandbox bank. No real bank data.",
  connectTitle: "See what’s safe to spend",
  consent: [
    "Plaid connects. We never see your password.",
    "We read your account balances",
    "We keep totals, never transactions",
    "Disconnect anytime and we delete it",
  ],
  familyNote: "Family support counts as income.",
  setAsideTitle: "Anything to keep aside each month?",
  setAsideBody: "Savings or a cushion. We leave it out.",
  setAsideLabel: "Set aside each month",
  howTitle: "How we got this",
  howIntro: "Your checking, minus card balances, the bills still to come this month and what you keep aside, spread over 30 days.",
  reconnect: "Your bank needs you to sign in again.",
  relink: "Your bank connection ended.",
  lastNumbers: "Until then, these are the last numbers we read.",
  plaidCopy: "Plaid keeps its own copy of what it shared. Manage it at my.plaid.com.",
} as const;
