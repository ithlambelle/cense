import { describe, expect, it } from "vitest";

import { saveSafeToSpendAnswersSchema, safeToSpendFromRows, safeToSpendSchema } from "./safe-to-spend";

const BILLS = [
  { bill: "rent", coveredBy: "me", monthlyCents: 65_000, dueDay: 31 },
  { bill: "phone", coveredBy: "split", monthlyCents: 4_000, dueDay: 31 },
  { bill: "tuition", coveredBy: "family", monthlyCents: null, dueDay: null },
  { bill: "groceries", coveredBy: "none", monthlyCents: null, dueDay: null },
  { bill: "car", coveredBy: "none", monthlyCents: null, dueDay: null },
];

describe("saveSafeToSpendAnswersSchema", () => {
  it("takes one answer per bill and a set-aside", () => {
    expect(saveSafeToSpendAnswersSchema.safeParse({ bills: BILLS, setAsideCents: 5_000 }).success).toBe(true);
  });

  it("needs an amount for me and split, and none for family or not applicable", () => {
    const missing = BILLS.map((b) => (b.bill === "rent" ? { ...b, monthlyCents: null } : b));
    const extra = BILLS.map((b) => (b.bill === "tuition" ? { ...b, monthlyCents: 100 } : b));
    expect(saveSafeToSpendAnswersSchema.safeParse({ bills: missing, setAsideCents: 0 }).success).toBe(false);
    expect(saveSafeToSpendAnswersSchema.safeParse({ bills: extra, setAsideCents: 0 }).success).toBe(false);
  });

  it("needs a due day for a monthly bill the student pays, and none for tuition", () => {
    const noDay = BILLS.map((b) => (b.bill === "rent" ? { ...b, dueDay: null } : b));
    const tuitionDay = BILLS.map((b) => (b.bill === "tuition" ? { ...b, coveredBy: "me", monthlyCents: 100, dueDay: 5 } : b));
    const tuitionNoDay = BILLS.map((b) => (b.bill === "tuition" ? { ...b, coveredBy: "me", monthlyCents: 100 } : b));
    expect(saveSafeToSpendAnswersSchema.safeParse({ bills: noDay, setAsideCents: 0 }).success).toBe(false);
    expect(saveSafeToSpendAnswersSchema.safeParse({ bills: tuitionDay, setAsideCents: 0 }).success).toBe(false);
    expect(saveSafeToSpendAnswersSchema.safeParse({ bills: tuitionNoDay, setAsideCents: 0 }).success).toBe(true);
  });

  it("refuses a missing or repeated bill, a negative or huge amount, and unknown fields", () => {
    const repeated = BILLS.map((b) => (b.bill === "car" ? { ...b, bill: "rent" } : b));
    for (const body of [
      { bills: BILLS.slice(1), setAsideCents: 0 },
      { bills: repeated, setAsideCents: 0 },
      { bills: BILLS, setAsideCents: -1 },
      { bills: BILLS, setAsideCents: 10_000_001 },
      { bills: BILLS, setAsideCents: 1.5 },
      { bills: BILLS, setAsideCents: 0, note: "hi" },
      { bills: BILLS.map((b) => ({ ...b, extra: true })), setAsideCents: 0 },
    ]) {
      expect(saveSafeToSpendAnswersSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("safeToSpendFromRows", () => {
  it("orders accounts, reads bigint strings and works out the sum", () => {
    const result = safeToSpendFromRows(
      {
        institution_name: "First Platypus Bank",
        status: "active",
        linked_at: "2026-10-25T16:00:00+00:00",
        refreshed_at: "2026-10-25T16:00:01+00:00",
        set_aside_cents: "5000",
        answered_at: "2026-10-25T16:01:00+00:00",
      },
      [
        { position: 1, name: "Plaid Credit Card", mask: "3333", kind: "card", balance_cents: "31000" },
        { position: 0, name: "Plaid Checking", mask: "0000", kind: "cash", balance_cents: 124000 },
      ],
      BILLS.map((b) => ({ bill: b.bill, covered_by: b.coveredBy, monthly_cents: b.monthlyCents === null ? null : String(b.monthlyCents), due_day: b.dueDay })),
    );
    expect(result.accounts.map((a) => a.name)).toEqual(["Plaid Checking", "Plaid Credit Card"]);
    expect(result).toMatchObject({ answered: true, cashCents: 124_000, cardCents: 31_000, billsCents: 69_000, setAsideCents: 5_000, dailyCents: 633 });
    expect(result.refreshedAt).toBe("2026-10-25T16:00:01.000Z");
    expect(safeToSpendSchema.safeParse(result).success).toBe(true);
  });

  it("is not answered until the questions are saved", () => {
    const result = safeToSpendFromRows(
      { institution_name: "Bank", status: "reconnect_needed", linked_at: "2026-10-25T16:00:00Z", refreshed_at: null, set_aside_cents: 0, answered_at: null },
      [],
      [],
    );
    expect(result).toMatchObject({ answered: false, status: "reconnect_needed", bills: [], dailyCents: 0, refreshedAt: null });
  });
});
