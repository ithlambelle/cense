import { APPLICATION_FIELDS, applicationFromRow, type ApplicationRow } from "@/lib/api/application";
import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { createApplicationSchema } from "@/lib/api/schemas";
import { findCard } from "@/lib/cards/catalog";
import { catalogCardNamed } from "@/lib/cards/match";
import { cardDisplayName } from "@/lib/copy/results";

export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { data, error } = await student.supabase
    .from("card_applications")
    .select(APPLICATION_FIELDS)
    .eq("student_id", student.studentId)
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

  // A catalog card the student already saved by its name, before Add a card
  // offered the list (no catalog id), is the same card: no second record.
  const catalogCard = cardId ? findCard(cardId) : undefined;
  if (catalogCard) {
    const named = await student.supabase
      .from("card_applications")
      .select("card_name")
      .eq("student_id", student.studentId)
      .is("card_id", null)
      .in("status", ["applied", "approved"]);
    if (named.error) return databaseError("applications_read", named.error);
    const choice = [{ id: catalogCard.id, name: cardDisplayName(catalogCard) }];
    if (((named.data ?? []) as { card_name: string | null }[]).some((row) => row.card_name && catalogCardNamed(choice, row.card_name))) {
      return apiError(409, "already_exists", "An active record for this card already exists.");
    }
  }
  const { data, error } = await student.supabase
    .from("card_applications")
    .insert({
      student_id: student.studentId,
      card_id: cardId,
      card_name: cardName,
      source: status === "approved" ? "added" : "application",
      status,
      credit_limit_cents: creditLimitCents,
      applied_at: status === "applied" ? now : null,
    })
    .select(APPLICATION_FIELDS)
    .single();

  if (error?.code === "23505") {
    return apiError(409, "already_exists", "An active record for this card already exists.");
  }
  // The database keeps at most 25 card records per student. Only a card added
  // by hand can be removed, so this rarely passes with time.
  if (error?.code === "54000") return apiError(409, "limit_reached", "You’ve reached the card limit.");
  if (error) return databaseError("application_create", error);

  return Response.json(applicationFromRow(data as ApplicationRow), {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
