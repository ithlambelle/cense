import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { saveQuizSchema } from "@/lib/api/schemas";

export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { data, error } = await student.supabase
    .from("quiz_drafts")
    .select("answers, updated_at")
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) return databaseError("quiz_read", error);
  if (!data) return apiError(404, "not_found", "No saved quiz yet.");

  return Response.json(
    { answers: data.answers, updatedAt: data.updated_at },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const parsed = saveQuizSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await student.supabase
    .from("quiz_drafts")
    .upsert({ student_id: student.studentId, answers: parsed.data.answers })
    .select("answers, updated_at")
    .single();
  if (error) return databaseError("quiz_save", error);

  return Response.json(
    { answers: data.answers, updatedAt: data.updated_at },
    { headers: { "Cache-Control": "no-store" } },
  );
}
