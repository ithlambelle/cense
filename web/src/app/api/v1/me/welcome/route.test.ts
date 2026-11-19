// Created with Claude Code (2026-11-19). PUT /me/welcome, "Let's go" on the
// first sign-in welcome: saves the first time only.
import { afterEach, describe, expect, it, vi } from "vitest";

// "server-only" refuses to load outside a server build; this test is the server.
vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { PUT } from "./route";

type Row = { welcomed_at: string | null };
type Failure = { code: string; message: string };

// A profile row: an update applies only when its `is null` filter matches.
function student(row: Row | null, failure: { update?: Failure; read?: Failure } = {}) {
  const writes: Row[] = [];
  const query = (update?: Row) => {
    let matches = row !== null;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (column: string, value: string) => {
      matches = matches && column === "student_id" && value === "student-1";
      return chain;
    };
    chain.is = (column: string, value: null) => {
      matches = matches && column === "welcomed_at" && row!.welcomed_at === value;
      return chain;
    };
    chain.maybeSingle = async () => {
      if (update && failure.update) return { data: null, error: failure.update };
      if (!update && failure.read) return { data: null, error: failure.read };
      if (!matches) return { data: null, error: null };
      if (update) {
        writes.push(update);
        Object.assign(row!, update);
      }
      return { data: { ...row! }, error: null };
    };
    return chain;
  };
  const supabase = { from: (table: string) => (table === "profiles" ? { select: () => query(), update: (value: Row) => query(value) } : null) };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  return writes;
}

afterEach(() => {
  auth.authenticatedStudent.mockReset();
  vi.restoreAllMocks();
});

describe("PUT /me/welcome", () => {
  it("refuses a signed-out caller", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await PUT()).status).toBe(401);
  });

  it("saves when the student was welcomed, with no body and nothing cached", async () => {
    const writes = student({ welcomed_at: null });
    const response = await PUT();
    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(writes).toHaveLength(1);
    expect(Number.isNaN(Date.parse(writes[0].welcomed_at!))).toBe(false);
  });

  it("keeps the first time: a second tap, or a second tab, changes nothing and still succeeds", async () => {
    const writes = student({ welcomed_at: "2026-11-19T15:00:00.000Z" });
    expect((await PUT()).status).toBe(204);
    expect(writes).toEqual([]);
  });

  it("answers 404 when the student has no profile", async () => {
    student(null);
    expect((await PUT()).status).toBe(404);
  });

  it("answers 503 when the database cannot save or read it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    student({ welcomed_at: null }, { update: { code: "42703", message: "column does not exist" } });
    expect((await PUT()).status).toBe(503);
    student({ welcomed_at: "2026-11-19T15:00:00.000Z" }, { read: { code: "57014", message: "timeout" } });
    expect((await PUT()).status).toBe(503);
  });
});
