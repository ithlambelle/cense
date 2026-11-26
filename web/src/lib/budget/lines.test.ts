// Created with Claude Code (2026-11-13).
import { describe, expect, it } from "vitest";

import type { BillAnswer } from "@/lib/safe-to-spend/compute";

import { billLine, buildBudgetLines, lastFullMonth, monthName, summarize, untypedCents, withBillAmount } from "./lines";

const row = (category: string | null, categoryDetailed: string | null, outCents: number, inCents = 0) => ({ category, categoryDetailed, outCents, inCents });

const october = {
  month: "2026-10-01",
  incomeCents: 208000,
  totals: [
    row("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT", 70000),
    row("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES", 30000),
    row("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", 20000),
    row("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", 31000),
  ],
  typed: {},
  setAsideCents: 5000,
  hasBankData: true,
};

describe("buildBudgetLines", () => {
  it("makes one line per category the month had spending in, needs and wants apart", () => {
    const lines = buildBudgetLines(october);
    expect(lines.income).toMatchObject({ label: "Income", amountCents: 208000, bankCents: 208000, typed: false });
    expect(lines.needs.map((line) => [line.label, line.amountCents])).toEqual([
      ["Rent and bills", 70000],
      ["Groceries", 30000],
    ]);
    expect(lines.wants.map((line) => [line.label, line.amountCents])).toEqual([["Eating out", 20000]]);
    expect(lines.saving).toMatchObject({ label: "Saving", amountCents: 5000, typed: true });
  });

  it("does not call a $0 savings goal one the student typed", () => {
    expect(buildBudgetLines({ ...october, setAsideCents: 0 }).saving).toMatchObject({ amountCents: 0, typed: false });
  });

  it("keeps a typed number over the bank's, and follows the bank on the other lines", () => {
    const lines = buildBudgetLines({ ...october, typed: { groceries: 25000, income: 150000 } });
    expect(lines.income).toMatchObject({ amountCents: 150000, bankCents: 208000, typed: true });
    expect(lines.needs.find((line) => line.key === "groceries")).toMatchObject({ amountCents: 25000, bankCents: 30000, typed: true });
    expect(lines.needs.find((line) => line.key === "rent_and_bills")).toMatchObject({ amountCents: 70000, typed: false });
  });

  it("keeps a typed line the bank has nothing for this month", () => {
    const lines = buildBudgetLines({ ...october, typed: { travel: 12000 } });
    expect(lines.wants.find((line) => line.key === "travel")).toMatchObject({ amountCents: 12000, bankCents: null, typed: true });
  });

  it("shows income as $0 for a month with none", () => {
    expect(buildBudgetLines({ ...october, incomeCents: null }).income).toMatchObject({ amountCents: 0, bankCents: null, typed: false });
  });

  it("has no Fixed or Changing yet: that waits for the recurring detector", () => {
    const lines = buildBudgetLines(october);
    for (const line of [lines.income, ...lines.needs, ...lines.wants, lines.saving]) expect(line.recurrence).toBeNull();
  });
});

// The safe-to-spend answers: rent $700 and phone $45 the student pays, tuition
// family covers, groceries $300, no car.
const answers: BillAnswer[] = [
  { bill: "rent", coveredBy: "me", monthlyCents: 70000, dueDay: 6 },
  { bill: "phone", coveredBy: "me", monthlyCents: 4500, dueDay: 15 },
  { bill: "tuition", coveredBy: "family", monthlyCents: null, dueDay: null },
  { bill: "groceries", coveredBy: "me", monthlyCents: 30000, dueDay: 31 },
  { bill: "car", coveredBy: "none", monthlyCents: null, dueDay: null },
];

describe("bills from the safe-to-spend answers", () => {
  it("adds a bill the bank does not show to the line the bank would have put it on", () => {
    // October shows rent and groceries but no phone bill.
    const lines = buildBudgetLines({ ...october, bills: answers });
    expect(lines.needs.find((line) => line.key === "rent_and_bills")).toMatchObject({
      amountCents: 74500,
      bankCents: 70000,
      typed: false,
      answers: [{ bill: "phone", amountCents: 4500 }],
    });
    // 2,080 - 745 - 300 - 200 - 50 = 785
    expect(summarize(lines).remainingCents).toBe(78500);
  });

  it("never counts a bill twice when the bank shows it too", () => {
    const withPhone = { ...october, totals: [...october.totals, row("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE", 5000)], bills: answers };
    const lines = buildBudgetLines(withPhone);
    // The bank's rent and phone; the typed rent and phone are not added on top.
    expect(lines.needs.find((line) => line.key === "rent_and_bills")).toMatchObject({ amountCents: 75000, bankCents: 75000, answers: [] });
    expect(lines.needs.find((line) => line.key === "groceries")).toMatchObject({ amountCents: 30000, answers: [] });
  });

  it("changes nothing when the student pays no bills", () => {
    const none = answers.map((answer) => ({ ...answer, coveredBy: "family" as const }));
    expect(buildBudgetLines({ ...october, bills: none })).toEqual(buildBudgetLines(october));
  });

  it("makes a line for a bill on a line the bank had nothing for, and counts a split bill's share", () => {
    const lines = buildBudgetLines({
      ...october,
      bills: [
        { bill: "car", coveredBy: "split", monthlyCents: 6000, dueDay: 20 },
        { bill: "tuition", coveredBy: "me", monthlyCents: 50000, dueDay: null },
      ],
    });
    expect(lines.needs.find((line) => line.key === "transportation")).toMatchObject({ amountCents: 6000, bankCents: null, answers: [{ bill: "car", amountCents: 6000 }] });
    // Where the bank puts tuition (Other), so it is the same line either way.
    expect(lines.wants.find((line) => line.key === "other")).toMatchObject({ amountCents: 50000, answers: [{ bill: "tuition", amountCents: 50000 }] });
  });

  it("keeps the student's own number for the line over the bank and the answers, and undo goes back to both", () => {
    const lines = buildBudgetLines({ ...october, bills: answers, typed: { rent_and_bills: 80000 } });
    const rent = lines.needs.find((line) => line.key === "rent_and_bills")!;
    expect(rent).toMatchObject({ amountCents: 80000, typed: true });
    expect(untypedCents(rent)).toBe(74500);
  });

  it("adds nothing before the bank has sent anything, when there is no telling what it shows", () => {
    const lines = buildBudgetLines({ ...october, totals: [], incomeCents: null, hasBankData: false, bills: answers });
    expect(lines.needs).toEqual([]);
  });

  // Audit, Nov 26: the same payment under another category was counted twice.
  const only = (bill: BillAnswer["bill"], monthlyCents: number): BillAnswer[] => [{ bill, coveredBy: "me", monthlyCents, dueDay: 6 }];
  const bank = (...rows: ReturnType<typeof row>[]) => ({ ...october, totals: rows });
  const line = (lines: ReturnType<typeof buildBudgetLines>, key: string) => [...lines.needs, ...lines.wants].find((entry) => entry.key === key);

  it("does not add rent paid by Zelle, which the bank already counts in Other", () => {
    const lines = buildBudgetLines({ ...bank(row("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 65000)), bills: only("rent", 65000) });
    expect(line(lines, "rent_and_bills")).toBeUndefined();
    expect(line(lines, "other")).toMatchObject({ amountCents: 65000, answers: [] });
  });

  it("does not add groceries bought at a superstore", () => {
    const lines = buildBudgetLines({ ...bank(row("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SUPERSTORES", 30000)), bills: only("groceries", 27500) });
    expect(line(lines, "groceries")).toBeUndefined();
    expect(line(lines, "shopping_and_personal_care")).toMatchObject({ amountCents: 30000 });
  });

  it("does not add a car bill the bank shows as insurance", () => {
    const lines = buildBudgetLines({ ...bank(row("GENERAL_SERVICES", "GENERAL_SERVICES_INSURANCE", 15000)), bills: only("car", 15000) });
    expect(line(lines, "transportation")).toBeUndefined();
    expect(line(lines, "rent_and_bills")).toMatchObject({ amountCents: 15000, answers: [] });
  });

  it("lets a $12 parking charge hide only $12 of a $300 car bill", () => {
    const lines = buildBudgetLines({ ...bank(row("TRANSPORTATION", "TRANSPORTATION_PARKING", 1200)), bills: only("car", 30000) });
    expect(line(lines, "transportation")).toMatchObject({ amountCents: 30000, bankCents: 1200, answers: [{ bill: "car", amountCents: 28800, seenCents: 1200 }] });
  });

  it("keeps the bank's number when the bill's own category shows a different amount", () => {
    const lines = buildBudgetLines({ ...bank(row("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT", 65000)), bills: only("rent", 70000) });
    expect(line(lines, "rent_and_bills")).toMatchObject({ amountCents: 65000, answers: [] });
  });

  it("adds rent paid elsewhere when the money sent to friends is less than the rent", () => {
    const lines = buildBudgetLines({ ...bank(row("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 20000)), bills: only("rent", 65000) });
    expect(line(lines, "rent_and_bills")).toMatchObject({ amountCents: 65000, answers: [{ bill: "rent", amountCents: 65000, seenCents: 0 }] });
  });

  it("lets one payment by Zelle stand for one bill only", () => {
    const bills: BillAnswer[] = [...only("rent", 65000), { bill: "phone", coveredBy: "me", monthlyCents: 4500, dueDay: 15 }];
    const lines = buildBudgetLines({ ...bank(row("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 65000)), bills });
    expect(line(lines, "rent_and_bills")).toMatchObject({ amountCents: 4500, answers: [{ bill: "phone", amountCents: 4500 }] });
  });

  it("misses a small bill paid elsewhere when the student sends more than it to people (the known limit)", () => {
    const lines = buildBudgetLines({ ...bank(row("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 10000)), bills: only("phone", 4500) });
    expect(line(lines, "rent_and_bills")).toBeUndefined();
  });

  it("follows a bill's new amount from Today, keeping what the bank showed of it", () => {
    const entry = { bill: "car" as const, amountCents: 28800, seenCents: 1200, sentCents: 0 };
    expect(withBillAmount(entry, 40000)).toEqual({ bill: "car", amountCents: 38800, seenCents: 1200, sentCents: 0 });
    expect(withBillAmount(entry, 0)).toBeNull();
    expect(withBillAmount(entry, null)).toBeNull();
  });

  // Audit round 2, Nov 26.
  it("matches money sent to people to the largest bill first, so a small bill paid elsewhere does not use it up", () => {
    const phone: BillAnswer = { bill: "phone", coveredBy: "me", monthlyCents: 4500, dueDay: 15 };
    // Groceries Venmo'd to a roommate, phone paid elsewhere.
    const groceries = buildBudgetLines({ ...bank(row("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 27500)), bills: [phone, ...only("groceries", 27500)] });
    expect(line(groceries, "groceries")).toBeUndefined();
    expect(line(groceries, "rent_and_bills")).toMatchObject({ amountCents: 4500, answers: [{ bill: "phone", amountCents: 4500 }] });
    // The car paid by Zelle, phone paid elsewhere.
    const car = buildBudgetLines({ ...bank(row("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 30000)), bills: [phone, ...only("car", 30000)] });
    expect(line(car, "transportation")).toBeUndefined();
    expect(line(car, "rent_and_bills")).toMatchObject({ amountCents: 4500, answers: [{ bill: "phone", amountCents: 4500 }] });
  });

  it("counts a store's spending net of returns", () => {
    const returned = { category: "GENERAL_MERCHANDISE", categoryDetailed: "GENERAL_MERCHANDISE_SUPERSTORES", outCents: 30000, inCents: 30000 };
    const lines = buildBudgetLines({ ...october, totals: [returned], bills: only("groceries", 27500) });
    expect(line(lines, "groceries")).toMatchObject({ amountCents: 27500, answers: [{ bill: "groceries", amountCents: 27500, seenCents: 0 }] });
  });

  it("applies the same rule on Today as after a reload when a bill gets smaller", () => {
    // $45 phone, $30 sent to people: too little to be the phone, so it is added.
    const lines = buildBudgetLines({ ...bank(row("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 3000)), bills: only("phone", 4500) });
    const entry = line(lines, "rent_and_bills")!.answers[0];
    expect(entry).toEqual({ bill: "phone", amountCents: 4500, seenCents: 0, sentCents: 3000 });
    // Lowered to $20 on Today: the $30 now covers it, as the server says after a reload.
    expect(withBillAmount(entry, 2000)).toBeNull();
    expect(buildBudgetLines({ ...bank(row("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 3000)), bills: only("phone", 2000) }).needs).toEqual([]);
    expect(withBillAmount(entry, 6000)).toMatchObject({ amountCents: 6000 });
  });

  it("puts each bill on the line its bank category maps to", () => {
    expect(["rent", "phone", "tuition", "groceries", "car"].map((bill) => billLine(bill as BillAnswer["bill"]))).toEqual([
      "rent_and_bills",
      "rent_and_bills",
      "other",
      "groceries",
      "transportation",
    ]);
  });
});

describe("summarize", () => {
  it("is income minus needs, wants and saving", () => {
    // 2,080 - 700 - 300 - 200 - 50 = 830
    expect(summarize(buildBudgetLines(october))).toEqual({ remainingCents: 83000, shortfallCents: 0, fixedOverIncome: false });
  });

  it("uses what the student is typing over the saved numbers", () => {
    expect(summarize(buildBudgetLines(october), { eating_out: 100000 }).remainingCents).toBe(3000);
  });

  it("is short when wants and saving take it below zero, without saying fixed costs passed income", () => {
    const summary = summarize(buildBudgetLines(october), { eating_out: 200000 });
    expect(summary).toEqual({ remainingCents: -97000, shortfallCents: 97000, fixedOverIncome: false });
  });

  it("says needs and fixed wants passed income only when they literally did", () => {
    expect(summarize(buildBudgetLines(october), { rent_and_bills: 190000 }).fixedOverIncome).toBe(true);
    // Every want counts as changing until the detector says otherwise, so a
    // big want alone never makes that line true.
    expect(summarize(buildBudgetLines(october), { eating_out: 900000 }).fixedOverIncome).toBe(false);
  });

  it("counts a wanted line as fixed once the detector marks it recurring", () => {
    const lines = buildBudgetLines(october);
    lines.wants[0] = { ...lines.wants[0], recurrence: "recurring", amountCents: 200000 };
    expect(summarize(lines).fixedOverIncome).toBe(true);
  });
});

describe("months", () => {
  it("names the last full month on the Eastern calendar, across a new year", () => {
    expect(lastFullMonth(new Date("2026-11-13T15:00:00Z"))).toBe("2026-10-01");
    expect(lastFullMonth(new Date("2027-01-02T15:00:00Z"))).toBe("2026-12-01");
    // 11pm on Nov 30 in Boston is already Dec 1 in UTC.
    expect(lastFullMonth(new Date("2026-12-01T04:00:00Z"))).toBe("2026-10-01");
  });

  it("writes a month by name", () => {
    expect(monthName("2026-10-01")).toBe("October");
  });
});
