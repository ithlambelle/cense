import type { Metadata } from "next";

import { IdentifyStudent } from "@/components/analytics/identify-student";
import { QuizFlow } from "@/components/quiz/quiz-flow";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Quiz | CENSE" };

export default async function QuizPage() {
  const student = await requireStudent(ROUTES.quiz);
  return (
    <>
      <IdentifyStudent studentId={student.studentId} />
      <QuizFlow />
    </>
  );
}
