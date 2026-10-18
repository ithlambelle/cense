import { describe, expect, it } from "vitest";

import {
  applicationIdSchema,
  cardSchema,
  createApplicationSchema,
  recommendationSchema,
  saveQuizSchema,
  updateApplicationSchema,
  updateMeSchema,
} from "./schemas";

describe("student API validation", () => {
  it("allows partial quiz progress", () => {
    expect(saveQuizSchema.safeParse({ answers: { under21: true } }).success).toBe(true);
    expect(saveQuizSchema.safeParse({
      answers: {
        under21: true,
        incomeBand: "savings_only",
        student: true,
        standing: "limited",
        recentDenial: false,
        canDeposit: true,
      },
    }).success).toBe(true);
  });

  it("stores a not sure answer about credit history as given", () => {
    expect(saveQuizSchema.parse({ answers: { standing: "not_sure" } }).answers.standing).toBe("not_sure");
  });

  it("rejects unrecognized or invalid quiz fields", () => {
    expect(saveQuizSchema.safeParse({ answers: { age: 19 } }).success).toBe(false);
    expect(saveQuizSchema.safeParse({ answers: { incomeBand: "unknown" } }).success).toBe(false);
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

  it("accepts a recommendation with no suitable card", () => {
    expect(recommendationSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      cardId: null,
      fitTier: "not_yet",
      reason: null,
      createdAt: "2026-10-12T09:00:00Z",
    }).success).toBe(true);
  });

  describe("card", () => {
    const evidence = { basis: "issuer", sourceUrls: ["https://issuer.example/card"], verifiedAt: "2026-10-15" };
    const valid = {
      id: "example-card",
      brand: "Example",
      issuingBank: "Example Bank, N.A.",
      name: "Example Card",
      catalogRole: "recommend",
      catalogRoleReason: "Built for students.",
      annualFeeCents: 0,
      foreignTransactionFeePercent: 3,
      preapprovalUrl: null,
      applyUrl: "https://issuer.example/card",
      referralDisclosure: null,
      historyNeeded: "none",
      minHistoryMonths: null,
      studentsOnly: true,
      secured: false,
      depositMinCents: 0,
      depositMaxCents: null,
      okForRebuilding: false,
      runsCreditCheck: true,
      openToNewApplicants: true,
      conditions: [],
      eligibilityEvidence: Object.fromEntries([
        "annualFeeCents", "historyNeeded", "minHistoryMonths", "studentsOnly", "secured", "depositMinCents",
        "depositMaxCents", "okForRebuilding", "preapprovalUrl", "runsCreditCheck", "openToNewApplicants",
        "foreignTransactionFeePercent", "issuingBank",
      ].map((field) => [field, evidence])),
    };

    it("accepts a card with evidence for every eligibility field", () => {
      expect(cardSchema.safeParse(valid).success).toBe(true);
    });

    it("needs at least one source for each fact", () => {
      const noSource = { ...valid, eligibilityEvidence: { ...valid.eligibilityEvidence, secured: { ...evidence, sourceUrls: [] } } };
      expect(cardSchema.safeParse(noSource).success).toBe(false);
    });

    it("rejects a deposit on an unsecured card", () => {
      expect(cardSchema.safeParse({ ...valid, depositMinCents: 4900 }).success).toBe(false);
      expect(cardSchema.safeParse({ ...valid, depositMaxCents: 20000 }).success).toBe(false);
    });

    it("rejects a silent basis for the history level", () => {
      const silent = { ...valid, eligibilityEvidence: { ...valid.eligibilityEvidence, historyNeeded: { ...evidence, basis: "silent" } } };
      expect(cardSchema.safeParse(silent).success).toBe(false);
    });

    it("accepts only https links", () => {
      expect(cardSchema.safeParse({ ...valid, applyUrl: "javascript:alert(1)" }).success).toBe(false);
      expect(cardSchema.safeParse({ ...valid, preapprovalUrl: "http://issuer.example/check" }).success).toBe(false);
      const badSource = { ...evidence, sourceUrls: ["data:text/html,hi"] };
      expect(cardSchema.safeParse({ ...valid, eligibilityEvidence: { ...valid.eligibilityEvidence, secured: badSource } }).success).toBe(false);
    });

    it("rejects a deposit range that runs backwards", () => {
      expect(cardSchema.safeParse({ ...valid, secured: true, depositMinCents: 20000, depositMaxCents: 4900 }).success).toBe(false);
    });

    it("rejects a condition kind the rules do not know", () => {
      const condition = { kind: "requires_apple_device", affects: "approval", text: "x", sourceUrl: "https://issuer.example", verifiedAt: "2026-10-15" };
      expect(cardSchema.safeParse({ ...valid, conditions: [condition] }).success).toBe(false);
    });

    it("no longer accepts a tax ID note", () => {
      expect(cardSchema.safeParse({ ...valid, taxIdNote: null }).success).toBe(false);
    });
  });
});

describe("updateMeSchema", () => {
  it("trims the name and accepts null or empty to clear it", () => {
    expect(updateMeSchema.parse({ name: "  Maya " })).toEqual({ name: "Maya" });
    expect(updateMeSchema.parse({ name: "   " })).toEqual({ name: "" });
    expect(updateMeSchema.parse({ name: null })).toEqual({ name: null });
  });

  it("rejects a name over 60 characters and unknown fields", () => {
    expect(updateMeSchema.safeParse({ name: "a".repeat(61) }).success).toBe(false);
    expect(updateMeSchema.safeParse({ name: "Maya", avatar: "x" }).success).toBe(false);
  });
});
