import { cardSchema } from "@/lib/api/schemas";

// Add only team-reviewed card facts and issuer URLs from the approved dataset.
// An empty catalog is explicit until that source is supplied.
const cardCatalog = cardSchema.array().parse([]);

export function listCards() {
  return cardCatalog;
}

export function catalogReady() {
  return cardCatalog.length > 0;
}

export function findCard(id: string) {
  return cardCatalog.find((card) => card.id === id);
}
