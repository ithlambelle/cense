import type { Metadata } from "next";

import { ResultsView } from "@/components/results/results-view";
import type { Application } from "@/lib/api/application";
import type { Student } from "@/lib/api/auth";
import { validAnswers } from "@/lib/api/quiz-answers";
import { listCards } from "@/lib/cards/catalog";
import { cardApplication } from "@/lib/home/state";
import { answeredCount } from "@/lib/quiz/progress";
import { cardsToOffer, computeResult } from "@/lib/results/compute";
import { saveRecommendation } from "@/lib/results/save";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadApplications } from "@/lib/student-data";

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
  const applications = await readApplications(student);
  // Never a card the student already has; what is saved is what is shown.
  const cards = cardsToOffer(listCards(), applications);
  await saveRecommendation(student, answers.kept, cards);
  const view = computeResult(answers.kept, cards);
  // Like the card page, the top match offers no preapproval check or apply
  // hand-off for a card the student already tracks (applied or denied).
  const topTracked = view.kind === "match" && cardApplication(applications, view.options[0].card.id) !== null;
  return <ResultsView view={view} answered={answeredCount(answers.kept)} topTracked={topTracked} />;
}

// A failed read only leaves every card in and the buttons showing, as for a
// student who tracks nothing.
async function readApplications(student: Student): Promise<Application[]> {
  try {
    return await loadApplications(student);
  } catch {
    console.warn(JSON.stringify({ event: "results_applications_read_failed" }));
    return [];
  }
}
