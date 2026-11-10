import type { Metadata } from "next";

import { AccountView } from "@/components/account/account-view";
import { plaidConfig } from "@/lib/plaid/config";
import { linkStatus } from "@/lib/plaid/store";
import { profileUpdates, type ProfileUpdates } from "@/lib/profile-updates";
import { loadInAppReminders } from "@/lib/reminders/in-app-data";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import type { Student } from "@/lib/api/auth";
import { loadStudentSnapshot } from "@/lib/student-data";

export const metadata: Metadata = { title: "Your account | CENSE" };

// The sent reminder emails, read as Updates reads them, so Profile's "new"
// count matches that screen. The section is extra: a failed read leaves it
// out and the page still works.
async function loadUpdates(student: Student): Promise<ProfileUpdates | null> {
  try {
    const { reminders, cards, timeZone } = await loadInAppReminders(student);
    return profileUpdates(reminders, cards, timeZone);
  } catch {
    console.warn(JSON.stringify({ event: "profile_updates_read_failed" }));
    return null;
  }
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
