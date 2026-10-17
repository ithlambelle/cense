import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { GET } from "./route";

// A stand-in for the student's Supabase client that answers the draft read.
function studentWithDraft(row: { answers: unknown; updated_at: string } | null) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { supabase: { from: () => query }, studentId: "student-1", email: null };
}

const UPDATED = "2026-10-11T00:00:00+00:00";

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("GET /quiz", () => {
  it("returns a saved draft that matches the schema", async () => {
    auth.authenticatedStudent.mockResolvedValue(studentWithDraft({ answers: { under21: true }, updated_at: UPDATED }));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answers: { under21: true }, updatedAt: UPDATED });
  });

  it("keeps only the valid answers of a draft the schema rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cases: [unknown, unknown][] = [
      [{ under21: true, retiredField: 1 }, { under21: true }],
      [{ under21: false, incomeBand: "lots", student: true }, { under21: false, student: true }],
      [null, {}],
      ["text", {}],
    ];
    for (const [answers, kept] of cases) {
      auth.authenticatedStudent.mockResolvedValue(studentWithDraft({ answers, updated_at: UPDATED }));
      const response = await GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ answers: kept, updatedAt: UPDATED });
    }
    // Logged without the answers themselves.
    expect(warn).toHaveBeenCalledTimes(4);
    expect(String(warn.mock.calls[0][0])).not.toContain("retiredField");
  });

  it("says there is no saved quiz when there is no row", async () => {
    auth.authenticatedStudent.mockResolvedValue(studentWithDraft(null));
    expect((await GET()).status).toBe(404);
  });
});
