// Created with Claude Code (2026-11-21).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RecurringTransaction } from "@/lib/budget/recurring";
import { billAnswerSchema } from "@/lib/api/safe-to-spend";
import { inferSetup } from "./infer";

const PRIMARIES = ["RENT_AND_UTILITIES", "FOOD_AND_DRINK", "LOAN_PAYMENTS", "TRANSPORTATION", "TRANSFER_IN", "INCOME"];
let n = 0;
function row(posted_on: string, amount_cents: number, category_detailed: string, merchant_name: string | null, extra: Partial<RecurringTransaction> = {}): RecurringTransaction {
  n += 1;
  return {
    transaction_id: `t${n}`,
    account_id: "checking",
    posted_on,
    amount_cents,
    pending: false,
    category: PRIMARIES.find((primary) => category_detailed.startsWith(`${primary}_`)) ?? null,
    category_detailed,
    merchant_name,
    ...extra,
  };
}

// Shaped like the custom_cense_paycheck sandbox student (Testathon Tester Banks).
const paycheckStudent: RecurringTransaction[] = [
  ...["2026-09-01", "2026-10-01", "2026-11-01"].map((d) => row(d, 115000, "RENT_AND_UTILITIES_RENT", "Brighton Ave Apartments")),
  ...["2026-09-12", "2026-10-12", "2026-11-12"].map((d) => row(d, 4500, "RENT_AND_UTILITIES_TELEPHONE", "Verizon Wireless")),
  row("2026-09-06", 5210, "FOOD_AND_DRINK_GROCERIES", "Trader Joe's"),
  row("2026-09-20", 5838, "FOOD_AND_DRINK_GROCERIES", "Trader Joe's"),
  row("2026-10-04", 4902, "FOOD_AND_DRINK_GROCERIES", "Trader Joe's"),
  row("2026-10-18", 6145, "FOOD_AND_DRINK_GROCERIES", "Trader Joe's"),
  row("2026-11-01", 5500, "FOOD_AND_DRINK_GROCERIES", "Trader Joe's"),
  row("2026-11-03", 1999, "FOOD_AND_DRINK_GROCERIES", "Trader Joe's", { pending: true }),
  row("2026-10-20", -1500, "FOOD_AND_DRINK_GROCERIES", "Trader Joe's"),
  ...["2026-09-18", "2026-10-02", "2026-10-16", "2026-10-30", "2026-11-13"].map((d, i) =>
    row(d, -(58790 + i * 100), "INCOME_WAGES", "Brightway Cafe"),
  ),
  ...["2026-08-28", "2026-09-28", "2026-10-28"].map((d) =>
    row(d, -115000, "TRANSFER_IN_TRANSFER_IN_FROM_APPS", null, { category: "TRANSFER_IN", description: "ZELLE PAYMENT FROM DAVID ROSS CONF# R102LQ8" }),
  ),
];

describe("inferring the setup answers from a linked bank", () => {
  const { bills, findings } = inferSetup(paycheckStudent, "2026-11-21");
  const answer = (bill: string) => bills.find((b) => b.bill === bill);

  it("finds rent and the phone bill with their amount and due day", () => {
    expect(answer("rent")).toEqual({ bill: "rent", coveredBy: "me", monthlyCents: 115000, dueDay: 1 });
    expect(answer("phone")).toEqual({ bill: "phone", coveredBy: "me", monthlyCents: 4500, dueDay: 12 });
    expect(findings.find((f) => f.key === "phone")?.detail).toBe("Verizon Wireless, $45 on the 12th");
  });

  it("averages groceries by month, ignoring pending charges and refunds, and keeps them reserved all month", () => {
    // Whole months only: September 110.48 and October 110.47. November is
    // not over (55.00 so far), so it does not pull the answer down.
    expect(answer("groceries")).toEqual({ bill: "groceries", coveredBy: "me", monthlyCents: 11048, dueDay: 31 });
  });

  it("leaves out the part months at both ends of the window", () => {
    const rows = [
      row("2026-08-25", 5000, "FOOD_AND_DRINK_GROCERIES", "Star Market"),
      row("2026-09-12", 11000, "FOOD_AND_DRINK_GROCERIES", "Star Market"),
      row("2026-10-12", 11000, "FOOD_AND_DRINK_GROCERIES", "Star Market"),
      row("2026-11-10", 5500, "FOOD_AND_DRINK_GROCERIES", "Star Market"),
    ];
    expect(inferSetup(rows, "2026-11-21").bills.find((b) => b.bill === "groceries")?.monthlyCents).toBe(11000);
    // A short history with no whole month yet still gets an answer.
    expect(inferSetup([row("2026-11-10", 5500, "FOOD_AND_DRINK_GROCERIES", "Star Market")], "2026-11-21").bills.find((b) => b.bill === "groceries")?.monthlyCents).toBe(5500);
  });

  it("answers 'none' for a bill the bank never shows, with no question, and marks it not found", () => {
    expect(findings.find((f) => f.key === "car")?.found).toBe(false);
    expect(findings.find((f) => f.key === "rent")?.found).toBe(true);
    expect(answer("car")).toEqual({ bill: "car", coveredBy: "none", monthlyCents: null, dueDay: null });
    expect(answer("tuition")).toEqual({ bill: "tuition", coveredBy: "none", monthlyCents: null, dueDay: null });
  });

  it("names the pay and the family money it found", () => {
    expect(findings.filter((f) => f.kind === "income").map((f) => f.detail)).toEqual([
      expect.stringMatching(/^Brightway Cafe, about \$\d{3} every other Friday$/),
    ]);
    expect(findings.find((f) => f.kind === "family")?.detail).toBe("$1,150 on the 28th");
  });

  it("always returns one valid answer per bill, so the existing save accepts it", () => {
    expect(bills.map((b) => b.bill)).toEqual(["rent", "phone", "tuition", "groceries", "car"]);
    for (const bill of bills) expect(billAnswerSchema.safeParse(bill).success).toBe(true);
    for (const bill of inferSetup([], "2026-11-21").bills) expect(billAnswerSchema.safeParse(bill).success).toBe(true);
  });

  it("treats a car payment as a dated bill and gas alone as spread spending", () => {
    const withLoan = inferSetup([row("2026-10-05", 21000, "LOAN_PAYMENTS_CAR_PAYMENT", "Honda Financial"), row("2026-11-05", 21000, "LOAN_PAYMENTS_CAR_PAYMENT", "Honda Financial")], "2026-11-21");
    expect(withLoan.bills.find((b) => b.bill === "car")).toEqual({ bill: "car", coveredBy: "me", monthlyCents: 21000, dueDay: 5 });
    const gasOnly = inferSetup([row("2026-11-02", 3800, "TRANSPORTATION_GAS", "Shell")], "2026-11-21");
    expect(gasOnly.bills.find((b) => b.bill === "car")).toEqual({ bill: "car", coveredBy: "me", monthlyCents: 3800, dueDay: 31 });
  });
});
