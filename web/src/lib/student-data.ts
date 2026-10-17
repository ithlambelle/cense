import "server-only";

import { applicationFromRow, type ApplicationRow } from "@/lib/api/application";
import { validAnswers } from "@/lib/api/quiz-answers";
import type { authenticatedStudent } from "@/lib/api/auth";
import { listCards } from "@/lib/cards/catalog";
import type { Application } from "@/lib/home/state";
import { firstUnanswered } from "@/lib/quiz/questions";
import { computeResult, type ResultView } from "@/lib/results/compute";

type Student = NonNullable<Awaited<ReturnType<typeof authenticatedStudent>>>;

export type StudentSnapshot = {
  applications: Application[];
  quiz: ResultView;
  // True when at least one quiz answer is saved.
  quizStarted: boolean;
};

const APPLICATION_FIELDS = "id, card_id, card_name, status, credit_limit_cents, applied_at, updated_at";

// What a signed-in screen needs to decide what to show, read on the server
// with the student's own session (RLS limits every read to their rows). Both
// tables are readable by students; nothing here writes.
export async function loadStudentSnapshot(student: Student): Promise<StudentSnapshot> {
  const [applications, draft] = await Promise.all([
    student.supabase
      .from("card_applications")
      .select(APPLICATION_FIELDS)
      .eq("student_id", student.studentId)
      .order("updated_at", { ascending: false }),
    student.supabase.from("quiz_drafts").select("answers").eq("student_id", student.studentId).maybeSingle(),
  ]);
  if (applications.error) throw new Error("Could not read the student's cards.");
  if (draft.error) throw new Error("Could not read the student's quiz.");

  // Read the same way as GET /quiz: a draft the schema now rejects (an old
  // field, a retired choice) keeps its valid answers, so Home matches what
  // the quiz resumes from instead of treating the student as not started.
  const answers = validAnswers(draft.data?.answers ?? {});
  if (answers.dropped) console.warn(JSON.stringify({ event: "quiz_draft_invalid", operation: "snapshot_read" }));
  return {
    applications: (applications.data as ApplicationRow[]).map(applicationFromRow),
    quiz: computeResult(answers.kept, listCards()),
    quizStarted: firstUnanswered(answers.kept) !== 0,
  };
}

// One tracked card, if it belongs to this student (RLS returns nothing otherwise).
export async function loadApplication(student: Student, applicationId: string): Promise<Application | null> {
  const { data, error } = await student.supabase
    .from("card_applications")
    .select(APPLICATION_FIELDS)
    .eq("id", applicationId)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) throw new Error("Could not read the student's card.");
  return data ? applicationFromRow(data as ApplicationRow) : null;
}
