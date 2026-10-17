import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountView } from "@/components/account/account-view";
import { authenticatedStudent } from "@/lib/api/auth";
import { ROUTES, signInPath } from "@/lib/routes";
import { loadStudentSnapshot } from "@/lib/student-data";

export const metadata: Metadata = { title: "Your account | CENSE" };

export default async function AccountPage() {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  const { applications } = await loadStudentSnapshot(student);
  const card = applications.find((application) => application.status === "approved") ?? applications[0] ?? null;
  return <AccountView email={student.email} card={card} />;
}
