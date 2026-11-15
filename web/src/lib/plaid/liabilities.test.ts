import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const plaid = vi.hoisted(() => ({ getLiabilities: vi.fn() }));
vi.mock("./client", () => plaid);

import type { Student } from "@/lib/api/auth";

import type { PlaidConfig } from "./config";
import { dueDaysFrom, fillCardDueDays } from "./liabilities";
import type { TokenKey } from "./token-box";

const CONFIG: PlaidConfig = { clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32) as TokenKey };

const card = (over: Record<string, unknown> = {}) => ({
  account_id: "card-1",
  last_statement_issue_date: "2026-10-24",
  next_payment_due_date: "2026-11-18",
  ...over,
});
const liabilities = (...credit: ReturnType<typeof card>[]) => ({ ok: true, data: { liabilities: { credit } } });

type Result = { data: unknown; error: { code?: string; message: string } | null };

// A student whose card_applications reads answer `cards` and whose update
// answers `updated`, recording every call made on the query.
function student(cards: Result, updated: Result = { data: [{ id: "app-1" }], error: null }) {
  const calls: { op: string; args: unknown[] }[] = [];
  const from = vi.fn(() => {
    let isUpdate = false;
    const query: Record<string, unknown> = {};
    for (const op of ["select", "eq", "is"]) {
      query[op] = (...args: unknown[]) => {
        calls.push({ op, args });
        return query;
      };
    }
    query.update = (...args: unknown[]) => {
      isUpdate = true;
      calls.push({ op: "update", args });
      return query;
    };
    query.then = (resolve: (value: Result) => unknown) => resolve(isUpdate ? updated : cards);
    return query;
  });
  return { value: { supabase: { from }, studentId: "student-1", email: null } as unknown as Student, calls };
}

const oneCard = (over: Record<string, unknown> = {}): Result => ({
  data: [{ id: "app-1", statement_closing_day: null, payment_due_day: null, ...over }],
  error: null,
});

afterEach(() => {
  plaid.getLiabilities.mockReset();
});

describe("dueDaysFrom", () => {
  it("takes the day of the month from the one card's statement and due dates", () => {
    expect(dueDaysFrom([card()])).toEqual({ statementClosingDay: 24, paymentDueDay: 18 });
    expect(dueDaysFrom([card({ last_statement_issue_date: "2026-10-31", next_payment_due_date: "2026-11-01" })])).toEqual({
      statementClosingDay: 31,
      paymentDueDay: 1,
    });
  });

  it("has nothing when there is not exactly one card, or a date is missing or malformed", () => {
    expect(dueDaysFrom([])).toBe("not_one");
    expect(dueDaysFrom(null)).toBe("not_one");
    expect(dueDaysFrom([card(), card({ account_id: "card-2" })])).toBe("not_one");
    expect(dueDaysFrom([card({ next_payment_due_date: null })])).toBeNull();
    expect(dueDaysFrom([card({ last_statement_issue_date: "Oct 24" })])).toBeNull();
    expect(dueDaysFrom([card({ next_payment_due_date: "2026-11-00" })])).toBeNull();
  });
});

describe("fillCardDueDays", () => {
  it("fills the one approved card's empty days, only while they are still empty", async () => {
    plaid.getLiabilities.mockResolvedValue(liabilities(card()));
    const s = student(oneCard());
    expect(await fillCardDueDays(s.value, CONFIG, "access-1")).toEqual({ kind: "filled", applicationId: "app-1" });
    expect(plaid.getLiabilities).toHaveBeenCalledWith(CONFIG, "access-1");
    expect(s.calls).toContainEqual({ op: "eq", args: ["status", "approved"] });
    expect(s.calls).toContainEqual({ op: "update", args: [{ statement_closing_day: 24, payment_due_day: 18 }] });
    expect(s.calls).toContainEqual({ op: "is", args: ["statement_closing_day", null] });
    expect(s.calls).toContainEqual({ op: "is", args: ["payment_due_day", null] });
  });

  it("never overwrites days the student entered, even ones saved meanwhile", async () => {
    plaid.getLiabilities.mockResolvedValue(liabilities(card()));
    const set = student(oneCard({ payment_due_day: 5 }));
    expect(await fillCardDueDays(set.value, CONFIG, "access-1")).toEqual({ kind: "skipped", reason: "already_set" });
    expect(set.calls.some((call) => call.op === "update")).toBe(false);

    const meanwhile = student(oneCard(), { data: [], error: null });
    expect(await fillCardDueDays(meanwhile.value, CONFIG, "access-1")).toEqual({ kind: "skipped", reason: "already_set" });
  });

  it("skips when the student has no approved card or more than one", async () => {
    plaid.getLiabilities.mockResolvedValue(liabilities(card()));
    expect(await fillCardDueDays(student({ data: [], error: null }).value, CONFIG, "access-1")).toEqual({ kind: "skipped", reason: "not_one_card" });
    const two = student({ data: [oneCard().data, oneCard().data].flat(), error: null });
    expect(await fillCardDueDays(two.value, CONFIG, "access-1")).toEqual({ kind: "skipped", reason: "not_one_card" });
  });

  it("skips without reading cards when the bank has not exactly one credit card, or no dates", async () => {
    plaid.getLiabilities.mockResolvedValue(liabilities(card(), card({ account_id: "card-2" })));
    const s = student(oneCard());
    expect(await fillCardDueDays(s.value, CONFIG, "access-1")).toEqual({ kind: "skipped", reason: "not_one_bank_card" });
    expect(s.calls).toEqual([]);

    plaid.getLiabilities.mockResolvedValue(liabilities(card({ last_statement_issue_date: null })));
    expect(await fillCardDueDays(s.value, CONFIG, "access-1")).toEqual({ kind: "skipped", reason: "no_dates" });
  });

  it("skips quietly for a bank without Liabilities, and reports other Plaid and database failures", async () => {
    const s = student(oneCard());
    plaid.getLiabilities.mockResolvedValue({ ok: false, kind: "plaid", code: "PRODUCTS_NOT_SUPPORTED" });
    expect(await fillCardDueDays(s.value, CONFIG, "access-1")).toEqual({ kind: "skipped", reason: "no_liabilities" });
    plaid.getLiabilities.mockResolvedValue({ ok: false, kind: "network" });
    expect(await fillCardDueDays(s.value, CONFIG, "access-1")).toEqual({ kind: "plaid", code: null });
    plaid.getLiabilities.mockResolvedValue({ ok: false, kind: "plaid", code: "INTERNAL_SERVER_ERROR" });
    expect(await fillCardDueDays(s.value, CONFIG, "access-1")).toEqual({ kind: "plaid", code: "INTERNAL_SERVER_ERROR" });

    plaid.getLiabilities.mockResolvedValue(liabilities(card()));
    const broken = student({ data: null, error: { code: "57014", message: "canceling statement" } });
    expect(await fillCardDueDays(broken.value, CONFIG, "access-1")).toEqual({ kind: "database", code: "57014" });
  });
});
