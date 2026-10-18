import { describe, expect, it, vi } from "vitest";

import type { Student } from "../api/auth";
import { listCards } from "../cards/catalog";
import { RULES_VERSION } from "../rules/fit-tier";
import { alreadySaved, cardDataVersion, recommendationRecord, saveRecommendation } from "./save";

const cards = listCards();
const ALL_SIX = { under21: true, incomeBand: "under_5k", student: true, standing: "none", recentDenial: false, canDeposit: true } as const;

// A student whose Supabase client returns `latest` for the read and records the rpc call.
function fakeStudent(latest: { data: unknown; error: unknown }, rpcError: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ error: rpcError });
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: () => Promise.resolve(latest),
  };
  const student = { studentId: "student-1", email: null, supabase: { from: () => query, rpc } } as unknown as Student;
  return { student, rpc };
}

describe("recommendationRecord", () => {
  it("saves nothing while the quiz is unfinished", () => {
    expect(recommendationRecord(undefined, cards)).toBeNull();
    expect(recommendationRecord({ under21: true }, cards)).toBeNull();
  });

  it("saves the picked card with its tier, first reason and both versions", () => {
    const record = recommendationRecord(ALL_SIX, cards);
    expect(record).not.toBeNull();
    if (!record) return;
    const fit = record.p_result_snapshot.cards.find((entry) => entry.cardId === record.p_card_id);
    expect(record.p_card_id).toBe(record.p_result_snapshot.recommendedCardId);
    expect(record.p_fit_tier).toBe(fit?.tier);
    expect(record.p_reason).toBe(fit?.reasons[0]);
    expect(record.p_rules_version).toBe(RULES_VERSION);
    expect(record.p_card_data_version).toMatch(/^cards-[0-9a-f]{12}$/);
    expect(record.p_answer_snapshot).toEqual(ALL_SIX);
  });

  it("saves no card as not_yet with the income gate's reason", () => {
    const record = recommendationRecord({ ...ALL_SIX, incomeBand: "none" }, cards);
    expect(record?.p_card_id).toBeNull();
    expect(record?.p_fit_tier).toBe("not_yet");
    expect(record?.p_reason).toBe(record?.p_result_snapshot.noCardReason?.reason);
  });
});

describe("cardDataVersion", () => {
  it("is stable and changes when a card fact changes", () => {
    expect(cardDataVersion(cards)).toBe(cardDataVersion([...cards]));
    const changed = cards.map((card, index) => (index === 0 ? { ...card, annualFeeCents: 9900 } : card));
    expect(cardDataVersion(changed)).not.toBe(cardDataVersion(cards));
  });
});

describe("alreadySaved", () => {
  const record = recommendationRecord(ALL_SIX, cards)!;
  const same = { answer_snapshot: { ...ALL_SIX }, rules_version: record.p_rules_version, card_data_version: record.p_card_data_version };

  it("matches the same answers and versions, whatever the key order", () => {
    const reordered = Object.fromEntries(Object.entries(ALL_SIX).reverse());
    expect(alreadySaved({ ...same, answer_snapshot: reordered }, record)).toBe(true);
  });

  it("does not match new answers, a new rules version, new card data or no saved row", () => {
    expect(alreadySaved({ ...same, answer_snapshot: { ...ALL_SIX, standing: "limited" } }, record)).toBe(false);
    expect(alreadySaved({ ...same, rules_version: "fit-rules v1.1" }, record)).toBe(false);
    expect(alreadySaved({ ...same, card_data_version: "cards-000000000000" }, record)).toBe(false);
    expect(alreadySaved(null, record)).toBe(false);
  });
});

describe("saveRecommendation", () => {
  it("saves a new result through save_recommendation", async () => {
    const { student, rpc } = fakeStudent({ data: null, error: null });
    expect(await saveRecommendation(student, ALL_SIX, cards)).toBe("saved");
    expect(rpc).toHaveBeenCalledWith("save_recommendation", recommendationRecord(ALL_SIX, cards));
  });

  it("does not save the same result twice", async () => {
    const record = recommendationRecord(ALL_SIX, cards)!;
    const latest = { answer_snapshot: ALL_SIX, rules_version: record.p_rules_version, card_data_version: record.p_card_data_version };
    const { student, rpc } = fakeStudent({ data: latest, error: null });
    expect(await saveRecommendation(student, ALL_SIX, cards)).toBe("unchanged");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("skips an unfinished quiz without touching the database", async () => {
    const { student, rpc } = fakeStudent({ data: null, error: null });
    expect(await saveRecommendation(student, {}, cards)).toBe("skipped");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a failed save instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { student } = fakeStudent({ data: null, error: null }, { code: "42501" });
    expect(await saveRecommendation(student, ALL_SIX, cards)).toBe("failed");
    const readFail = fakeStudent({ data: null, error: { code: "PGRST000" } });
    expect(await saveRecommendation(readFail.student, ALL_SIX, cards)).toBe("failed");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe("saveRecommendation when the client throws", () => {
  it("still returns failed instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const student = { studentId: "s", email: null, supabase: { from: () => { throw new Error("boom"); } } } as unknown as Student;
    expect(await saveRecommendation(student, ALL_SIX, cards)).toBe("failed");
    warn.mockRestore();
  });
});
