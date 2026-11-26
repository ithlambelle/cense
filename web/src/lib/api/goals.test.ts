// Created with Claude Code (2026-11-26). A saved goal reads back as it was
// saved: its date and monthly amount are stored, never worked out again.
import { describe, expect, it } from "vitest";

import { goalFromRow } from "./goals";

describe("goalFromRow", () => {
  it("shows the stored date and monthly amount, whatever day it is read", () => {
    const row = { preset: "trip", name: "Trip", amount_cents: "60000", target_date: "2027-03-01", monthly_cents: "20000", accepted_monthly_cents: null, updated_at: "2026-11-26T15:00:00+00:00" };
    expect(goalFromRow(row)).toEqual({
      preset: "trip",
      name: "Trip",
      amountCents: 60_000,
      targetDate: "2027-03-01",
      monthlyCents: 20_000,
      acceptedMonthlyCents: null,
      updatedAt: "2026-11-26T15:00:00.000Z",
    });
  });
});
