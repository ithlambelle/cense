import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResultsView } from "@/components/results/results-view";
import { authenticatedStudent } from "@/lib/api/auth";
import { listCards } from "@/lib/cards/catalog";
import { computeResult } from "@/lib/results/compute";
import { ROUTES, signInPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Your card match | CENSE" };

// Works the result out on the server from the saved quiz. Nothing is saved
// yet: once the recommendation save route lands, read the saved result here
// and keep computeResult's shape.
export default async function ResultsPage() {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.results));

  const { data, error } = await student.supabase
    .from("quiz_drafts")
    .select("answers")
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) throw new Error("Could not read the saved quiz.");

  return <ResultsView view={computeResult(data?.answers, listCards())} />;
}
