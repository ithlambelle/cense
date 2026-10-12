import { describe, expect, it } from "vitest";

import {
  applicationIdSchema,
  createApplicationSchema,
  recommendationSchema,
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

  it("rejects malformed application IDs before a database query", () => {
    expect(applicationIdSchema.safeParse("------------------------------------").success).toBe(false);
    expect(applicationIdSchema.safeParse("0123456789abcdef0123456789abcdef0123").success).toBe(false);
  });

  it("accepts a recommendation without a single reason", () => {
    expect(recommendationSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      cardId: "card-1",
      fitTier: "not_yet",
      reason: null,
      createdAt: "2026-10-12T09:00:00Z",
    }).success).toBe(true);
  });
});
