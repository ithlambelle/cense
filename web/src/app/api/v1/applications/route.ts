import { applicationFromRow, centsToDatabaseAmount, type ApplicationRow } from "@/lib/api/application";
import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { createApplicationSchema } from "@/lib/api/schemas";

const fields = "id, card_id, card_name, status, credit_limit, applied_at, updated_at";

export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { data, error } = await student.supabase
    .from("card_applications")
    .select(fields)
    .eq("user_id", student.studentId)
    .order("updated_at", { ascending: false });
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
    .from("card_applications")
    .insert({
      user_id: student.studentId,
      card_id: cardId,
      card_name: cardName,
      source: status === "approved" ? "added" : "application",
      status,
      credit_limit: centsToDatabaseAmount(creditLimitCents),
      applied_at: status === "applied" ? now : null,
    })
    .select(fields)
    .single();

  if (error?.code === "23505") {
    return apiError(409, "already_exists", "This account already has a card application record.");
  }
  if (error) return databaseError("application_create", error);

  return Response.json(applicationFromRow(data as ApplicationRow), {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
