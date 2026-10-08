import { apiError } from "@/lib/api/errors";
import { catalogReady, findCard } from "@/lib/cards/catalog";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (!catalogReady()) {
    return apiError(503, "catalog_unavailable", "The card catalog is not ready yet.");
  }
  const card = findCard(id);
  if (!card) return apiError(404, "not_found", "Card not found.");
  return Response.json(card);
}
