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
  if (error) return databaseError("issuer_click_create", error);

  return Response.json(
    { id: data.id, cardId: card.id, kind: parsed.data.kind, url, clickedAt: data.clicked_at },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
