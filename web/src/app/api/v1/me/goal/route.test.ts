// Created with Claude Code (2026-11-26). GET, PUT and DELETE /me/goal: only
// the session's own row, only sensible values, and the plan worked out on the
// app's calendar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { DELETE, GET, PUT } from "./route";

type Result = { data: unknown; error: unknown };
type Calls = { table?: string; eq?: [string, string][]; upsert?: Record<string, unknown>; onConflict?: string; deleted?: boolean };

// A Supabase client whose one table answers `result`, recording what was asked.
function student(result: Result) {
  const calls: Calls = { eq: [] };
  const chain = {
    select: () => chain,
    eq: (column: string, value: string) => (calls.eq!.push([column, value]), chain),
    upsert: (values: Record<string, unknown>, options: { onConflict: string }) => ((calls.upsert = values), (calls.onConflict = options.onConflict), chain),
    delete: () => ((calls.deleted = true), chain),
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return {
    calls,
    value: { studentId: "student-1", email: null, supabase: { from: (table: string) => ((calls.table = table), chain) } },
  };
}

const ROW = { preset: "emergency_fund", name: "Emergency fund", amount_cents: "124000", target_date: null, updated_at: "2026-11-26T15:00:00+00:00" };
const BODY = { preset: "emergency_fund", name: "Emergency fund", amountCents: 124_000, targetDate: null };

const put = (body: unknown, type = "application/json") =>
  PUT(new Request("http://localhost/api/v1/me/goal", { method: "PUT", headers: { "content-type": type }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Noon in Boston, November 26.
  vi.setSystemTime(new Date("2026-11-26T17:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("GET /me/goal", () => {
  it("reads only the student's own goal, with its plan for today", async () => {
    const s = student({ data: ROW, error: null });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(s.calls.table).toBe("goals");
    expect(s.calls.eq).toEqual([["student_id", "student-1"]]);
    expect(await response.json()).toEqual({
      goal: {
        preset: "emergency_fund",
        name: "Emergency fund",
        amountCents: 124_000,
        targetDate: null,
        plan: { months: 6, monthlyCents: 20_667, byDate: "2027-05-26" },
        updatedAt: "2026-11-26T15:00:00.000Z",
      },
    });
  });

  it("answers null for a student with no goal yet", async () => {
    auth.authenticatedStudent.mockResolvedValue(student({ data: null, error: null }).value);
    expect(await (await GET()).json()).toEqual({ goal: null });
  });

  it("needs a session, and answers 503 when the database fails", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.authenticatedStudent.mockResolvedValue(student({ data: null, error: { code: "42P01", message: "relation does not exist" } }).value);
    expect((await GET()).status).toBe(503);
  });
});

describe("PUT /me/goal", () => {
  it("saves the goal as the session's student, replacing any they had", async () => {
    const s = student({ data: { ...ROW, preset: "trip", name: "Trip", amount_cents: 60_000, target_date: "2027-03-01" }, error: null });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    const response = await put({ preset: "trip", name: "  Trip ", amountCents: 60_000, targetDate: "2027-03-01" });
    expect(response.status).toBe(200);
    expect(s.calls.upsert).toEqual({ student_id: "student-1", preset: "trip", name: "Trip", amount_cents: 60_000, target_date: "2027-03-01" });
    expect(s.calls.onConflict).toBe("student_id");
    const { goal } = (await response.json()) as { goal: { plan: unknown } };
    expect(goal.plan).toEqual({ months: 3, monthlyCents: 20_000, byDate: "2027-03-01" });
  });

  it("never takes a student id from the body", async () => {
    const s = student({ data: ROW, error: null });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    expect((await put({ ...BODY, studentId: "student-2" })).status).toBe(400);
    expect((await put({ ...BODY, student_id: "student-2" })).status).toBe(400);
    expect(s.calls.upsert).toBeUndefined();
  });

  it("refuses an amount of nothing, a negative one, cents that are not whole, and more than $1,000,000", async () => {
    const s = student({ data: ROW, error: null });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    for (const amountCents of [0, -100, 10.5, 100_000_001, "1000"]) expect((await put({ ...BODY, amountCents })).status, String(amountCents)).toBe(400);
    expect(s.calls.upsert).toBeUndefined();
  });

  it("refuses a preset it does not know, Start investing included, and a name that is blank or too long", async () => {
    auth.authenticatedStudent.mockResolvedValue(student({ data: ROW, error: null }).value);
    expect((await put({ ...BODY, preset: "start_investing" })).status).toBe(400);
    expect((await put({ ...BODY, preset: "" })).status).toBe(400);
    expect((await put({ ...BODY, name: "   " })).status).toBe(400);
    expect((await put({ ...BODY, name: "x".repeat(41) })).status).toBe(400);
  });

  it("takes a date from today to 30 years out, and refuses one before or after", async () => {
    const s = student({ data: ROW, error: null });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    expect((await put({ ...BODY, targetDate: "2026-11-25" })).status).toBe(400);
    expect((await put({ ...BODY, targetDate: "2056-11-27" })).status).toBe(400);
    expect((await put({ ...BODY, targetDate: "2026-02-30" })).status).toBe(400);
    expect((await put({ ...BODY, targetDate: "next year" })).status).toBe(400);
    expect(s.calls.upsert).toBeUndefined();
    expect((await put({ ...BODY, targetDate: "2026-11-26" })).status).toBe(200);
    expect((await put({ ...BODY, targetDate: "2056-11-26" })).status).toBe(200);
  });

  it("reads only a JSON body", async () => {
    const s = student({ data: ROW, error: null });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    expect((await put(BODY, "text/plain")).status).toBe(400);
    expect(s.calls.upsert).toBeUndefined();
  });

  it("needs a session, and answers 503 when the save fails", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await put(BODY)).status).toBe(401);
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.authenticatedStudent.mockResolvedValue(student({ data: null, error: { code: "23514", message: "check" } }).value);
    expect((await put(BODY)).status).toBe(503);
  });
});

describe("DELETE /me/goal", () => {
  it("deletes only the student's own goal, and answers 204 whether or not there was one", async () => {
    const s = student({ data: null, error: null });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    const response = await DELETE();
    expect(response.status).toBe(204);
    expect(s.calls.deleted).toBe(true);
    expect(s.calls.eq).toEqual([["student_id", "student-1"]]);
  });

  it("needs a session, and answers 503 when the database fails", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await DELETE()).status).toBe(401);
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.authenticatedStudent.mockResolvedValue(student({ data: null, error: { code: "42P01", message: "x" } }).value);
    expect((await DELETE()).status).toBe(503);
  });
});
