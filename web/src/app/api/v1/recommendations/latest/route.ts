import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { recommendationSchema } from "@/lib/api/schemas";

export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { data, error } = await student.supabase
    .from("recommendations")
    .select("id, card_id, fit_tier, reason, created_at")
    .eq("student_id", student.studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return databaseError("recommendation_read", error);
  if (!data) return apiError(404, "not_found", "No saved recommendation yet.");

  const recommendation = recommendationSchema.parse({
    id: data.id,
    cardId: data.card_id,
    fitTier: data.fit_tier,
    reason: data.reason,
    createdAt: data.created_at,
  });

  return Response.json(recommendation, { headers: { "Cache-Control": "no-store" } });
}
