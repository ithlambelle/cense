// Created with Claude Code (2026-11-13).
import { describe, expect, it } from "vitest";

import { BUDGET_CATEGORIES, censeCategory, spendingByCategory } from "./categories";

describe("censeCategory", () => {
  it("keeps groceries apart from eating out, though Plaid files both under FOOD_AND_DRINK", () => {
    expect(censeCategory("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES")).toBe("groceries");
    expect(censeCategory("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT")).toBe("eating_out");
    expect(censeCategory("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE")).toBe("eating_out");
    expect(censeCategory("FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD")).toBe("eating_out");
  });

  it("gives student loan payments their own line (D36), and other loans the line they pay for", () => {
    expect(censeCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT")).toBe("student_loans");
    expect(censeCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT")).toBe("transportation");
    expect(censeCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT")).toBe("rent_and_bills");
    expect(censeCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT")).toBe("other");
  });

  it("never counts a card payment, income, money coming in or a move to savings or investments as spending", () => {
    expect(censeCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")).toBeNull();
    expect(censeCategory("INCOME", "INCOME_WAGES")).toBeNull();
    expect(censeCategory("TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER")).toBeNull();
    expect(censeCategory("TRANSFER_OUT", "TRANSFER_OUT_SAVINGS")).toBeNull();
    expect(censeCategory("TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS")).toBeNull();
  });

  // spending_by_detailed_category() returns only the transfers out that are
  // spending, so each one left is Other, a Venmo payment included.
  it("counts cash taken out, payment app payments and money sent to a person as Other (Ben, Nov 15)", () => {
    expect(censeCategory("TRANSFER_OUT", "TRANSFER_OUT_WITHDRAWAL")).toBe("other");
    expect(censeCategory("TRANSFER_OUT", "TRANSFER_OUT_OTHER_TRANSFER_OUT")).toBe("other");
    expect(censeCategory("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER")).toBe("other");
  });

  it("maps every D31 purpose Plaid has a category for", () => {
    expect(censeCategory("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT")).toBe("rent_and_bills");
    expect(censeCategory("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE")).toBe("rent_and_bills");
    expect(censeCategory("GENERAL_SERVICES", "GENERAL_SERVICES_INSURANCE")).toBe("rent_and_bills");
    expect(censeCategory("TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES")).toBe("transportation");
    expect(censeCategory("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS")).toBe("school_supplies");
    expect(censeCategory("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OFFICE_SUPPLIES")).toBe("school_supplies");
    expect(censeCategory("ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES")).toBe("entertainment");
    expect(censeCategory("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES")).toBe("shopping_and_personal_care");
    expect(censeCategory("PERSONAL_CARE", "PERSONAL_CARE_HAIR_AND_BEAUTY")).toBe("shopping_and_personal_care");
    expect(censeCategory("MEDICAL", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS")).toBe("health");
    expect(censeCategory("TRAVEL", "TRAVEL_FLIGHTS")).toBe("travel");
    expect(censeCategory("BANK_FEES", "BANK_FEES_OVERDRAFT_FEES")).toBe("other");
  });

  it("files a missing or unknown category under Other, never drops it", () => {
    expect(censeCategory(null, null)).toBe("other");
    expect(censeCategory("SOMETHING_NEW", "SOMETHING_NEW_THING")).toBe("other");
    expect(censeCategory("FOOD_AND_DRINK", null)).toBe("eating_out");
  });

  it("splits needs and wants as decided in D39", () => {
    const group = (g: string) => BUDGET_CATEGORIES.filter((category) => category.group === g).map((category) => category.label);
    expect(group("need")).toEqual(["Rent and bills", "Groceries", "Transportation", "School supplies", "Health", "Student loans"]);
    expect(group("want")).toEqual(["Eating out", "Entertainment", "Subscriptions", "Shopping and personal care", "Travel", "Other"]);
  });
});

describe("spendingByCategory", () => {
  const row = (category: string | null, categoryDetailed: string | null, outCents: number, inCents = 0) => ({ category, categoryDetailed, outCents, inCents });

  it("adds Plaid's detailed categories into Cense's", () => {
    expect(
      spendingByCategory([
        row("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", 1800),
        row("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", 600),
        row("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES", 6500),
      ]),
    ).toEqual({ eating_out: 2400, groceries: 6500 });
  });

  it("subtracts a refund from its purchase's category (D35)", () => {
    expect(spendingByCategory([row("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES", 6000, 2000)])).toEqual({
      shopping_and_personal_care: 4000,
    });
  });

  it("drops a line a refund brings to zero or below", () => {
    expect(spendingByCategory([row("TRAVEL", "TRAVEL_FLIGHTS", 0, 30000)])).toEqual({});
  });

  it("never treats money in with no category as a refund: it is income (D37)", () => {
    expect(spendingByCategory([row(null, null, 700, 50000)])).toEqual({ other: 700 });
  });

  it("leaves out income, moves to savings and card payments", () => {
    expect(
      spendingByCategory([
        row("INCOME", "INCOME_WAGES", 0, 90000),
        row("TRANSFER_OUT", "TRANSFER_OUT_SAVINGS", 50000),
        row("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", 31000),
      ]),
    ).toEqual({});
  });

  // The database returns a general transfer out only when it went through a
  // payment app, so it is a Venmo or Zelle payment (Ben, Nov 15).
  it("counts a payment app payment as Other", () => {
    expect(spendingByCategory([row("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", 2500)])).toEqual({ other: 2500 });
  });
});
