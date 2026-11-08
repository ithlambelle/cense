// Created with Claude Code (2026-11-08). Card setup's rules (US-10), kept
// apart from the screens so they can be tested alone.
import { nextOnDay } from "@/lib/reminders/schedule";

export type SetupProgress = {
  // Both the statement and due days are saved.
  dates: boolean;
  // The three stars, the same ones Home's first-month list shows.
  autopay: boolean;
  spendLimit: boolean;
  reminders: boolean;
};

export function setupProgress({
  autopayStatus,
  statementClosingDay,
  paymentDueDay,
  spendLimitStep,
  reminderStep,
  reminderOn,
}: {
  autopayStatus: string;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
  spendLimitStep: boolean;
  reminderStep: boolean;
  // paymentReminderOn in lib/home/state.ts: the due day, the due-date email on.
  reminderOn: boolean;
}): SetupProgress {
  return {
    dates: statementClosingDay !== null && paymentDueDay !== null,
    autopay: autopayStatus === "on",
    spendLimit: spendLimitStep,
    // As on Home: the saved step and a reminder that is really on.
    reminders: reminderStep && reminderOn,
  };
}

export type PaymentType = "statement_balance" | "minimum" | "fixed_amount";

// I3's answers, in the frame's order. "not_yet" saves autopay off.
export const AUTOPAY_ANSWERS: { value: PaymentType | "not_yet"; label: string }[] = [
  { value: "statement_balance", label: "Yes, the full statement balance" },
  { value: "minimum", label: "Yes, the minimum only" },
  { value: "fixed_amount", label: "Yes, a fixed amount" },
  { value: "not_yet", label: "Not yet" },
];

// I5's "Autopay amount": what the student said, never an amount. Null for
// autopay saved on before the payment type existed (Home's old star): the row is left out.
export function paymentTypeLabel(type: PaymentType | null): string | null {
  if (type === "minimum") return "Minimum only";
  if (type === "fixed_amount") return "A fixed amount";
  if (type === "statement_balance") return "Statement balance";
  return null;
}

// I5's "Next payment": the next due day on or after today, like "Dec 6".
// `today` is the student's calendar date (YYYY-MM-DD).
export function nextPaymentLabel(paymentDueDay: number | null, today: string): string | null {
  if (paymentDueDay === null) return null;
  const date = new Date(`${nextOnDay(paymentDueDay, today)}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
