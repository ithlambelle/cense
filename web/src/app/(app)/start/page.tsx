import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadStudentSnapshot } from "@/lib/student-data";

// Where a student lands after signing in, decided on the server (plan A1.3):
// anyone tracking a card goes Home; a finished quiz with nothing tracked goes
// to the result; everyone else goes Home, which offers the quiz.
export default async function StartPage() {
  const student = await requireStudent(ROUTES.start);
  const { applications, quiz } = await loadStudentSnapshot(student);
  if (applications.length === 0 && quiz.kind !== "quiz_unfinished") redirect(ROUTES.results);
  redirect(ROUTES.home);
}
