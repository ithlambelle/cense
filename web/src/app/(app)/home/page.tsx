import type { Metadata } from "next";

import { HomeView } from "@/components/home/home-view";
import type { Student } from "@/lib/api/auth";
import type { SafeToSpend } from "@/lib/api/safe-to-spend";
import { comingUpRows } from "@/lib/home/coming-up";
import { ALL_REMINDERS_ON, homeState, needsDetail, profileInitial } from "@/lib/home/state";
import { plaidConfig } from "@/lib/plaid/config";
import { linkAccess } from "@/lib/plaid/pilot";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { CELEBRATE_PARAM, REMINDER_PARAM, reminderKindParam, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadApplicationDetail, loadComingUpCards, loadReminderSettings, loadStudentSnapshot } from "@/lib/student-data";

export const metadata: Metadata = { title: "Home | CENSE" };

type SafeToSpendCard = { value: SafeToSpend | null; sandbox: boolean } | undefined;

// Home's safe to spend card: the student's bank, null to invite them to link
// one, or undefined to leave the card out. Left out when safe to spend is
// off, when a read fails, and, in production, for a student with no bank who
// cannot link one (not in the pilot, or no room left, lib/plaid/pilot.ts):
// there is nothing to invite them to. A student with a bank is never asked
// about the pilot. `sandbox` picks the invitation's words.
async function safeToSpendCard(student: Student): Promise<SafeToSpendCard> {
  const config = plaidConfig();
  if (!config) return undefined;
  const sandbox = config.environment === "sandbox";
  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) return undefined;
  if (loaded.value) return { value: loaded.value, sandbox };
  const access = await linkAccess(student, config);
  if (!access.ok || access.value !== "open") return undefined;
  return { value: null, sandbox };
}

// Read on the server, so Home never flashes a loading state. Opened from an
// older reminder email's button (?reminder=<kind>; new ones open Updates), it counts the visit; a
// signed-out student comes back to the same address after signing in.
export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const params = await searchParams;
  const fromReminder = reminderKindParam(params[REMINDER_PARAM]);
  const student = await requireStudent(fromReminder ? `${ROUTES.home}?${REMINDER_PARAM}=${fromReminder}` : ROUTES.home);
  const { applications, quiz, quizAnswered } = await loadStudentSnapshot(student);
  const state = homeState(applications, quiz, quizAnswered);
  // The leading card's denial reason and autopay, read the same way as
  // GET /applications/{id}. Only those fields reach the page. An approved
  // card's reminder star also needs the student's reminder settings.
  // Safe to spend (US-12) is read alongside, only when Plaid is set up
  // (safeToSpendCard). A failed read leaves its card out rather than failing
  // Home. So does Coming
  // up's (D1): the approved cards' dates, with the bills from safe to spend.
  const [detailAndSettings, safeToSpend, comingUpCards] = await Promise.all([
    needsDetail(state)
      ? Promise.all([
          loadApplicationDetail(student, state.primary.id),
          state.primary.status === "approved" ? loadReminderSettings(student) : ALL_REMINDERS_ON,
        ])
      : null,
    safeToSpendCard(student),
    loadComingUpCards(student),
  ]);
  const [detail, settings] = detailAndSettings ?? [null, ALL_REMINDERS_ON];
  const celebrateId = params[CELEBRATE_PARAM];
  // Paychecks join once detected income is wired to the student's data (US-16).
  // With a bank linked, Coming up looks as many days ahead as the number says
  // it covers (safe to spend's own `days`), so the two cannot drift apart;
  // with none, its default (COMING_UP_DAYS).
  const linked = safeToSpend?.value ?? null;
  const comingUp = comingUpCards ? comingUpRows({ ...comingUpCards, bills: linked?.bills ?? [], days: linked?.days }) : [];
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
      safeToSpend={safeToSpend?.value}
      bankSandbox={safeToSpend?.sandbox ?? true}
      comingUp={comingUp}
    />
  );
}
