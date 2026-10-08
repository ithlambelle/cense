import { applicationFromRow, type ApplicationRow } from "@/lib/api/application";
import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { createApplicationSchema } from "@/lib/api/schemas";

const fields = "id, card_id, card_name, status, credit_limit_cents, applied_at, status_updated_at";

export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { data, error } = await student.supabase
    .from("applications")
    .select(fields)
    .eq("student_id", student.studentId)
    .order("status_updated_at", { ascending: false });
  if (error) return databaseError("applications_list", error);

  return Response.json(
    { applications: (data as ApplicationRow[]).map(applicationFromRow) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const parsed = createApplicationSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const now = new Date().toISOString();
  const { cardId, cardName, status, creditLimitCents } = parsed.data;
  const { data, error } = await student.supabase
    .from("applications")
    .insert({
      student_id: student.studentId,
      card_id: cardId,
      card_name: cardName,
      status,
      credit_limit_cents: creditLimitCents,
      applied_at: status === "applied" ? now : null,
      status_updated_at: now,
    })
    .select(fields)
    .single();

  if (error?.code === "23505") {
    return apiError(409, "already_exists", "This card already has an application record.");
  }
  if (error) return databaseError("application_create", error);

  return Response.json(applicationFromRow(data as ApplicationRow), {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
