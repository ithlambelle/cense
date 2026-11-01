import type { Metadata } from "next";

import { QuizFlow } from "@/components/quiz/quiz-flow";
import { quizBackHref, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Quiz | CENSE" };

// ?from= is where the quiz was opened (Cards or Results): the back arrow on
// the first question returns there.
export default async function QuizPage({ searchParams }: PageProps<"/quiz">) {
  await requireStudent(ROUTES.quiz);
  const { from } = await searchParams;
  return <QuizFlow backHref={quizBackHref(from)} />;
}
