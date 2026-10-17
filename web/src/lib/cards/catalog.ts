import type { z } from "zod";

import { cardSchema } from "../api/schemas";

import cards from "./cards.json";

// Team-reviewed card facts. Every eligibility fact carries its basis (issuer,
// silent, estimate or decision), the pages it was read from and the date, in
// eligibilityEvidence. Change a value only after re-reading those pages, and
// update its verifiedAt. Only catalogRole "recommend" cards are tiered.
const cardCatalog = cardSchema.array().parse(cards);

// One card from the catalog, as the API returns it.
export type Card = z.infer<typeof cardSchema>;

export function listCards() {
  return cardCatalog;
}

export function catalogReady() {
  return cardCatalog.length > 0;
}

export function findCard(id: string) {
  return cardCatalog.find((card) => card.id === id);
}
