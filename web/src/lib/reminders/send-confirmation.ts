import "server-only";

import type { Student } from "@/lib/api/auth";
import type { ConfirmationOutcome } from "@/lib/api/reminders";

import { reminderSettings, resendEmailsUrl } from "./config";
import {
  buildConfirmationEmail,
  buildPaymentRemindersEmail,
  type ConfirmationEmail,
  type ConfirmationEmailLinks,
  type PaymentRemindersEmailInput,
} from "./confirmation-email";
import { unsubscribeToken } from "./unsubscribe-token";

const RESEND_TIMEOUT_MS = 5_000;

function log(event: string, fields: Record<string, unknown>, level: "log" | "error" = "log"): void {
  console[level](JSON.stringify({ event, ...fields }));
}

// Sends one confirmation email through Resend. Never throws: what it
// confirms is already saved, so a failed email is logged (no address, no
// card, no key) and the save still succeeds. Skipped when reminder emails are
// off for the student or the email settings are missing (local runs without
// Resend).
async function sendConfirmation(
  student: Student,
  build: (links: ConfirmationEmailLinks) => ConfirmationEmail,
  // Resend sends one email per key within 24 hours, so a double tap or a
  // retry never sends twice.
  idempotencyKey: string,
  fetchImpl: typeof fetch,
): Promise<ConfirmationOutcome> {
  if (!student.email) return "skipped";
  const config = reminderSettings(["resendApiKey", "fromEmail", "appUrl", "unsubscribeSecret"]);
  if (!config.ok) return "skipped";

  const profile = await student.supabase
    .from("profiles")
    .select("reminders_unsubscribed_at")
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (profile.error) {
    log("reminder_confirmation_failed", { code: profile.error.code ?? "profile_read" }, "error");
    return "failed";
  }
  if ((profile.data as { reminders_unsubscribed_at: string | null } | null)?.reminders_unsubscribed_at) return "skipped";

  const { resendApiKey, fromEmail, appUrl, unsubscribeSecret } = config.settings;
  const unsubscribeUrl = `${appUrl}/api/v1/reminders/unsubscribe?token=${unsubscribeToken(student.studentId, unsubscribeSecret)}`;
  const email = build({ appUrl, unsubscribeUrl });

  try {
    const response = await fetchImpl(resendEmailsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [student.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (response.ok) return "sent";
    const body = (await response.json().catch(() => null)) as { name?: unknown } | null;
    log("reminder_confirmation_failed", { status: response.status, code: typeof body?.name === "string" ? body.name : "unknown" }, "error");
    return "failed";
  } catch (error) {
    log("reminder_confirmation_failed", { status: null, code: error instanceof Error ? error.name : "fetch_failed" }, "error");
    return "failed";
  }
}

// The reapply reminder's confirmation (F4), right after the reminder is saved.
export function sendReapplyConfirmation(
  student: Student,
  reminder: { applicationId: string; remindOn: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ConfirmationOutcome> {
  return sendConfirmation(
    student,
    (links) => buildConfirmationEmail({ applicationId: reminder.applicationId, remindOn: reminder.remindOn }, links),
    // One email per student, card and day. Not the reminder's id: saving
    // again replaces the row with a new id, so the same day would send twice.
    `reapply-confirmation-${student.studentId}-${reminder.applicationId}-${reminder.remindOn}`,
    fetchImpl,
  );
}

// The payment reminders' confirmation, after a card's statement and due days
// are set or changed. `savedAt` is the card's updated_at: one email per save,
// so a retry is sent once and changing the days back later still sends.
export function sendPaymentRemindersConfirmation(
  student: Student,
  input: PaymentRemindersEmailInput,
  savedAt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ConfirmationOutcome> {
  return sendConfirmation(
    student,
    (links) => buildPaymentRemindersEmail(input, links),
    `payment-reminders-confirmation-${student.studentId}-${input.applicationId}-${savedAt}`,
    fetchImpl,
  );
}
