import type { Metadata } from "next";

import { AccountView } from "@/components/account/account-view";
import { plaidConfig } from "@/lib/plaid/config";
import { linkStatus } from "@/lib/plaid/store";
import { profileUpdates, type ProfileUpdates, type SentReminder } from "@/lib/profile-updates";
import { reminderKindParam, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import type { Student } from "@/lib/api/auth";
import { safeTimeZone } from "@/lib/api/reminders";
import { loadStudentSnapshot } from "@/lib/student-data";

export const metadata: Metadata = { title: "Your account | CENSE" };

// The sent reminder emails, dated on the student's calendar. The section is
// extra: a failed read leaves it out and the page still works.
async function loadUpdates(student: Student): Promise<ProfileUpdates | null> {
  const [reminders, profile] = await Promise.all([
    student.supabase
      .from("reminders")
      .select("kind, occurrence, sent_at")
      .eq("student_id", student.studentId)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(50),
    student.supabase.from("profiles").select("time_zone").eq("student_id", student.studentId).maybeSingle(),
  ]);
  if (reminders.error) {
    console.warn(JSON.stringify({ event: "profile_updates_read_failed" }));
    return null;
  }
  const sent: SentReminder[] = [];
  for (const row of reminders.data as { kind: string; occurrence: string; sent_at: string }[]) {
    const kind = reminderKindParam(row.kind);
    if (kind) sent.push({ kind, occurrence: row.occurrence, sentAt: new Date(row.sent_at).toISOString() });
  }
  // A failed time zone read falls back to New York, as the reminders do.
  return profileUpdates(sent, safeTimeZone((profile.data as { time_zone: string | null } | null)?.time_zone));
}

export default async function AccountPage() {
  const student = await requireStudent(ROUTES.settings);
  const [{ applications, quiz, quizAnswered }, updates, bank] = await Promise.all([
    loadStudentSnapshot(student),
    loadUpdates(student),
    linkStatus(student),
  ]);
  const card = applications.find((application) => application.status === "approved") ?? applications[0] ?? null;
  return (
    <AccountView
      email={student.email}
      card={card}
      quizAnswered={quizAnswered}
      quizResult={quiz.kind}
      updates={updates}
      // Accounts opens the linked bank (How we got this), so it shows only once one is linked.
      bankLinked={plaidConfig() !== null && bank.ok && bank.value !== null}
    />
  );
}
