import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { readDisplayName } from "@/lib/api/profile";
import { updateMeSchema } from "@/lib/api/schemas";

export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  return Response.json(
    { id: student.studentId, email: student.email, name: await readDisplayName(student) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const parsed = updateMeSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  // The profile row may not exist yet: it is created on the first save.
  const name = parsed.data.name || null;
  const { error } = await student.supabase
    .from("profiles")
    .upsert({ student_id: student.studentId, display_name: name }, { onConflict: "student_id" });
  if (error) return databaseError("profile_update", error);

  return Response.json(
    { id: student.studentId, email: student.email, name },
    { headers: { "Cache-Control": "no-store" } },
  );
}
