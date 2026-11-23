import { describe, expect, it } from "vitest";

import { accountKind, balanceRows, billCents, billTimesDue, computeSafeToSpend, isStale, monthlyFromSemester, semesterFromMonthly, STALE_AFTER_MS, type BankAccountInput } from "./compute";

const account = (overrides: Partial<BankAccountInput> & { type: string; subtype: string | null }, available: number | null, current: number | null): BankAccountInput => ({
  balances: { available, current, iso_currency_code: "USD" },
  mask: "0000",
  name: "Account",
  ...overrides,
});

describe("computeSafeToSpend", () => {
  it("takes card balances, the bills the student pays and the set-aside out of checking, over 30 days", () => {
    const sum = computeSafeToSpend({
      accounts: [
        { name: "Checking", mask: "0000", kind: "cash", balanceCents: 124_000 },
        { name: "Savings", mask: "1111", kind: "other", balanceCents: 50_000 },
        { name: "Card", mask: "3333", kind: "card", balanceCents: 31_000 },
      ],
      bills: [
        { bill: "rent", coveredBy: "me", monthlyCents: 65_000, dueDay: null },
        { bill: "phone", coveredBy: "split", monthlyCents: 4_000, dueDay: null },
        { bill: "tuition", coveredBy: "family", monthlyCents: null, dueDay: null },
        { bill: "groceries", coveredBy: "none", monthlyCents: null, dueDay: null },
      ],
      setAsideCents: 5_000,
      today: "2026-11-01",
    });
    expect(sum).toEqual({
      cashCents: 124_000,
      cardCents: 31_000,
      billsCents: 69_000,
      setAsideCents: 5_000,
      leftCents: 19_000,
      days: 30,
      dailyCents: 633,
    });
  });

  it("never goes below zero, and says what is left even when it is negative", () => {
    // Plaid's user_good: $100 in checking, $410 on the card.
    const sum = computeSafeToSpend({
      accounts: [
        { name: "Plaid Checking", mask: "0000", kind: "cash", balanceCents: 10_000 },
        { name: "Plaid Credit Card", mask: "3333", kind: "card", balanceCents: 41_000 },
      ],
      bills: [],
      setAsideCents: 0,
      today: "2026-11-01",
    });
    expect(sum.leftCents).toBe(-31_000);
    expect(sum.dailyCents).toBe(0);
  });

  it("counts a card paid past zero as owing nothing, not as cash", () => {
    const sum = computeSafeToSpend({
      accounts: [
        { name: "Checking", mask: null, kind: "cash", balanceCents: 3_000 },
        { name: "Card", mask: null, kind: "card", balanceCents: -2_000 },
      ],
      bills: [],
      setAsideCents: 0,
      today: "2026-11-01",
    });
    expect(sum.cardCents).toBe(0);
    expect(sum.dailyCents).toBe(100);
  });

  it("adds every everyday account and lets an overdraft pull the number down", () => {
    const sum = computeSafeToSpend({
      accounts: [
        { name: "Checking", mask: null, kind: "cash", balanceCents: 60_000 },
        { name: "Prepaid", mask: null, kind: "cash", balanceCents: -1_000 },
      ],
      bills: [],
      setAsideCents: 0,
      today: "2026-11-01",
    });
    expect(sum.cashCents).toBe(59_000);
  });

  it("rounds down to the cent", () => {
    const sum = computeSafeToSpend({ accounts: [{ name: "C", mask: null, kind: "cash", balanceCents: 100 }], bills: [], setAsideCents: 0, today: "2026-11-01" });
    expect(sum.dailyCents).toBe(3);
  });
});

describe("accountKind", () => {
  it.each([
    ["depository", "checking", "cash"],
    ["depository", "prepaid", "cash"],
    ["depository", "cash management", "cash"],
    ["depository", "paypal", "cash"],
    ["depository", "savings", "other"],
    ["depository", "money market", "other"],
    ["depository", "cd", "other"],
    ["depository", "hsa", "other"],
    ["depository", null, "other"],
    ["credit", "credit card", "card"],
    ["credit", null, "card"],
    ["loan", "student", null],
    ["investment", "401k", null],
    ["other", null, null],
  ] as const)("%s %s is %s", (type, subtype, kind) => {
    expect(accountKind(type, subtype)).toBe(kind);
  });
});

describe("balanceRows", () => {
  it("keeps what is available to spend for cash and savings, and what is owed for a card", () => {
    const rows = balanceRows([
      account({ type: "depository", subtype: "checking", name: "Plaid Checking" }, 100, 110),
      account({ type: "depository", subtype: "savings", name: "Plaid Saving", mask: "1111" }, 200, 210),
      account({ type: "credit", subtype: "credit card", name: "Plaid Credit Card", mask: "3333" }, 1590, 410),
    ]);
    expect(rows).toEqual([
      { name: "Plaid Checking", mask: "0000", kind: "cash", balanceCents: 10_000 },
      { name: "Plaid Saving", mask: "1111", kind: "other", balanceCents: 20_000 },
      { name: "Plaid Credit Card", mask: "3333", kind: "card", balanceCents: 41_000 },
    ]);
  });

  it("falls back to the current balance when none is available", () => {
    expect(balanceRows([account({ type: "depository", subtype: "checking" }, null, 12.34)])[0].balanceCents).toBe(1_234);
  });

  it("leaves out loans, investments, other currencies and accounts with no balance", () => {
    const rows = balanceRows([
      account({ type: "loan", subtype: "student" }, null, 65_320),
      account({ type: "investment", subtype: "ira" }, null, 320),
      { ...account({ type: "depository", subtype: "checking" }, 50, 50), balances: { available: 50, current: 50, iso_currency_code: "CAD" } },
      account({ type: "credit", subtype: "credit card" }, 100, null),
    ]);
    expect(rows).toEqual([]);
  });

  it("drops a mask that is not up to four letters or digits, and trims long names", () => {
    const [row] = balanceRows([account({ type: "depository", subtype: "checking", mask: "12345", name: `  ${"x".repeat(150)}  ` }, 1, 1)]);
    expect(row.mask).toBeNull();
    expect(row.name).toHaveLength(100);
  });

  it("rounds to whole cents without float drift", () => {
    expect(balanceRows([account({ type: "depository", subtype: "checking" }, 0.29, 0.29)])[0].balanceCents).toBe(29);
  });
});

describe("isStale", () => {
  const now = Date.parse("2026-10-25T18:00:00Z");
  it("reads again when never read or over an hour old", () => {
    expect(isStale(null, now)).toBe(true);
    expect(isStale(new Date(now - STALE_AFTER_MS - 1).toISOString(), now)).toBe(true);
    expect(isStale(new Date(now - 5 * 60_000).toISOString(), now)).toBe(false);
  });
});

describe("bills due in the 30 days the number covers (Ben, Nov 23)", () => {
  const accounts = [{ name: "Checking", mask: null, kind: "cash" as const, balanceCents: 124_000 }];
  const bill = (dueDay: number | null, coveredBy: "me" | "split" | "family" | "none" = "me") => ({ bill: "rent" as const, coveredBy, monthlyCents: 10_000, dueDay });
  const billsOn = (today: string, dueDay: number | null) => computeSafeToSpend({ accounts, bills: [bill(dueDay)], setAsideCents: 0, today }).billsCents;

  it("keeps back next month's bill when this month's date has passed", () => {
    expect(billsOn("2026-11-22", 5)).toBe(10_000);
  });

  it("matches the Nov 22 walk: $16.83 a day, not $30.16", () => {
    const cash = [...accounts, { name: "Card", mask: null, kind: "card" as const, balanceCents: 31_000 }];
    const bills = [
      { bill: "rent" as const, coveredBy: "me" as const, monthlyCents: 10_000, dueDay: 5 },
      { bill: "phone" as const, coveredBy: "me" as const, monthlyCents: 10_000, dueDay: 5 },
      { bill: "tuition" as const, coveredBy: "me" as const, monthlyCents: 2_500, dueDay: null },
      { bill: "groceries" as const, coveredBy: "me" as const, monthlyCents: 10_000, dueDay: 5 },
      { bill: "car" as const, coveredBy: "me" as const, monthlyCents: 10_000, dueDay: 5 },
    ];
    expect(computeSafeToSpend({ accounts: cash, bills, setAsideCents: 0, today: "2026-11-22" }).dailyCents).toBe(1_683);
  });

  it("counts a bill due today, and not one on the 31st day", () => {
    expect(billTimesDue(bill(22), "2026-11-22")).toBe(1);
    // Nov 2 through Dec 1 is the 30 days; Dec 2 is the 31st.
    expect(billTimesDue(bill(1), "2026-11-02")).toBe(1);
    expect(billTimesDue(bill(2), "2026-11-03")).toBe(1);
    expect(billTimesDue(bill(1), "2026-01-02")).toBe(0);
  });

  it("counts a bill twice when two due dates land inside the 30 days", () => {
    expect(billTimesDue(bill(31), "2027-01-31")).toBe(2); // Jan 31 and Feb 28
    expect(billsOn("2027-01-31", 31)).toBe(20_000);
    expect(billTimesDue(bill(1), "2027-02-01")).toBe(2); // Feb 1 and Mar 1
  });

  it("uses a short month's last day, in leap years too", () => {
    expect(billTimesDue(bill(30), "2027-02-10")).toBe(1); // Feb 28
    expect(billTimesDue(bill(31), "2028-02-01")).toBe(1); // Feb 29
    expect(billTimesDue(bill(29), "2028-01-31")).toBe(1); // Feb 29
  });

  it("crosses the year end", () => {
    expect(billTimesDue(bill(5), "2026-12-20")).toBe(1); // Jan 5
  });

  it("keeps tuition back once, and never counts a bill family covers", () => {
    expect(billsOn("2026-11-22", null)).toBe(10_000);
    expect(billCents(bill(5, "family"), "2026-11-22")).toBe(0);
    expect(billCents(bill(5, "none"), "2026-11-22")).toBe(0);
    expect(billCents(bill(5, "split"), "2026-11-22")).toBe(10_000);
  });
});

describe("monthlyFromSemester", () => {
  it("spreads a semester's tuition over its four months, to the cent", () => {
    expect(monthlyFromSemester(400_000)).toBe(100_000);
    expect(monthlyFromSemester(100_001)).toBe(25_000);
    expect(semesterFromMonthly(100_000)).toBe(400_000);
  });
});
