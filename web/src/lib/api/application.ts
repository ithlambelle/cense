import type { z } from "zod";

import { applicationDetailSchema, applicationSchema } from "./schemas";

// A tracked card as the app and the API see it.
export type Application = z.infer<typeof applicationSchema>;
// One card with the fields its own screens use (GET and PATCH /applications/{id}).
export type ApplicationDetail = z.infer<typeof applicationDetailSchema>;

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

// The extra columns GET and PATCH /applications/{id} read.
export const APPLICATION_DETAIL_FIELDS =
  `${APPLICATION_FIELDS}, denial_reason, denial_reason_note, autopay_status, statement_closing_day, payment_due_day`;

export type ApplicationDetailRow = ApplicationRow & {
  denial_reason: string | null;
  denial_reason_note: string | null;
  autopay_status: string;
  statement_closing_day: number | null;
  payment_due_day: number | null;
};

export function applicationDetailFromRow(row: ApplicationDetailRow): ApplicationDetail {
  return applicationDetailSchema.parse({
    ...applicationFromRow(row),
    denialReason: row.denial_reason,
    denialReasonNote: row.denial_reason_note,
    autopayStatus: row.autopay_status,
    statementClosingDay: row.statement_closing_day,
    paymentDueDay: row.payment_due_day,
  });
}
