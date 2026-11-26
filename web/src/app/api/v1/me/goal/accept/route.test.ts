// Created with Claude Code (2026-11-26). POST /me/goal/accept: Accept plan
// writes only the set-aside, through accept_goal_plan() as the student.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);
vi.mock("@/lib/plaid/config", () => ({ plaidConfig: () => ({}) }));

import { POST } from "./route";

function student(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { rpc, value: { studentId: "student-1", email: null, supabase: { rpc } } };
}

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("POST /me/goal/accept", () => {
  it("calls accept_goal_plan with nothing from the browser, and answers 204", async () => {
    const s = student({ data: "accepted", error: null });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    const response = await POST();
    expect(response.status).toBe(204);
    expect(s.rpc).toHaveBeenCalledWith("accept_goal_plan");
  });

  it("answers 404 with no goal or no bank, 409 for a goal with nothing to set aside", async () => {
    for (const [outcome, status, code] of [
      ["no_goal", 404, "not_found"],
      ["no_bank", 404, "not_linked"],
      ["nothing_to_set_aside", 409, "nothing_to_set_aside"],
    ] as const) {
      auth.authenticatedStudent.mockResolvedValue(student({ data: outcome, error: null }).value);
      const response = await POST();
      expect(response.status, outcome).toBe(status);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(code);
    }
  });

  it("answers 400 when the monthly amount is more than a set-aside can be", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    auth.authenticatedStudent.mockResolvedValue(student({ data: null, error: { code: "23514", message: "check" } }).value);
    expect((await POST()).status).toBe(400);
  });

  it("needs a session, and answers 503 when the database fails", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.authenticatedStudent.mockResolvedValue(student({ data: null, error: { code: "42883", message: "no function" } }).value);
    expect((await POST()).status).toBe(503);
  });
});
