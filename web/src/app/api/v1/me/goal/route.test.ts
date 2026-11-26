// Created with Claude Code (2026-11-26). PUT and DELETE /me/goal: only
// the session's own row, only sensible values, and the plan fixed when the
// goal is saved, on the app's calendar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { DELETE, PUT } from "./route";

type Result = { data: unknown; error: unknown };
type Calls = { table?: string; eq?: [string, string][]; upsert?: Record<string, unknown>; onConflict?: string; deleted?: boolean };

// A Supabase client whose goals table answers `existing` to the read before a
// save, `saved` to the save and `deleted` to a delete, recording what was asked.
function student({ existing = { data: null, error: null }, saved = { data: null, error: null }, deleted = { data: null, error: null } }: { existing?: Result; saved?: Result; deleted?: Result } = {}) {
  const calls: Calls = { eq: [] };
  const chain = {
    select: () => chain,
    eq: (column: string, value: string) => (calls.eq!.push([column, value]), chain),
    upsert: (values: Record<string, unknown>, options: { onConflict: string }) => ((calls.upsert = values), (calls.onConflict = options.onConflict), chain),
    delete: () => ((calls.deleted = true), chain),
    maybeSingle: async () => existing,
    single: async () => saved,
    then: (resolve: (value: Result) => unknown) => Promise.resolve(deleted).then(resolve),
  };
  return {
    calls,
    value: { studentId: "student-1", email: null, supabase: { from: (table: string) => ((calls.table = table), chain) } },
  };
}

const ROW = { preset: "emergency_fund", name: "Emergency fund", amount_cents: "124000", target_date: "2027-05-26", monthly_cents: "20667", updated_at: "2026-11-26T15:00:00+00:00" };
const saved = (row: Record<string, unknown> = ROW) => ({ saved: { data: row, error: null } });
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

describe("PUT /me/goal", () => {
  it("saves the goal as the session's student, with its date and monthly amount fixed at the save", async () => {
    const s = student(saved({ ...ROW, preset: "trip", name: "Trip", amount_cents: 60_000, target_date: "2027-03-01", monthly_cents: 20_000 }));
    auth.authenticatedStudent.mockResolvedValue(s.value);
    const response = await put({ preset: "trip", name: "  Trip ", amountCents: 60_000, targetDate: "2027-03-01" });
    expect(response.status).toBe(200);
    expect(s.calls.upsert).toEqual({ student_id: "student-1", preset: "trip", name: "Trip", amount_cents: 60_000, target_date: "2027-03-01", monthly_cents: 20_000 });
    expect(s.calls.onConflict).toBe("student_id");
    expect(((await response.json()) as { goal: unknown }).goal).toMatchObject({ targetDate: "2027-03-01", monthlyCents: 20_000 });
  });

  it("fixes a goal with no date at 6 months from the save, with the date left out or null", async () => {
    for (const body of [{ preset: "emergency_fund", name: "Emergency fund", amountCents: 124_000 }, BODY]) {
      const s = student(saved());
      auth.authenticatedStudent.mockResolvedValue(s.value);
      expect((await put(body)).status).toBe(200);
      expect(s.calls.upsert).toMatchObject({ target_date: "2027-05-26", monthly_cents: 20_667 });
    }
  });

  it("keeps the stored monthly amount when the amount and date are unchanged, and works it out again when they change", async () => {
    // Saved weeks ago at $200 a month; today there are fewer months left.
    const earlier = { data: { amount_cents: "124000", target_date: "2027-05-26", monthly_cents: "20000" }, error: null };
    let s = student({ existing: earlier, ...saved() });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    expect((await put({ ...BODY, targetDate: "2027-05-26" })).status).toBe(200);
    expect(s.calls.upsert).toMatchObject({ monthly_cents: 20_000 });
    s = student({ existing: earlier, ...saved() });
    auth.authenticatedStudent.mockResolvedValue(s.value);
    expect((await put({ ...BODY, amountCents: 150_000, targetDate: "2027-05-26" })).status).toBe(200);
    expect(s.calls.upsert).toMatchObject({ monthly_cents: 25_000 });
  });

  it("never takes a student id from the body", async () => {
    const s = student(saved());
    auth.authenticatedStudent.mockResolvedValue(s.value);
    expect((await put({ ...BODY, studentId: "student-2" })).status).toBe(400);
    expect((await put({ ...BODY, student_id: "student-2" })).status).toBe(400);
    expect(s.calls.upsert).toBeUndefined();
  });

  it("refuses an amount of nothing, a negative one, cents that are not whole, and more than $1,000,000", async () => {
    const s = student(saved());
    auth.authenticatedStudent.mockResolvedValue(s.value);
    for (const amountCents of [0, -100, 10.5, 100_000_001, "1000"]) expect((await put({ ...BODY, amountCents })).status, String(amountCents)).toBe(400);
    expect(s.calls.upsert).toBeUndefined();
  });

  it("refuses a preset it does not know, Start investing included, and a name that is blank or too long", async () => {
    auth.authenticatedStudent.mockResolvedValue(student(saved()).value);
    expect((await put({ ...BODY, preset: "start_investing" })).status).toBe(400);
    expect((await put({ ...BODY, preset: "" })).status).toBe(400);
    expect((await put({ ...BODY, name: "   " })).status).toBe(400);
    expect((await put({ ...BODY, name: "x".repeat(41) })).status).toBe(400);
  });

  it("takes a date from today to 30 years out, and refuses one before or after", async () => {
    const s = student(saved());
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
    const s = student(saved());
    auth.authenticatedStudent.mockResolvedValue(s.value);
    expect((await put(BODY, "text/plain")).status).toBe(400);
    expect(s.calls.upsert).toBeUndefined();
  });

  it("needs a session, and answers 503 when the save fails", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await put(BODY)).status).toBe(401);
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.authenticatedStudent.mockResolvedValue(student({ saved: { data: null, error: { code: "23514", message: "check" } } }).value);
    expect((await put(BODY)).status).toBe(503);
  });
});

describe("DELETE /me/goal", () => {
  it("deletes only the student's own goal, and answers 204 whether or not there was one", async () => {
    const s = student();
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
    auth.authenticatedStudent.mockResolvedValue(student({ deleted: { data: null, error: { code: "42P01", message: "x" } } }).value);
    expect((await DELETE()).status).toBe(503);
  });
});
