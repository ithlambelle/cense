// Created with Claude Code (2026-11-17). POST /applications answers for the
// database's refusals: a card already tracked, and the card limit.
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { POST } from "./route";

// A stand-in for the student's Supabase client whose insert answers `error`.
function studentWhoseInsertFails(error: { code: string; message: string }) {
  const query = { insert: () => query, select: () => query, single: async () => ({ data: null, error }) };
  return { supabase: { from: () => query }, studentId: "student-1", email: null };
}

function post(body: unknown) {
  return POST(new Request("http://localhost/api/v1/applications", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}

const CARD = { cardId: null, cardName: "Student Cash Card", status: "approved", creditLimitCents: null };

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("POST /applications", () => {
  it("answers 409 limit_reached, not a 503 to try again, at the card limit", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    auth.authenticatedStudent.mockResolvedValue(studentWhoseInsertFails({ code: "54000", message: "a student can track at most 25 cards" }));
    const response = await post(CARD);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "limit_reached", message: "You’ve reached the card limit." } });
    expect(logged).not.toHaveBeenCalled();
  });

  it("still answers 409 already_exists for a card already tracked", async () => {
    auth.authenticatedStudent.mockResolvedValue(studentWhoseInsertFails({ code: "23505", message: "duplicate" }));
    const response = await post(CARD);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("already_exists");
  });

  it("answers 503 for any other database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    auth.authenticatedStudent.mockResolvedValue(studentWhoseInsertFails({ code: "PGRST000", message: "down" }));
    expect((await post(CARD)).status).toBe(503);
  });
});

describe("POST /applications, the credit limit rule", () => {
  // The same rule as the Add a card form: $1 to $100,000, or none.
  it.each([0, 99, 10_000_001, 500.5])("refuses a credit limit of %s cents before saving", async (cents) => {
    const insert = vi.fn();
    auth.authenticatedStudent.mockResolvedValue({ supabase: { from: () => ({ insert }) }, studentId: "student-1", email: null });
    const response = await post({ ...CARD, creditLimitCents: cents });
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([100, 10_000_000, null])("takes a credit limit of %s", async (cents) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    auth.authenticatedStudent.mockResolvedValue(studentWhoseInsertFails({ code: "PGRST000", message: "down" }));
    // Past validation, to the insert (which this stand-in fails).
    expect((await post({ ...CARD, creditLimitCents: cents })).status).toBe(503);
  });
});

describe("POST /applications, a catalog card already saved by name", () => {
  // The student's cards with no catalog id, then an insert that answers 201.
  function studentWithNamedCards(names: string[]) {
    const insert = vi.fn(() => insertQuery);
    const insertQuery = {
      select: () => insertQuery,
      single: async () => ({
        data: { id: "00000000-0000-4000-8000-000000000009", card_id: "chase-freedom-rise", card_name: "Chase Freedom Rise", status: "approved",
          credit_limit_cents: null, applied_at: null, updated_at: "2026-11-26T00:00:00+00:00" },
        error: null,
      }),
    };
    const read = { eq: () => read, is: () => read, in: async () => ({ data: names.map((card_name) => ({ card_name })), error: null }) };
    auth.authenticatedStudent.mockResolvedValue({ supabase: { from: () => ({ select: () => read, insert }) }, studentId: "student-1", email: null });
    return insert;
  }
  const CHASE = { cardId: "chase-freedom-rise", cardName: "Chase Freedom Rise", status: "approved", creditLimitCents: null };

  it("answers 409 already_exists instead of a second record", async () => {
    const insert = studentWithNamedCards(["chase freedom rise card"]);
    const response = await post(CHASE);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("already_exists");
    expect(insert).not.toHaveBeenCalled();
  });

  it("adds it when no card saved by name is the same card", async () => {
    const insert = studentWithNamedCards(["Campus CU Visa", "Chase Freedom"]);
    expect((await post(CHASE)).status).toBe(201);
    expect(insert).toHaveBeenCalledOnce();
  });
});

