import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { POST } from "./route";

type Result = { data: unknown; error: { code?: string; message: string } | null };

function student(rpcResult: Result) {
  const calls: string[] = [];
  const supabase = { rpc: async (name: string) => { calls.push(name); return rpcResult; } };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("POST /reminders/read", () => {
  it("marks every unread one read and says how many", async () => {
    const calls = student({ data: 3, error: null });
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ marked: 3 });
    expect(calls).toEqual(["mark_reminders_read"]);
    student({ data: null, error: null });
    expect(await (await POST()).json()).toEqual({ marked: 0 });
  });

  it("needs a session, and answers 503 when the database fails", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    student({ data: null, error: { code: "PGRST000", message: "down" } });
    expect((await POST()).status).toBe(503);
  });
});
