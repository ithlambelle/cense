import { describe, expect, it } from "vitest";

import {
  createApplicationSchema,
  saveQuizSchema,
  updateApplicationSchema,
} from "./schemas";

describe("student API validation", () => {
  it("allows partial quiz progress", () => {
    expect(saveQuizSchema.safeParse({ answers: { age: 19 } }).success).toBe(true);
  });

  it("rejects unrecognized or invalid quiz fields", () => {
    expect(saveQuizSchema.safeParse({ answers: { age: 17 } }).success).toBe(false);
    expect(saveQuizSchema.safeParse({ answers: { socialSecurityNumber: "123" } }).success).toBe(false);
  });

  it("never accepts a credit limit on an unapproved application", () => {
    const input = {
      cardId: "card-1",
      cardName: "Example",
      status: "applied",
      creditLimitCents: 10000,
    };
    expect(createApplicationSchema.safeParse(input).success).toBe(false);
    expect(updateApplicationSchema.safeParse({ status: "rejected", creditLimitCents: 10000 }).success).toBe(false);
  });
});
