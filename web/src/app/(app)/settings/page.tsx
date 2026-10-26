import type { Metadata } from "next";

import { AccountView } from "@/components/account/account-view";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadStudentSnapshot } from "@/lib/student-data";

export const metadata: Metadata = { title: "Your account | CENSE" };

export default async function AccountPage() {
  const student = await requireStudent(ROUTES.home);
  const { applications, quiz, quizAnswered } = await loadStudentSnapshot(student);
  const card = applications.find((application) => application.status === "approved") ?? applications[0] ?? null;
  return <AccountView email={student.email} card={card} quizAnswered={quizAnswered} quizResult={quiz.kind} />;
}
