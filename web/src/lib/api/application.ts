import { applicationSchema } from "./schemas";

export type ApplicationRow = {
  id: string;
  card_id: string | null;
  card_name: string | null;
  status: "applied" | "approved" | "rejected";
  credit_limit_cents: number | null;
  applied_at: string | null;
  updated_at: string;
};

export function applicationFromRow(row: ApplicationRow) {
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
