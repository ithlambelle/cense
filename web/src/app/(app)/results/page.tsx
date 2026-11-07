import type { Metadata } from "next";

import { ResultsView } from "@/components/results/results-view";
import { validAnswers } from "@/lib/api/quiz-answers";
import { listCards } from "@/lib/cards/catalog";
import { answeredCount } from "@/lib/quiz/progress";
import { computeResult } from "@/lib/results/compute";
import { saveRecommendation } from "@/lib/results/save";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Your card match | CENSE" };

// Works the result out on the server from the saved quiz, then saves it with
// the rules and card data versions (save_recommendation). A reload with the
// same answers saves nothing new, and a failed save never blocks the screen.
export default async function ResultsPage() {
  const student = await requireStudent(ROUTES.results);

  const { data, error } = await student.supabase
    .from("quiz_drafts")
    .select("answers")
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) throw new Error("Could not read the saved quiz.");

  // Read the same way as GET /quiz, so a draft with one answer the schema now
  // rejects asks for that answer again instead of discarding all of them.
  const answers = validAnswers(data?.answers ?? {});
  if (answers.dropped) console.warn(JSON.stringify({ event: "quiz_draft_invalid", operation: "results_read" }));
  const cards = listCards();
  await saveRecommendation(student, answers.kept, cards);
  return <ResultsView view={computeResult(answers.kept, cards)} answered={answeredCount(answers.kept)} />;
}
