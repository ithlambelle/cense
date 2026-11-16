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
