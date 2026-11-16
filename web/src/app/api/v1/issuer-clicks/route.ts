import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { issuerClickSchema } from "@/lib/api/schemas";
import { catalogReady, findCard } from "@/lib/cards/catalog";

export async function POST(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const parsed = issuerClickSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  if (!catalogReady()) {
    return apiError(503, "catalog_unavailable", "The card catalog is not ready yet.");
  }

  const card = findCard(parsed.data.cardId);
  if (!card) return apiError(404, "not_found", "Card not found.");

  const url = parsed.data.kind === "preapproval" ? card.preapprovalUrl : card.applyUrl;
  if (!url) {
    return apiError(409, "preapproval_unavailable", "This card has no issuer preapproval check.");
  }

  const { data, error } = await student.supabase
    .from("issuer_clicks")
    .insert({
      student_id: student.studentId,
      card_id: card.id,
      kind: parsed.data.kind,
    })
    .select("id, clicked_at")
    .single();
  // A click that cannot be recorded (the daily limit, or the database is
  // down) never stops the student reaching the issuer: the address goes back
  // anyway, with no id, and only the error code is logged.
  if (error) {
    console.warn(JSON.stringify({ event: "issuer_click_not_recorded", code: error.code }));
    return Response.json(
      { id: null, cardId: card.id, kind: parsed.data.kind, url, clickedAt: null },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { id: data.id, cardId: card.id, kind: parsed.data.kind, url, clickedAt: data.clicked_at },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
