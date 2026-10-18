import type { Metadata } from "next";

import { QuizFlow } from "@/components/quiz/quiz-flow";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Quiz | CENSE" };

export default async function QuizPage() {
  await requireStudent(ROUTES.quiz);
  return <QuizFlow />;
}
