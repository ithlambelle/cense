import type { Metadata } from "next";

import { HomeView } from "@/components/home/home-view";
import { ALL_REMINDERS_ON, homeState, needsDetail, profileInitial } from "@/lib/home/state";
import { plaidConfig } from "@/lib/plaid/config";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { CELEBRATE_PARAM, REMINDER_PARAM, reminderArrivalPath, reminderKindParam, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadApplicationDetail, loadReminderSettings, loadStudentSnapshot } from "@/lib/student-data";

export const metadata: Metadata = { title: "Home | CENSE" };

// Read on the server, so Home never flashes a loading state. Opened from a
// reminder email's button (?reminder=<kind>), it counts the visit; a
// signed-out student comes back to the same address after signing in.
export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const params = await searchParams;
  const fromReminder = reminderKindParam(params[REMINDER_PARAM]);
  const student = await requireStudent(fromReminder ? reminderArrivalPath(fromReminder) : ROUTES.home);
  const { applications, quiz, quizAnswered } = await loadStudentSnapshot(student);
  const state = homeState(applications, quiz, quizAnswered);
  // The leading card's denial reason and autopay, read the same way as
  // GET /applications/{id}. Only those fields reach the page. An approved
  // card's reminder star also needs the student's reminder settings.
  // Safe to spend (US-12) is read alongside, only when Plaid is set up. A
  // failed read leaves its card out rather than failing Home.
  const [detailAndSettings, safeToSpend] = await Promise.all([
    needsDetail(state)
      ? Promise.all([
          loadApplicationDetail(student, state.primary.id),
          state.primary.status === "approved" ? loadReminderSettings(student) : ALL_REMINDERS_ON,
        ])
      : null,
    plaidConfig() ? loadSafeToSpend(student) : null,
  ]);
  const [detail, settings] = detailAndSettings ?? [null, ALL_REMINDERS_ON];
  const celebrateId = params[CELEBRATE_PARAM];
  return (
    <HomeView
      state={state}
      initial={profileInitial(student.email)}
      detail={
        detail && {
          denialReason: detail.denialReason,
          denialReasonNote: detail.denialReasonNote,
          autopayStatus: detail.autopayStatus,
          autopayPaymentType: detail.autopayPaymentType,
          statementClosingDay: detail.statementClosingDay,
          paymentDueDay: detail.paymentDueDay,
          spendLimitCents: detail.spendLimitCents,
        }
      }
      reminderSettings={{ paymentDue: settings.paymentDue, statementClosing: settings.statementClosing, emailsOn: settings.emailsOn }}
      celebrateId={typeof celebrateId === "string" ? celebrateId : null}
      fromReminder={fromReminder}
      safeToSpend={safeToSpend?.ok ? safeToSpend.value : undefined}
    />
  );
}
