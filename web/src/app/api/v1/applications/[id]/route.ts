import { z } from "zod";

import {
  APPLICATION_DETAIL_FIELDS,
  applicationDetailFromRow,
  type ApplicationDetailRow,
} from "@/lib/api/application";
import { authenticatedStudent, type Student } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { applicationIdSchema, updateApplicationSchema } from "@/lib/api/schemas";

type Params = { params: Promise<{ id: string }> };

async function readApplication(student: Student, id: string) {
  return student.supabase
    .from("card_applications")
    .select(APPLICATION_DETAIL_FIELDS)
    .eq("id", id)
    .eq("student_id", student.studentId)
    .maybeSingle();
}

function detailResponse(row: unknown): Response {
  return Response.json(applicationDetailFromRow(row as ApplicationDetailRow), {
    headers: { "Cache-Control": "no-store" },
  });
}

// One of the student's tracked cards, with its denial reason, autopay and
// closing and due days.
export async function GET(_request: Request, context: Params): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id } = await context.params;
  if (!applicationIdSchema.safeParse(id).success) return apiError(400, "invalid_request", "Invalid application ID.");

  const { data, error } = await readApplication(student, id);
  if (error) return databaseError("application_read", error);
  if (!data) return apiError(404, "not_found", "Application not found.");
  return detailResponse(data);
}

type Update = z.infer<typeof updateApplicationSchema>;

// The columns to write, or a message when a field does not fit the status
// the application will have after this update.
function changes(body: Update, current: ApplicationDetailRow): Record<string, unknown> | string {
  const status = body.status ?? current.status;
  const set: Record<string, unknown> = {};
  if (body.status !== undefined) set.status = body.status;

  if (body.creditLimitCents !== undefined) {
    if (body.creditLimitCents !== null && status !== "approved") return "Only approved cards can have a credit limit.";
    set.credit_limit_cents = body.creditLimitCents;
  } else if (status !== "approved" && current.credit_limit_cents !== null) {
    // Leaving approved drops the limit, which only an approved card can have.
    set.credit_limit_cents = null;
  }

  for (const [field, column] of [["denialReason", "denial_reason"], ["denialReasonNote", "denial_reason_note"]] as const) {
    const value = body[field];
    if (value === undefined) continue;
    const saved = typeof value === "string" && value === "" ? null : value;
    if (saved !== null && status !== "rejected") return "Only a denied application can have a denial reason.";
    set[column] = saved;
  }

  for (const [field, column] of [["statementClosingDay", "statement_closing_day"], ["paymentDueDay", "payment_due_day"]] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (value !== null && status !== "approved") return "Closing and due days are for an approved card.";
    set[column] = value;
  }

  if (body.autopayStatus !== undefined) {
    set.autopay_status = body.autopayStatus;
    if (body.autopayStatus !== current.autopay_status) set.autopay_updated_at = new Date().toISOString();
  }
  return set;
}

// Changes any of the fields. Saving the closing or due day, the status or
// autopay re-plans the card's reminders (a trigger in the database).
export async function PATCH(request: Request, context: Params): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id } = await context.params;
  if (!applicationIdSchema.safeParse(id).success) return apiError(400, "invalid_request", "Invalid application ID.");

  const parsed = updateApplicationSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const current = await readApplication(student, id);
  if (current.error) return databaseError("application_read", current.error);
  if (!current.data) return apiError(404, "not_found", "Application not found.");

  const set = changes(parsed.data, current.data as ApplicationDetailRow);
  if (typeof set === "string") return apiError(400, "invalid_request", set);

  const { data, error } = await student.supabase
    .from("card_applications")
    .update(set)
    .eq("id", id)
    .eq("student_id", student.studentId)
    .select(APPLICATION_DETAIL_FIELDS)
    .maybeSingle();
  if (error?.code === "23505") {
    return apiError(409, "already_exists", "An active record for this card already exists.");
  }
  // A check in the database (for example a note over 200 characters)
  if (error?.code === "23514") return apiError(400, "invalid_request", "The update is invalid.");
  if (error) return databaseError("application_update", error);
  if (!data) return apiError(404, "not_found", "Application not found.");
  return detailResponse(data);
}
