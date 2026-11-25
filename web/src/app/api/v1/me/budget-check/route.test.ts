// Created with Claude Code (2026-11-25). PUT /me/budget-check, "Looks right"
// after Penny reads the bank: saves when the student checked their budget.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { PUT } from "./route";

function student(result: { data: unknown; error: unknown }) {
  const calls: { update?: Record<string, unknown>; eq?: [string, string] } = {};
  const chain = {
    update: (values: Record<string, unknown>) => ((calls.update = values), chain),
    eq: (column: string, value: string) => ((calls.eq = [column, value]), chain),
    select: () => chain,
    maybeSingle: async () => result,
  };
  return { calls, value: { studentId: "student-1", email: null, supabase: { from: (table: string) => (expect(table).toBe("profiles"), chain) } } };
}

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("PUT /me/budget-check", () => {
  it("saves the time on the student's own profile and answers 204", async () => {
    const s = student({ data: { student_id: "student-1" }, error: null });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    const response = await PUT();
    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(s.calls.eq).toEqual(["student_id", "student-1"]);
    expect(Number.isNaN(Date.parse(String(s.calls.update?.budget_checked_at)))).toBe(false);
  });

  it("needs a session", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await PUT()).status).toBe(401);
  });

  it("answers 404 with no profile, and 503 when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.authenticatedStudent.mockResolvedValue(student({ data: null, error: null }).value);
    expect((await PUT()).status).toBe(404);
    auth.authenticatedStudent.mockResolvedValue(student({ data: null, error: { code: "42703", message: "column does not exist" } }).value);
    expect((await PUT()).status).toBe(503);
  });
});
