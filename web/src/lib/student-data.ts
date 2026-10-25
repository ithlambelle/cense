import "server-only";

import {
  APPLICATION_DETAIL_FIELDS,
  APPLICATION_FIELDS,
  applicationDetailFromRow,
  applicationFromRow,
  type Application,
  type ApplicationDetail,
  type ApplicationDetailRow,
  type ApplicationRow,
} from "@/lib/api/application";
import { validAnswers } from "@/lib/api/quiz-answers";
import {
  REMINDER_SETTINGS_FIELDS,
  reminderSettingsFromRow,
  type ReminderSettings,
  type ReminderSettingsRow,
} from "@/lib/api/reminders";
import type { Student } from "@/lib/api/auth";
import { listCards } from "@/lib/cards/catalog";
import { firstUnanswered } from "@/lib/quiz/questions";
import { computeResult, type ResultView } from "@/lib/results/compute";

export type StudentSnapshot = {
  applications: Application[];
  quiz: ResultView;
  // True when at least one quiz answer is saved.
  quizStarted: boolean;
};

// What a signed-in screen needs to decide what to show, read on the server
// with the student's own session (RLS limits every read to their rows). Both
// tables are readable by students; nothing here writes.
export async function loadStudentSnapshot(student: Student): Promise<StudentSnapshot> {
  const [applications, answers] = await Promise.all([loadApplications(student), readQuizAnswers(student, "snapshot_read")]);
  return {
    applications,
    quiz: computeResult(answers, listCards()),
    quizStarted: firstUnanswered(answers) !== 0,
  };
}

// Every tracked card, most recently changed first, for screens that do not
// need the quiz (a card's page).
export async function loadApplications(student: Student): Promise<Application[]> {
  const { data, error } = await student.supabase
    .from("card_applications")
    .select(APPLICATION_FIELDS)
    .eq("student_id", student.studentId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Could not read the student's cards.");
  return (data as ApplicationRow[]).map(applicationFromRow);
}

// Only the quiz result, for screens that show the match but not the tracked
// cards (the Cards tab).
export async function loadQuizResult(student: Student): Promise<ResultView> {
  return computeResult(await readQuizAnswers(student, "result_read"), listCards());
}

// Read the same way as GET /quiz: a draft the schema now rejects (an old
// field, a retired choice) keeps its valid answers, so Home matches what the
// quiz resumes from instead of treating the student as not started.
async function readQuizAnswers(student: Student, operation: string) {
  const draft = await student.supabase.from("quiz_drafts").select("answers").eq("student_id", student.studentId).maybeSingle();
  if (draft.error) throw new Error("Could not read the student's quiz.");
  const answers = validAnswers(draft.data?.answers ?? {});
  if (answers.dropped) console.warn(JSON.stringify({ event: "quiz_draft_invalid", operation }));
  return answers.kept;
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

// One tracked card with its denial reason and note, autopay and closing and
// due days, read as GET /applications/{id} reads it. Null when it is not this
// student's.
export async function loadApplicationDetail(student: Student, applicationId: string): Promise<ApplicationDetail | null> {
  const { data, error } = await student.supabase
    .from("card_applications")
    .select(APPLICATION_DETAIL_FIELDS)
    .eq("id", applicationId)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) throw new Error("Could not read the student's card.");
  return data ? applicationDetailFromRow(data as ApplicationDetailRow) : null;
}

// The student's reminder settings, read as GET /me/reminder-settings reads
// them. A student without a profile row yet gets the database defaults: every
// reminder on.
export async function loadReminderSettings(student: Student): Promise<ReminderSettings> {
  const { data, error } = await student.supabase
    .from("profiles")
    .select(REMINDER_SETTINGS_FIELDS)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) throw new Error("Could not read the student's reminder settings.");
  return data
    ? reminderSettingsFromRow(data as ReminderSettingsRow)
    : { emailsOn: true, statementClosing: true, paymentDue: true, checkAutopay: true };
}

// What the payment reminder screen starts from: one card with its closing and
// due days, the student's reminder settings (the same reads as GET
// /applications/{id} and GET /me/reminder-settings), and whether this card
// gets the one first-statement email: only a card the student just got, not
// one they already had (source "added"), with that email on and autopay not
// on. Null when the card is not theirs.
export async function loadReminderSetup(
  student: Student,
  applicationId: string,
): Promise<{ application: ApplicationDetail; settings: ReminderSettings; firstStatementEmail: boolean } | null> {
  const [application, settings] = await Promise.all([
    student.supabase
      .from("card_applications")
      .select(`${APPLICATION_DETAIL_FIELDS}, source`)
      .eq("id", applicationId)
      .eq("student_id", student.studentId)
      .maybeSingle(),
    loadReminderSettings(student),
  ]);
  if (application.error) throw new Error("Could not read the student's card.");
  if (!application.data) return null;
  const row = application.data as ApplicationDetailRow & { source: "application" | "added" };
  const detail = applicationDetailFromRow(row);
  return {
    application: detail,
    settings,
    firstStatementEmail: row.source === "application" && settings.checkAutopay && detail.autopayStatus !== "on",
  };
}
