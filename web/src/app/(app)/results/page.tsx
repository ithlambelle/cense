import type { Metadata } from "next";

import { ResultsView } from "@/components/results/results-view";
import { validAnswers } from "@/lib/api/quiz-answers";
import { listCards } from "@/lib/cards/catalog";
import { computeResult } from "@/lib/results/compute";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Your card match | CENSE" };

// Works the result out on the server from the saved quiz. Nothing is saved
// yet: once the recommendation save route lands, read the saved result here
// and keep computeResult's shape.
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
  return <ResultsView view={computeResult(answers.kept, listCards())} />;
}
