"use client";

import { PaymentReminderSetup } from "@/components/reminders/payment-reminder-setup";
import type { ReminderSetupSave } from "@/lib/api-client/reminder-setup";

const SAMPLE_ID = "00000000-0000-4000-8000-000000000001";

// The frame's sample answers (Figma 144:1822). Saving waits a moment and
// answers from here: nothing is sent to the API.
const ANSWERS: Record<"saves" | "fails", ReminderSetupSave> = {
  saves: { kind: "ok" },
  fails: {
    kind: "failed",
    stage: "choices",
    message: "Your dates are saved, but your reminder choices are not. Something went wrong on our side. Please try again.",
  },
};

export function PaymentRemindersPreview({ outcome }: { outcome: keyof typeof ANSWERS }) {
  return (
    <PaymentReminderSetup
      applicationId={SAMPLE_ID}
      statementClosingDay={14}
      paymentDueDay={9}
      savedChoices={{ paymentDue: true, statementClosing: true }}
      email="you@bu.edu"
      save={() => new Promise((resolve) => setTimeout(() => resolve(ANSWERS[outcome]), 600))}
      doneHref="/dev/home?state=approved"
    />
  );
}
