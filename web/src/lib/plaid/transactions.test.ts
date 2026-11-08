import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const plaid = vi.hoisted(() => ({ syncTransactionsPage: vi.fn() }));
vi.mock("./client", async (importOriginal) => ({ ...(await importOriginal<object>()), ...plaid }));

import type { Student } from "@/lib/api/auth";

import type { PlaidTransaction } from "./client";
import type { PlaidConfig } from "./config";
import type { TokenKey } from "./token-box";
import { KEEP_DAYS, loadSpending, MAX_SYNC_PAGES, oldestKeptDate, syncStudentTransactions, toStoredTransaction } from "./transactions";

const CONFIG: PlaidConfig = { clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32) as TokenKey };

// A fixed today, so the 180-day window never moves under the tests.
const NOW = new Date("2026-11-07T15:00:00Z");
const OLDEST = "2026-05-11";

const txn = (id: string, overrides: Partial<PlaidTransaction> = {}): PlaidTransaction => ({
  transaction_id: id,
  account_id: "acc-1",
  amount: 12.34,
  iso_currency_code: "USD",
  date: "2026-11-05",
  pending: false,
  merchant_name: "Chipotle",
  personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_RESTAURANT" },
  ...overrides,
});

const page = (data: { added?: PlaidTransaction[]; modified?: PlaidTransaction[]; removed?: string[]; next: string; more?: boolean }) => ({
  ok: true,
  data: {
    added: data.added ?? [],
    modified: data.modified ?? [],
    removed: (data.removed ?? []).map((transaction_id) => ({ transaction_id })),
    next_cursor: data.next,
    has_more: data.more ?? false,
  },
});

function student(rpc: (name: string, args?: unknown) => unknown) {
  return { supabase: { rpc: vi.fn(async (name: string, args?: unknown) => rpc(name, args)) }, studentId: "student-1", email: null } as unknown as Student & {
    supabase: { rpc: ReturnType<typeof vi.fn> };
  };
}

afterEach(() => {
  plaid.syncTransactionsPage.mockReset();
  vi.restoreAllMocks();
});

describe("oldestKeptDate", () => {
  it("is 180 days before today in UTC", () => {
    expect(KEEP_DAYS).toBe(180);
    expect(oldestKeptDate(NOW)).toBe(OLDEST);
    // late evening in Boston is already tomorrow in UTC, as in the database
    expect(oldestKeptDate(new Date("2026-11-07T23:30:00-05:00"))).toBe("2026-05-12");
    expect(oldestKeptDate(new Date("2026-03-01T00:00:00Z"))).toBe("2025-09-02");
  });
});

describe("toStoredTransaction", () => {
  it("keeps only the fields budgeting and bill detection need, in cents", () => {
    expect(toStoredTransaction(txn("t1"), OLDEST)).toEqual({
      transaction_id: "t1",
      account_id: "acc-1",
      posted_on: "2026-11-05",
      amount_cents: 1234,
      pending: false,
      category: "FOOD_AND_DRINK",
      category_detailed: "FOOD_AND_DRINK_RESTAURANT",
      merchant_name: "Chipotle",
    });
    // money in keeps Plaid's negative sign
    expect(toStoredTransaction(txn("t2", { amount: -480 }), OLDEST)?.amount_cents).toBe(-48_000);
    expect(toStoredTransaction(txn("t3", { amount: 0.1 + 0.2 }), OLDEST)?.amount_cents).toBe(30);
  });

  it("caps the merchant name at 100 characters and drops a blank one", () => {
    expect(toStoredTransaction(txn("t1", { merchant_name: "m".repeat(150) }), OLDEST)?.merchant_name).toHaveLength(100);
    expect(toStoredTransaction(txn("t1", { merchant_name: "  " }), OLDEST)?.merchant_name).toBeNull();
    expect(toStoredTransaction(txn("t1", { merchant_name: null }), OLDEST)?.merchant_name).toBeNull();
  });

  it("never cuts an emoji in half when capping the merchant name", () => {
    const name = toStoredTransaction(txn("t1", { merchant_name: `${"a".repeat(99)}\u{1F600}b` }), OLDEST)?.merchant_name ?? "";
    expect(Array.from(name)).toHaveLength(100);
    expect(name.endsWith("\u{1F600}")).toBe(true);
    // no lone surrogate: Postgres refuses one and the whole sync would fail
    expect(name.isWellFormed()).toBe(true);
  });

  it("drops an odd category", () => {
    expect(toStoredTransaction(txn("t1", { personal_finance_category: { primary: "food; drop", detailed: "x" } }), OLDEST)).toMatchObject({
      category: null,
      category_detailed: null,
    });
  });

  it("skips a transaction in another currency or without a date", () => {
    expect(toStoredTransaction(txn("t1", { iso_currency_code: "CAD" }), OLDEST)).toBeNull();
    expect(toStoredTransaction(txn("t1", { iso_currency_code: null }), OLDEST)).toBeNull();
    expect(toStoredTransaction(txn("t1", { date: "soon" }), OLDEST)).toBeNull();
  });

  it("skips a transaction posted before the oldest day kept, and keeps that day itself", () => {
    expect(toStoredTransaction(txn("t1", { date: "2026-05-10" }), OLDEST)).toBeNull();
    expect(toStoredTransaction(txn("t1", { date: OLDEST }), OLDEST)?.posted_on).toBe(OLDEST);
  });
});

describe("syncStudentTransactions", () => {
  it("reads every page from the saved cursor, then saves them all at once with the new cursor", async () => {
    plaid.syncTransactionsPage
      .mockResolvedValueOnce(page({ added: [txn("t1"), txn("cad", { iso_currency_code: "CAD" })], next: "c2", more: true }))
      .mockResolvedValueOnce(page({ modified: [txn("t0")], removed: ["gone"], next: "c3" }));
    const s = student((name) => (name === "plaid_transactions_cursor" ? { data: "c1", error: null } : { data: true, error: null }));
    expect(await syncStudentTransactions(s, CONFIG, "access-1", NOW)).toEqual({ kind: "synced", saved: 2, removed: 1 });
    expect(plaid.syncTransactionsPage.mock.calls.map((call) => call[2])).toEqual(["c1", "c2"]);
    const apply = s.supabase.rpc.mock.calls.filter((call) => call[0] === "apply_plaid_transactions_sync");
    expect(apply).toHaveLength(1);
    expect(apply[0][1]).toMatchObject({ p_removed: ["gone"], p_cursor: "c3" });
    expect((apply[0][1] as { p_added: { transaction_id: string }[] }).p_added.map((row) => row.transaction_id)).toEqual(["t1"]);
  });

  it("never sends the database a transaction older than 180 days, or a field it does not keep", async () => {
    plaid.syncTransactionsPage.mockResolvedValueOnce(
      page({ added: [txn("new"), txn("old", { date: "2026-04-01" })], modified: [txn("old-mod", { date: "2026-05-10" })], next: "c2" }),
    );
    const s = student((name) => (name === "plaid_transactions_cursor" ? { data: "c1", error: null } : { data: true, error: null }));
    expect(await syncStudentTransactions(s, CONFIG, "access-1", NOW)).toEqual({ kind: "synced", saved: 1, removed: 0 });
    const args = s.supabase.rpc.mock.calls.find((call) => call[0] === "apply_plaid_transactions_sync")?.[1] as {
      p_added: Record<string, unknown>[];
      p_modified: Record<string, unknown>[];
    };
    expect(args.p_added.map((row) => row.transaction_id)).toEqual(["new"]);
    expect(args.p_modified).toEqual([]);
    expect(Object.keys(args.p_added[0]).sort()).toEqual([
      "account_id",
      "amount_cents",
      "category",
      "category_detailed",
      "merchant_name",
      "pending",
      "posted_on",
      "transaction_id",
    ]);
  });

  it("starts from the beginning when there is no cursor yet", async () => {
    plaid.syncTransactionsPage.mockResolvedValueOnce(page({ added: [txn("t1")], next: "c1" }));
    const s = student((name) => (name === "plaid_transactions_cursor" ? { data: null, error: null } : { data: true, error: null }));
    await syncStudentTransactions(s, CONFIG, "access-1", NOW);
    expect(plaid.syncTransactionsPage.mock.calls[0][2]).toBeNull();
  });

  it("starts again from the saved cursor when Plaid's data changes mid-way", async () => {
    plaid.syncTransactionsPage
      .mockResolvedValueOnce(page({ added: [txn("t1")], next: "c2", more: true }))
      .mockResolvedValueOnce({ ok: false, kind: "plaid", code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" })
      .mockResolvedValueOnce(page({ added: [txn("t1"), txn("t2")], next: "c9" }));
    const s = student((name) => (name === "plaid_transactions_cursor" ? { data: "c1", error: null } : { data: true, error: null }));
    expect(await syncStudentTransactions(s, CONFIG, "access-1", NOW)).toEqual({ kind: "synced", saved: 2, removed: 0 });
    expect(plaid.syncTransactionsPage.mock.calls.map((call) => call[2])).toEqual(["c1", "c2", "c1"]);
  });

  it("saves nothing when Plaid fails, or when there are too many pages", async () => {
    plaid.syncTransactionsPage.mockResolvedValueOnce({ ok: false, kind: "network" });
    const s = student(() => ({ data: "c1", error: null }));
    expect(await syncStudentTransactions(s, CONFIG, "access-1", NOW)).toEqual({ kind: "plaid", failure: { ok: false, kind: "network" } });

    plaid.syncTransactionsPage.mockResolvedValue(page({ added: [txn("t1")], next: "cx", more: true }));
    expect(await syncStudentTransactions(s, CONFIG, "access-1", NOW)).toEqual({ kind: "too_many_pages" });
    expect(plaid.syncTransactionsPage).toHaveBeenCalledTimes(1 + MAX_SYNC_PAGES);
    expect(s.supabase.rpc.mock.calls.some((call) => call[0] === "apply_plaid_transactions_sync")).toBe(false);
  });

  it("says when the bank was disconnected meanwhile, or the database failed", async () => {
    plaid.syncTransactionsPage.mockResolvedValue(page({ next: "c2" }));
    const gone = student((name) => (name === "plaid_transactions_cursor" ? { data: "c1", error: null } : { data: false, error: null }));
    expect(await syncStudentTransactions(gone, CONFIG, "access-1", NOW)).toEqual({ kind: "not_linked" });
    const broken = student(() => ({ data: null, error: { code: "57014", message: "canceling statement" } }));
    expect(await syncStudentTransactions(broken, CONFIG, "access-1", NOW)).toEqual({ kind: "database", code: "57014" });
  });
});

describe("loadSpending", () => {
  it("returns totals only, as numbers", async () => {
    const s = student((name) =>
      name === "spending_by_category"
        ? { data: [{ month: "2026-11-01", category: "FOOD_AND_DRINK", spent_cents: "1800", transaction_count: 2 }], error: null }
        : { data: [{ month: "2026-11-01", income_cents: 48000, transaction_count: 1 }], error: null },
    );
    expect(await loadSpending(s)).toEqual({
      ok: true,
      value: {
        byCategory: [{ month: "2026-11-01", category: "FOOD_AND_DRINK", spentCents: 1800, transactionCount: 2 }],
        income: [{ month: "2026-11-01", incomeCents: 48000, transactionCount: 1 }],
      },
    });
    expect(s.supabase.rpc).toHaveBeenCalledWith("spending_by_category", { p_months: 3 });
  });
});
