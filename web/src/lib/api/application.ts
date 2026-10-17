import type { z } from "zod";

import { applicationSchema } from "./schemas";

// A tracked card as the app and the API see it.
export type Application = z.infer<typeof applicationSchema>;

// The card_applications columns every read selects, in ApplicationRow's shape.
export const APPLICATION_FIELDS = "id, card_id, card_name, status, credit_limit_cents, applied_at, updated_at";

export type ApplicationRow = {
  id: string;
  card_id: string | null;
  card_name: string | null;
  status: "applied" | "approved" | "rejected";
  credit_limit_cents: number | null;
  applied_at: string | null;
  updated_at: string;
};

export function applicationFromRow(row: ApplicationRow): Application {
  return applicationSchema.parse({
    id: row.id,
    cardId: row.card_id,
    cardName: row.card_name ?? row.card_id,
    status: row.status,
    creditLimitCents: row.credit_limit_cents,
    appliedAt: row.applied_at,
    statusUpdatedAt: row.updated_at,
  });
}
