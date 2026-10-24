import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { POST as ACTED } from "./[id]/acted/route";
import { GET, POST } from "./route";

const APP = "00000000-0000-4000-8000-000000000001";
const REM = "00000000-0000-4000-8000-0000000000a1";
type Result = { data: unknown; error: { code?: string; message: string } | null };

const row = (over: Record<string, unknown> = {}) => ({
  id: REM, card_application_id: APP, kind: "reapply", occurrence: "2027-04-16",
  due_at: "2027-04-16T13:00:00+00:00", sent_at: null, acted_at: null, created_at: "2026-10-24T15:00:00+00:00", ...over,
});

// The student's client: the profile read answers with `timeZone`; reminders
// reads and writes answer from `results` in order; rpc answers `rpcResult`.
function student({ results = [] as Result[], rpcResult = { data: null, error: null } as Result, timeZone = "America/New_York" } = {}) {
  const calls: { op: string; value?: unknown; args?: unknown }[] = [];
  const queue = [...results];
  const chain = (answer: () => Result) => {
    const query: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "order"]) query[name] = () => query;
    query.maybeSingle = async () => answer();
    query.then = (resolve: (value: Result) => unknown) => Promise.resolve(answer()).then(resolve);
    return query;
  };
  const supabase = {
    from: (table: string) => {
      if (table === "profiles") return chain(() => ({ data: { time_zone: timeZone }, error: null }));
      return {
        select: () => chain(() => queue.shift()!),
        update: (value: unknown) => { calls.push({ op: "update", value }); return chain(() => queue.shift()!); },
      };
    },
    rpc: async (name: string, args: unknown) => { calls.push({ op: name, args }); return rpcResult; },
  };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  return calls;
}

const post = (body: unknown) => new Request("http://test", { method: "POST", body: JSON.stringify(body) });
const acted = (id = REM) => ACTED(new Request("http://test", { method: "POST" }), { params: Promise.resolve({ id }) });

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("GET /reminders", () => {
  it("lists the student's reminders with the day on their calendar", async () => {
    student({ results: [{ data: [row({ kind: "payment_due", occurrence: "2026-12-09", due_at: "2026-12-06T14:00:00+00:00" })], error: null }] });
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reminders).toHaveLength(1);
    expect(body.reminders[0]).toMatchObject({ kind: "payment_due", occurrence: "2026-12-09", remindOn: "2026-12-06", sentAt: null });
  });

  it("needs a session and reports a database error", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    student({ results: [{ data: null, error: { code: "PGRST000", message: "down" } }] });
    expect((await GET()).status).toBe(503);
  });
});

describe("POST /reminders (reapply)", () => {
  it("saves through create_reapply_reminder", async () => {
    const calls = student({ rpcResult: { data: row(), error: null } });
    const response = await POST(post({ applicationId: APP, remindOn: "2027-04-16" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: REM, kind: "reapply", remindOn: "2027-04-16" });
    expect(calls).toEqual([{ op: "create_reapply_reminder", args: { p_application_id: APP, p_remind_on: "2027-04-16" } }]);
  });

  it("maps the database's refusals", async () => {
    student({ rpcResult: { data: null, error: { code: "22023", message: "day" } } });
    expect((await POST(post({ applicationId: APP, remindOn: "2026-10-24" }))).status).toBe(400);
    student({ rpcResult: { data: null, error: { code: "P0002", message: "missing" } } });
    expect((await POST(post({ applicationId: APP, remindOn: "2027-04-16" }))).status).toBe(404);
    student({ rpcResult: { data: null, error: { code: "23505", message: "sent" } } });
    expect((await POST(post({ applicationId: APP, remindOn: "2027-04-16" }))).status).toBe(409);
  });

  it("refuses a bad body before calling the database", async () => {
    const calls = student();
    for (const body of [{}, { applicationId: "x", remindOn: "2027-04-16" }, { applicationId: APP, remindOn: "next april" }, { applicationId: APP, remindOn: "2027-04-16", kind: "payment_due" }]) {
      expect((await POST(post(body))).status).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});

describe("POST /reminders/{id}/acted", () => {
  it("marks a sent reminder acted on", async () => {
    const sent = row({ kind: "statement_closing", sent_at: "2026-11-09T14:01:00+00:00" });
    const calls = student({ results: [{ data: sent, error: null }, { data: { ...sent, acted_at: "2026-11-10T12:00:00+00:00" }, error: null }] });
    const response = await acted();
    expect(response.status).toBe(200);
    expect((await response.json()).actedAt).toBe("2026-11-10T12:00:00.000Z");
    expect(calls[0].op).toBe("update");
  });

  it("keeps the first time when already acted on", async () => {
    const done = row({ sent_at: "2026-11-09T14:01:00+00:00", acted_at: "2026-11-09T20:00:00+00:00" });
    const calls = student({ results: [{ data: done, error: null }] });
    expect((await (await acted()).json()).actedAt).toBe("2026-11-09T20:00:00.000Z");
    expect(calls).toEqual([]);
  });

  it("refuses an unsent, missing or malformed reminder", async () => {
    student({ results: [{ data: row(), error: null }] });
    expect((await acted()).status).toBe(409);
    student({ results: [{ data: null, error: null }] });
    expect((await acted()).status).toBe(404);
    student();
    expect((await acted("nope")).status).toBe(400);
  });
});
