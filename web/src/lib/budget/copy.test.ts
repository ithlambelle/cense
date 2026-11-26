// Created with Claude Code (2026-11-26). The sentences Your money builds from
// the student's numbers: where a number came from and which card it is.
import { describe, expect, it } from "vitest";

import { updatedLabel } from "@/components/safe-to-spend/updated-time";

import { bankMonthLine, cardNameLine, cardsTotalLine, fromAnswersLine } from "./copy";

describe("Your money's words", () => {
  it("names the bills from the answers in a line", () => {
    expect(fromAnswersLine(["Phone"])).toBe("Includes phone from your answers");
    expect(fromAnswersLine(["Rent", "Phone"])).toBe("Includes rent and phone from your answers");
    expect(fromAnswersLine(["Rent", "Phone", "Car"])).toBe("Includes rent, phone and car from your answers");
  });

  it("names one card, with its last digits when the bank gave them", () => {
    expect(cardNameLine("Plaid Credit Card", "3333")).toBe("Plaid Credit Card ending in 3333");
    expect(cardNameLine("Plaid Credit Card", null)).toBe("Plaid Credit Card");
    expect(cardsTotalLine(2)).toBe("Total of 2 cards");
  });

  it("says the month's numbers are the bank's, and what safe to spend starts from", () => {
    expect(bankMonthLine("October")).toBe("Bank numbers are from October. Safe to spend starts from what’s in checking today.");
  });
});

describe("updatedLabel, shared by Home and Your money", () => {
  it("says the time for a read today and the day for any earlier one, even minutes before midnight", () => {
    const now = new Date(2026, 10, 26, 0, 10);
    expect(updatedLabel(new Date(2026, 10, 26, 0, 5).toISOString(), now)).toMatch(/^Updated 12:05\sAM$/);
    expect(updatedLabel(new Date(2026, 10, 25, 23, 50).toISOString(), now)).toBe("Updated Nov 25");
    expect(updatedLabel(new Date(2026, 10, 9, 16, 9).toISOString(), now)).toBe("Updated Nov 9");
  });
});
