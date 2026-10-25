import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { GET, PATCH } from "./route";

type Result = { data: unknown; error: { code?: string; message: string } | null };
const ROW = { reminders_unsubscribed_at: null, remind_statement_closing: true, remind_payment_due: true, remind_check_autopay: true };

// The profile read answers `current`; an update records its columns and
// answers the row with them applied.
function student(current: Result) {
  const writes: Record<string, unknown>[] = [];
  const chain = (answer: () => Result) => {
    const query: Record<string, unknown> = {};
    for (const name of ["select", "eq"]) query[name] = () => query;
    query.maybeSingle = async () => answer();
    return query;
  };
  const supabase = {
    from: () => ({
      select: () => chain(() => current),
      update: (value: Record<string, unknown>) => {
        writes.push(value);
        return chain(() => ({ data: current.data ? { ...(current.data as object), ...value } : null, error: current.error }));
      },
    }),
  };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  return writes;
}

const patch = (body: unknown) => PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify(body) }));

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("GET /me/reminder-settings", () => {
  it("reads the toggles, with emailsOn from the unsubscribe time", async () => {
    student({ data: { ...ROW, remind_payment_due: false, reminders_unsubscribed_at: "2026-10-24T15:00:00Z" }, error: null });
    expect(await (await GET()).json()).toEqual({ emailsOn: false, statementClosing: true, paymentDue: false, checkAutopay: true });
  });

  it("needs a session", async () => {
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});

describe("PATCH /me/reminder-settings", () => {
  it("turns one kind off", async () => {
    const writes = student({ data: ROW, error: null });
    const response = await patch({ paymentDue: false });
    expect(response.status).toBe(200);
    expect(writes).toEqual([{ remind_payment_due: false }]);
    expect((await response.json()).paymentDue).toBe(false);
  });

  it("unsubscribes once and keeps the first time", async () => {
    const writes = student({ data: ROW, error: null });
    await patch({ emailsOn: false });
    expect(Object.keys(writes[0])).toEqual(["reminders_unsubscribed_at"]);
    const again = student({ data: { ...ROW, reminders_unsubscribed_at: "2026-10-24T15:00:00Z" }, error: null });
    expect((await (await patch({ emailsOn: false })).json()).emailsOn).toBe(false);
    expect(again).toEqual([]);
  });

  it("subscribes again", async () => {
    const writes = student({ data: { ...ROW, reminders_unsubscribed_at: "2026-10-24T15:00:00Z" }, error: null });
    expect((await (await patch({ emailsOn: true })).json()).emailsOn).toBe(true);
    expect(writes).toEqual([{ reminders_unsubscribed_at: null }]);
  });

  it("refuses an empty or unknown body", async () => {
    const writes = student({ data: ROW, error: null });
    for (const body of [{}, { sms: true }, { paymentDue: "no" }]) expect((await patch(body)).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("answers 404 without a profile and 503 on a database error", async () => {
    student({ data: null, error: null });
    expect((await patch({ paymentDue: false })).status).toBe(404);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    student({ data: null, error: { code: "PGRST000", message: "down" } });
    expect((await GET()).status).toBe(503);
  });
});
