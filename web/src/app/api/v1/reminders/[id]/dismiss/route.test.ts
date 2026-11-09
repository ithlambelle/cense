import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { POST } from "./route";

const REM = "00000000-0000-4000-8000-0000000000a1";
const APP = "00000000-0000-4000-8000-000000000001";
type Result = { data: unknown; error: { code?: string; message: string } | null };

const row = {
  id: REM, card_application_id: APP, kind: "payment_due", occurrence: "2026-12-06", due_at: "2026-12-03T14:00:00+00:00",
  sent_at: "2026-12-03T14:01:00+00:00", acted_at: null, read_at: null, snoozed_until: null,
  dismissed_at: "2026-12-03T20:00:00+00:00", follow_up_at: null, created_at: "2026-11-01T15:00:00+00:00",
};

// The student's session: rpc answers `rpcResult`, the profile read the time zone.
function student(rpcResult: Result = { data: row, error: null }) {
  const calls: { name: string; args: unknown }[] = [];
  const query: Record<string, unknown> = {};
  for (const name of ["select", "eq"]) query[name] = () => query;
  query.maybeSingle = async () => ({ data: { time_zone: "America/Los_Angeles" }, error: null });
  const supabase = {
    rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return rpcResult; },
    from: () => query,
  };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  return calls;
}

const dismiss = (id = REM) => POST(new Request("http://test", { method: "POST" }), { params: Promise.resolve({ id }) });

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("POST /reminders/{id}/dismiss", () => {
  it("dismisses through dismiss_reminder, with the day on the student's calendar", async () => {
    const calls = student();
    const response = await dismiss();
    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: "dismiss_reminder", args: { p_reminder_id: REM } }]);
    // 14:00 UTC is 6 AM in Los Angeles: still Dec 3 there.
    expect(await response.json()).toMatchObject({ id: REM, remindOn: "2026-12-03", dismissedAt: "2026-12-03T20:00:00.000Z" });
  });

  it("needs a session, and refuses a bad id before calling the database", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await dismiss()).status).toBe(401);
    const calls = student();
    expect((await dismiss("nope")).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("answers 404 for a reminder that is not theirs, 409 not_sent for an unsent one, 503 when the database fails", async () => {
    student({ data: null, error: { code: "P0002", message: "missing" } });
    expect((await dismiss()).status).toBe(404);
    student({ data: null, error: { code: "55000", message: "not sent" } });
    const unsent = await dismiss();
    expect(unsent.status).toBe(409);
    expect(((await unsent.json()) as { error: { code: string } }).error.code).toBe("not_sent");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    student({ data: null, error: { code: "PGRST000", message: "down" } });
    expect((await dismiss()).status).toBe(503);
  });
});
