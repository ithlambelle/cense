import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { GET, PATCH } from "./route";

type Row = { analytics_opted_out_at: string | null };

// A profile row: reads answer it; an update applies its value only when the
// filters match (an `is null` filter on a row that is already off matches nothing).
function student(row: Row | null) {
  const writes: Row[] = [];
  const query = (update?: Row) => {
    let matches = row !== null;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.is = (_column: string, value: null) => {
      matches = matches && row!.analytics_opted_out_at === value;
      return chain;
    };
    chain.maybeSingle = async () => {
      if (!matches) return { data: null, error: null };
      if (update) {
        writes.push(update);
        Object.assign(row!, update);
      }
      return { data: { ...row! }, error: null };
    };
    return chain;
  };
  const supabase = { from: () => ({ select: () => query(), update: (value: Row) => query(value) }) };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  return writes;
}

const patch = (body: unknown) => PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify(body) }));

afterEach(() => {
  auth.authenticatedStudent.mockReset();
});

describe("/me/privacy", () => {
  it("refuses a signed-out caller", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await patch({ analyticsOn: false })).status).toBe(401);
  });

  it("reads on when it was never turned off, and off once it was", async () => {
    student({ analytics_opted_out_at: null });
    expect(await (await GET()).json()).toEqual({ analyticsOn: true });
    student({ analytics_opted_out_at: "2026-10-25T12:00:00.000Z" });
    expect(await (await GET()).json()).toEqual({ analyticsOn: false });
  });

  it("turns it off with the time, keeps the first time on a repeat, and clears it to turn it on", async () => {
    const writes = student({ analytics_opted_out_at: null });
    expect(await (await patch({ analyticsOn: false })).json()).toEqual({ analyticsOn: false });
    expect(writes).toHaveLength(1);
    expect(writes[0].analytics_opted_out_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await (await patch({ analyticsOn: false })).json()).toEqual({ analyticsOn: false });
    expect(writes).toHaveLength(1);
    expect(await (await patch({ analyticsOn: true })).json()).toEqual({ analyticsOn: true });
    expect(writes[1]).toEqual({ analytics_opted_out_at: null });
  });

  it("refuses anything but a yes or no, and a missing profile", async () => {
    student({ analytics_opted_out_at: null });
    expect((await patch({ analyticsOn: "no" })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ analyticsOn: true, extra: 1 })).status).toBe(400);
    student(null);
    expect((await GET()).status).toBe(404);
    expect((await patch({ analyticsOn: false })).status).toBe(404);
  });
});
