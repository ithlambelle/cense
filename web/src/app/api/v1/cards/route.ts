import { apiError } from "@/lib/api/errors";
import { catalogReady, listCards } from "@/lib/cards/catalog";

export async function GET(): Promise<Response> {
  if (!catalogReady()) {
    return apiError(503, "catalog_unavailable", "The card catalog is not ready yet.");
  }
  return Response.json({ cards: listCards() });
}
