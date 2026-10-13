import { describe, expect, it } from "vitest";

import { applicationFromRow, centsToDatabaseAmount } from "./application";

describe("card application database mapping", () => {
  it("keeps API money in whole cents when the database stores decimal dollars", () => {
    expect(centsToDatabaseAmount(12345)).toBe(123.45);
    expect(centsToDatabaseAmount(null)).toBeNull();

    expect(applicationFromRow({
      id: "3ec69fa1-44e9-49b9-8a63-064a0a213477",
      card_id: "card-1",
      card_name: null,
      status: "approved",
      credit_limit: 123.45,
      applied_at: null,
      updated_at: "2026-10-09T08:00:00.000Z",
    })).toMatchObject({
      cardId: "card-1",
      cardName: "card-1",
      creditLimitCents: 12345,
      statusUpdatedAt: "2026-10-09T08:00:00.000Z",
    });
  });
});
