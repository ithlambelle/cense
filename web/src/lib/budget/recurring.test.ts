import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { detectRecurringTransactions, type RecurringTransaction } from "./recurring";

function series(dates: string[], overrides: Partial<RecurringTransaction> = {}): RecurringTransaction[] {
  return dates.map((posted_on) => ({
    transaction_id: `${overrides.account_id ?? "checking"}:${overrides.merchant_name ?? "Internet"}:${overrides.amount_cents ?? 5000}:${posted_on}`,
    account_id: "checking", posted_on, amount_cents: 5000, pending: false,
    category: "GENERAL_SERVICES", merchant_name: "Internet", ...overrides,
  }));
}

describe("recurring transaction suggestions", () => {
  it("preserves the calendar anchor across February and estimates the median bill", () => {
    const rows = series(["2026-01-31", "2026-02-28", "2026-03-31"]);
    rows[0].amount_cents = 4900;
    rows[2].amount_cents = 5200;
    expect(detectRecurringTransactions(rows.reverse(), "2026-04-04")).toMatchObject([
      { name: "Internet", kind: "bill", cadence: "monthly", amountCents: 5000, nextDate: "2026-04-30", occurrences: 3 },
    ]);
  });

  it("uses Plaid's sign convention and separates weekly bills from biweekly wages", () => {
    const bills = series(["2026-10-23", "2026-10-30", "2026-11-06"]);
    const pay = series(["2026-10-09", "2026-10-23", "2026-11-06"], { merchant_name: "Campus payroll", category: "INCOME", amount_cents: -32500 });
    expect(detectRecurringTransactions([...bills, ...pay], "2026-11-11")).toMatchObject([
      { kind: "bill", cadence: "weekly", nextDate: "2026-11-13" },
      { kind: "income", cadence: "biweekly", nextDate: "2026-11-20", amountCents: 32500 },
    ]);
  });

  it("keeps an internal key stable across runs and normalizes merchant casing and spaces", () => {
    const rows = series(["2026-07-03", "2026-08-03", "2026-09-03", "2026-10-03"], { merchant_name: "City Internet" });
    rows[1].merchant_name = " city  internet ";
    rows[2].merchant_name = "CITY INTERNET";
    const before = detectRecurringTransactions(rows.slice(0, 3), "2026-09-04");
    const after = detectRecurringTransactions(rows.slice(1), "2026-10-04");
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect(after[0].key).toBe(before[0].key);
  });

  it("does not treat pending rows, refunds, transfers, loan payments, or duplicate IDs as evidence", () => {
    const dates = ["2026-09-03", "2026-10-03", "2026-11-03"];
    const inputs = [
      ...series(dates, { pending: true }),
      ...series(dates, { merchant_name: "Refund", amount_cents: -5000 }),
      ...series(dates, { merchant_name: "Transfer", category: "TRANSFER_OUT" }),
      ...series(dates, { merchant_name: "Payment", category: "LOAN_PAYMENTS" }),
      ...series(dates, { merchant_name: "Duplicate", transaction_id: "same-id" }),
    ];
    expect(detectRecurringTransactions(inputs, "2026-11-11")).toEqual([]);
  });

  it("suggests named family support but excludes matched transfers and payment-app cash-outs", () => {
    const dates = ["2026-09-03", "2026-10-03", "2026-11-03"];
    const transfer = { category: "TRANSFER_IN", category_detailed: "TRANSFER_IN_OTHER_TRANSFER_IN" };
    const inputs = [
      ...series(dates, { ...transfer, merchant_name: "Zelle from Ana", amount_cents: -15000 }),
      ...series(dates, { ...transfer, merchant_name: "Bank move", amount_cents: -10000 }),
      ...series(["2026-09-01", "2026-10-01", "2026-11-01"], {
        account_id: "savings", category: "TRANSFER_OUT", amount_cents: 10000,
      }),
      ...series(dates, { ...transfer, merchant_name: "Venmo Cash-Out", amount_cents: -25000 }),
      ...series(dates, { ...transfer, category_detailed: "TRANSFER_IN_ACCOUNT_TRANSFER", amount_cents: -30000 }),
      ...series(dates, { ...transfer, category_detailed: "TRANSFER_IN_TRANSFER_IN_FROM_APPS", amount_cents: -35000 }),
    ];
    expect(detectRecurringTransactions(inputs, "2026-11-11")).toMatchObject([
      { name: "Zelle from Ana", kind: "income", familySupport: true, amountCents: 15000 },
    ]);
  });

  it("keeps distinct unnamed income amounts apart and leaves deposits unlabeled as family support", () => {
    const dates = ["2026-09-03", "2026-10-03", "2026-11-03"];
    const wages = { merchant_name: null, category: "INCOME", category_detailed: "INCOME_WAGES" };
    const candidates = detectRecurringTransactions([
      ...series(dates, { ...wages, amount_cents: -30000 }),
      ...series(dates, { ...wages, amount_cents: -65000 }),
      ...series(dates, { ...wages, category: "TRANSFER_IN", category_detailed: "TRANSFER_IN_DEPOSIT", amount_cents: -10000 }),
    ], "2026-11-11");
    expect(candidates.map(({ name, kind, amountCents, familySupport }) => [name, kind, amountCents, familySupport]).sort())
      .toEqual([["Deposit", "income", 10000, undefined], ["Income", "income", 30000, undefined], ["Income", "income", 65000, undefined]]);
    expect(new Set(candidates.map(({ key }) => key)).size).toBe(3);
  });

  it("suggests student loan payments while excluding credit card payments", () => {
    const dates = ["2026-09-03", "2026-10-03", "2026-11-03"];
    expect(detectRecurringTransactions([
      ...series(dates, { merchant_name: null, category: "LOAN_PAYMENTS", category_detailed: "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT" }),
      ...series(dates, { merchant_name: "Card payment", category: "LOAN_PAYMENTS", category_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
    ], "2026-11-11")).toMatchObject([
      { name: "Student loan payment", kind: "bill", cadence: "monthly" },
    ]);
  });

  it("does not combine evidence across accounts or extrapolate stale, irregular or out-of-window rows", () => {
    const inputs = [
      ...series(["2026-09-03", "2026-10-03"], { merchant_name: "Phone" }),
      ...series(["2026-11-03"], { merchant_name: "Phone", account_id: "card" }),
      ...series(["2026-06-01", "2026-07-01", "2026-08-01"], { merchant_name: "Stale" }),
      ...series(["2026-08-03", "2026-10-01", "2026-11-02"], { merchant_name: "Irregular" }),
      ...series(["2026-03-11", "2026-04-11", "2026-05-11"], { merchant_name: "Old" }),
    ];
    expect(detectRecurringTransactions(inputs, "2026-11-11")).toEqual([]);
  });
});
