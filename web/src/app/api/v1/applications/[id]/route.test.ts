import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authenticatedStudent: vi.fn() }));
vi.mock("@/lib/api/auth", () => auth);

import { GET, PATCH } from "./route";

const ID = "00000000-0000-4000-8000-000000000001";
type Result = { data: unknown; error: { code?: string; message: string } | null };

const row = (over: Record<string, unknown> = {}) => ({
  id: ID, card_id: "discover-it-student", card_name: "Discover it Student Cash", status: "approved",
  credit_limit_cents: 50000, applied_at: null, updated_at: "2026-10-24T15:00:00+00:00",
  denial_reason: null, denial_reason_note: null, autopay_status: "unknown",
  statement_closing_day: null, payment_due_day: null, ...over,
});

// The read answers `current`; the update records what it was given and
// answers `updated` (or echoes the row with the change applied).
function student(current: Result, updated?: Result) {
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
        return chain(() => updated ?? { data: { ...(current.data as object), ...value }, error: null });
      },
    }),
  };
  auth.authenticatedStudent.mockResolvedValue({ supabase, studentId: "student-1", email: null });
  return writes;
}

const params = (id = ID) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, id = ID) =>
  PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify(body) }), params(id));

afterEach(() => {
  vi.restoreAllMocks();
  auth.authenticatedStudent.mockReset();
});

describe("GET /applications/{id}", () => {
  it("returns the card with the detail fields", async () => {
    student({ data: row({ autopay_status: "on", statement_closing_day: 12, payment_due_day: 9 }), error: null });
    const response = await GET(new Request("http://test"), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: ID, status: "approved", creditLimitCents: 50000, autopayStatus: "on",
      statementClosingDay: 12, paymentDueDay: 9, denialReason: null, denialReasonNote: null,
    });
  });

  it("answers 404 for someone else's card, 400 for a bad id, 401 signed out", async () => {
    student({ data: null, error: null });
    expect((await GET(new Request("http://test"), params())).status).toBe(404);
    expect((await GET(new Request("http://test"), params("nope"))).status).toBe(400);
    auth.authenticatedStudent.mockResolvedValue(null);
    expect((await GET(new Request("http://test"), params())).status).toBe(401);
  });
});

describe("PATCH /applications/{id}", () => {
  it("still takes status and credit limit together, as the screens send them", async () => {
    const writes = student({ data: row({ status: "applied", credit_limit_cents: null }), error: null });
    const response = await patch({ status: "approved", creditLimitCents: 75000 });
    expect(response.status).toBe(200);
    expect(writes).toEqual([{ status: "approved", credit_limit_cents: 75000 }]);
    expect(await response.json()).toMatchObject({ status: "approved", creditLimitCents: 75000 });
  });

  it("saves card setup: closing and due days on an approved card", async () => {
    const writes = student({ data: row(), error: null });
    expect((await patch({ statementClosingDay: 12, paymentDueDay: 9 })).status).toBe(200);
    expect(writes).toEqual([{ statement_closing_day: 12, payment_due_day: 9 }]);
  });

  it("saves autopay and stamps when it changed", async () => {
    const writes = student({ data: row(), error: null });
    expect((await patch({ autopayStatus: "on" })).status).toBe(200);
    expect(writes[0]).toMatchObject({ autopay_status: "on" });
    expect(typeof writes[0].autopay_updated_at).toBe("string");
    const same = student({ data: row({ autopay_status: "on" }), error: null });
    await patch({ autopayStatus: "on" });
    expect(same).toEqual([{ autopay_status: "on" }]);
  });

  it("saves a denial reason and a trimmed note on a denied card; an empty note is no note", async () => {
    const writes = student({ data: row({ status: "rejected", credit_limit_cents: null }), error: null });
    expect((await patch({ denialReason: "income", denialReasonNote: "  Said my income was too low  " })).status).toBe(200);
    expect(writes).toEqual([{ denial_reason: "income", denial_reason_note: "Said my income was too low" }]);
    const cleared = student({ data: row({ status: "rejected", credit_limit_cents: null }), error: null });
    await patch({ denialReasonNote: "   " });
    expect(cleared).toEqual([{ denial_reason_note: null }]);
  });

  it("marks a card denied with its reason in one request, dropping the limit", async () => {
    const writes = student({ data: row(), error: null });
    expect((await patch({ status: "rejected", denialReason: "no_credit_history" })).status).toBe(200);
    expect(writes).toEqual([{ status: "rejected", credit_limit_cents: null, denial_reason: "no_credit_history" }]);
  });

  it("refuses fields that do not fit the card's status", async () => {
    student({ data: row(), error: null });
    expect((await patch({ denialReason: "income" })).status).toBe(400);
    student({ data: row({ status: "rejected", credit_limit_cents: null }), error: null });
    expect((await patch({ statementClosingDay: 12 })).status).toBe(400);
    student({ data: row({ status: "rejected", credit_limit_cents: null }), error: null });
    expect((await patch({ creditLimitCents: 1000 })).status).toBe(400);
  });

  it("refuses an empty, unknown or out-of-range body before reading", async () => {
    const writes = student({ data: row(), error: null });
    for (const body of [{}, { nickname: "x" }, { statementClosingDay: 0 }, { paymentDueDay: 32 }, { denialReason: "bad" },
      { denialReasonNote: "x".repeat(201) }, { autopayStatus: "maybe" }, { status: "rejected", creditLimitCents: 100 }]) {
      expect((await patch(body)).status).toBe(400);
    }
    expect(writes).toEqual([]);
  });

  it("maps database answers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    student({ data: null, error: null });
    expect((await patch({ autopayStatus: "on" })).status).toBe(404);
    student({ data: row({ status: "applied", credit_limit_cents: null }), error: null }, { data: null, error: { code: "23505", message: "dup" } });
    expect((await patch({ status: "approved" })).status).toBe(409);
    student({ data: row(), error: null }, { data: null, error: { code: "PGRST000", message: "down" } });
    expect((await patch({ autopayStatus: "off" })).status).toBe(503);
  });
});
