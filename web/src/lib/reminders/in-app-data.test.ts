import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Student } from "@/lib/api/auth";

import { loadInAppReminders } from "./in-app-data";

// Records each query's filters by table; every read answers empty.
function student() {
  const filters: Record<string, [string, ...unknown[]][]> = {};
  const supabase = {
    from: (table: string) => {
      const calls: [string, ...unknown[]][] = (filters[table] ??= []);
      const query: Record<string, unknown> = {};
      for (const name of ["select", "eq", "not", "gte", "order"]) {
        query[name] = (...args: unknown[]) => { calls.push([name, ...args]); return query; };
      }
      query.maybeSingle = async () => ({ data: { time_zone: "America/New_York" }, error: null });
      query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
      return query;
    },
  };
  return { student: { supabase, studentId: "student-1", email: null } as unknown as Student, filters };
}

describe("loadInAppReminders", () => {
  it("reads only reminders sent in the last 45 days, the ones Updates lists", async () => {
    const { student: s, filters } = student();
    await loadInAppReminders(s, new Date("2026-11-08T23:00:00Z"));
    expect(filters.reminders).toContainEqual(["gte", "sent_at", "2026-09-24T23:00:00.000Z"]);
    expect(filters.reminders).toContainEqual(["not", "sent_at", "is", null]);
  });
});
