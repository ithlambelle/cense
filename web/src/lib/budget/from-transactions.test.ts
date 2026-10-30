import { describe, expect, it } from "vitest";

import { computeBudget } from "./budget";
import { budgetFromTransactions, type SandboxTransaction } from "./from-transactions";

let counter = 0;
function tx(date: string, amountDollars: number, name: string, category: string | null, extra: Partial<SandboxTransaction> = {}): SandboxTransaction {
  counter += 1;
  return {
    id: `t${counter}`,
    date,
    amountCents: Math.round(amountDollars * 100),
    pending: false,
    name,
    category,
    detailedCategory: null,
    ...extra,
  };
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Three months, Jul 1 to Sep 30 2026 (92 days). Weekly pay of $480, rent on
// the 1st, Spotify on the 5th, nine grocery trips, and one eating-out meal.
function steadyStudent(): SandboxTransaction[] {
  const list: SandboxTransaction[] = [];
  for (let week = 0; week < 13; week += 1) list.push(tx(addDays("2026-07-03", week * 7), -480, "Campus Cafe payroll", "INCOME"));
  for (const month of ["2026-07", "2026-08", "2026-09"]) {
    list.push(tx(`${month}-01`, 700, "Landlord rent", "RENT_AND_UTILITIES"));
    list.push(tx(`${month}-05`, 12, "Spotify", "ENTERTAINMENT"));
    for (const day of ["08", "16", "24"]) {
      list.push(tx(`${month}-${day}`, 100, "Market", "FOOD_AND_DRINK", { detailedCategory: "FOOD_AND_DRINK_GROCERIES" }));
    }
  }
  list.push(tx("2026-09-30", 30, "Pizza place", "FOOD_AND_DRINK", { detailedCategory: "FOOD_AND_DRINK_RESTAURANT" }));
  return list;
}

const monthly = (derived: ReturnType<typeof budgetFromTransactions>, id: string) =>
  derived.input.expenses.find((e) => e.id === id)?.monthlyCents;

describe("budgetFromTransactions", () => {
  it("reads weekly pay, recurring bills and changing spending", () => {
    const derived = budgetFromTransactions(steadyStudent());
    expect(derived.months).toBe(3);
    expect(derived.incomeIrregular).toBe(false);
    expect(derived.input.income).toEqual({ amountCents: 48000, cadence: "weekly" });
    expect(monthly(derived, "recurring:landlord-rent")).toBe(70000);
    expect(monthly(derived, "recurring:spotify")).toBe(1200);
    expect(monthly(derived, "variable:groceries")).toBe(30000);
    expect(monthly(derived, "variable:food_and_drink")).toBe(1000);
    expect(derived.input.savings).toEqual([]);
  });

  it("sorts each group into needs and wants as a starting guess", () => {
    const { input } = budgetFromTransactions(steadyStudent());
    const by = (id: string) => input.expenses.find((e) => e.id === id);
    expect(by("recurring:landlord-rent")).toMatchObject({ necessity: "need", recurrence: "recurring" });
    expect(by("recurring:spotify")).toMatchObject({ necessity: "want", recurrence: "recurring" });
    expect(by("variable:groceries")).toMatchObject({ necessity: "need", recurrence: "variable" });
    expect(by("variable:food_and_drink")).toMatchObject({ necessity: "want", recurrence: "variable" });
  });

  it("feeds the waterfall", () => {
    const result = computeBudget(budgetFromTransactions(steadyStudent()).input);
    // 2,080 income - 700 rent - 300 groceries - 12 Spotify, before the meal.
    expect(result.incomeCents).toBe(208000);
    expect(result.surplusCents).toBe(208000 - 70000 - 30000 - 1200);
    expect(result.remainingCents).toBe(result.surplusCents - 1000);
  });

  it("does not count transfers between the student's own accounts", () => {
    const list = [
      ...steadyStudent(),
      tx("2026-08-10", 500, "Transfer to savings", "TRANSFER_OUT"),
      tx("2026-08-10", -500, "Transfer from checking", "TRANSFER_IN"),
    ];
    const derived = budgetFromTransactions(list);
    expect(derived.leftOut.filter((l) => l.reason === "transfer")).toHaveLength(2);
    expect(derived.input.expenses.map((e) => e.id)).not.toContain("variable:other");
    expect(derived.input.income).toEqual({ amountCents: 48000, cadence: "weekly" });
  });

  it("does not count a credit card payment on top of the card's purchases", () => {
    const list = [
      ...steadyStudent(),
      tx("2026-08-20", 250, "Card payment", "LOAN_PAYMENTS", { detailedCategory: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
    ];
    const derived = budgetFromTransactions(list);
    expect(derived.leftOut).toContainEqual(expect.objectContaining({ reason: "card payment" }));
    expect(derived.input.expenses.find((e) => e.label === "Loan payments")).toBeUndefined();
  });

  it("keeps a student loan payment, which is not a card payment", () => {
    const list = [
      ...steadyStudent(),
      ...["2026-07", "2026-08", "2026-09"].map((m) =>
        tx(`${m}-12`, 85, "Student loan servicer", "LOAN_PAYMENTS", { detailedCategory: "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT" }),
      ),
    ];
    const derived = budgetFromTransactions(list);
    expect(monthly(derived, "recurring:student-loan-servicer")).toBe(8500);
  });

  it("nets a refund against the spending it came from", () => {
    const list = [...steadyStudent(), tx("2026-09-12", -40, "Market refund", "FOOD_AND_DRINK", { detailedCategory: "FOOD_AND_DRINK_GROCERIES" })];
    // Groceries 900 - 40 over 3 months.
    expect(monthly(budgetFromTransactions(list), "variable:groceries")).toBe(Math.round(86000 / 3));
  });

  it("never lets a refund make a group negative", () => {
    const list = [
      tx("2026-07-02", 20, "Shop", "GENERAL_MERCHANDISE"),
      tx("2026-07-20", -50, "Shop refund", "GENERAL_MERCHANDISE"),
    ];
    const derived = budgetFromTransactions(list);
    expect(derived.input.expenses).toEqual([]);
  });

  it("leaves out pending transactions", () => {
    const pending = tx("2026-09-29", 999, "Big pending buy", "GENERAL_MERCHANDISE", { pending: true });
    const derived = budgetFromTransactions([...steadyStudent(), pending]);
    expect(derived.leftOut).toEqual([{ id: pending.id, reason: "pending" }]);
    expect(monthly(derived, "variable:general_merchandise")).toBeUndefined();
  });

  it("uses the monthly average when pay is irregular", () => {
    const list = [
      tx("2026-07-03", -300, "Gig app", "INCOME"),
      tx("2026-07-19", -610, "Gig app", "INCOME"),
      tx("2026-08-09", -250, "Gig app", "INCOME"),
      tx("2026-09-02", -900, "Gig app", "INCOME"),
      tx("2026-09-30", 10, "Coffee", "FOOD_AND_DRINK"),
    ];
    const derived = budgetFromTransactions(list);
    expect(derived.incomeIrregular).toBe(true);
    // $2,060 over 3 months.
    expect(derived.input.income).toEqual({ amountCents: Math.round(206000 / 3), cadence: "monthly" });
  });

  it("treats pay that steadily varies in size as irregular", () => {
    const list = [-300, -520, -310, -540].map((amount, i) => tx(addDays("2026-07-03", i * 7), amount, "Payroll", "INCOME"));
    expect(budgetFromTransactions(list).incomeIrregular).toBe(true);
  });

  it("reads biweekly pay", () => {
    const list = Array.from({ length: 6 }, (_, i) => tx(addDays("2026-07-03", i * 14), -900, "Payroll", "INCOME"));
    expect(budgetFromTransactions(list).input.income).toEqual({ amountCents: 90000, cadence: "biweekly" });
  });

  it("does not call a bill recurring when it shows up twice in a month", () => {
    const list = [
      tx("2026-07-02", 15, "Pizza place", "FOOD_AND_DRINK"),
      tx("2026-07-20", 15, "Pizza place", "FOOD_AND_DRINK"),
      tx("2026-08-02", 15, "Pizza place", "FOOD_AND_DRINK"),
      tx("2026-09-30", 15, "Pizza place", "FOOD_AND_DRINK"),
    ];
    const derived = budgetFromTransactions(list);
    expect(derived.input.expenses.map((e) => e.recurrence)).toEqual(["variable"]);
  });

  it("does not call something recurring from a single month of data", () => {
    const derived = budgetFromTransactions([tx("2026-07-01", 700, "Landlord rent", "RENT_AND_UTILITIES"), tx("2026-07-20", 50, "Gas", "TRANSPORTATION")]);
    expect(derived.months).toBe(1);
    expect(derived.input.expenses.every((e) => e.recurrence === "variable")).toBe(true);
  });

  it("returns an empty budget for no transactions", () => {
    expect(budgetFromTransactions([])).toEqual({
      input: { income: { amountCents: 0, cadence: "monthly" }, expenses: [], savings: [] },
      months: 1,
      incomeIrregular: false,
      leftOut: [],
    });
  });

  it("rejects amounts that are not whole cents and dates that are not days", () => {
    expect(() => budgetFromTransactions([tx("2026-07-01", 1, "x", null, { amountCents: 10.5 })])).toThrow(RangeError);
    expect(() => budgetFromTransactions([tx("2026-07-01", 1, "x", null, { date: "07/01/2026" })])).toThrow(RangeError);
    expect(() => budgetFromTransactions([tx("2026-07-01", 1, "x", null, { date: "2026-13-45" })])).toThrow(RangeError);
  });

  it("puts an unknown category in Other", () => {
    const derived = budgetFromTransactions([tx("2026-07-02", 30, "Mystery", "SOMETHING_NEW")]);
    expect(derived.input.expenses).toEqual([
      { id: "variable:other", label: "Other", necessity: "want", recurrence: "variable", monthlyCents: 3000 },
    ]);
  });
});
