import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const plaid = vi.hoisted(() => ({ syncTransactionsPage: vi.fn() }));
vi.mock("./client", async (importOriginal) => ({ ...(await importOriginal<object>()), ...plaid }));

import type { Student } from "@/lib/api/auth";

import type { PlaidTransaction } from "./client";
import type { PlaidConfig } from "./config";
import type { TokenKey } from "./token-box";
import { loadSpending, MAX_SYNC_PAGES, syncStudentTransactions, toStoredTransaction } from "./transactions";

const CONFIG: PlaidConfig = { clientId: "c", secret: "s", baseUrl: "https://sandbox.plaid.com", tokenKey: Buffer.alloc(32) as TokenKey };

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

describe("toStoredTransaction", () => {
  it("keeps only the fields budgeting needs, in cents", () => {
    expect(toStoredTransaction(txn("t1"))).toEqual({
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
    expect(toStoredTransaction(txn("t2", { amount: -480 }))?.amount_cents).toBe(-48_000);
    expect(toStoredTransaction(txn("t3", { amount: 0.1 + 0.2 }))?.amount_cents).toBe(30);
  });

  it("caps the merchant name and drops a blank one or an odd category", () => {
    expect(toStoredTransaction(txn("t1", { merchant_name: "m".repeat(150) }))?.merchant_name).toHaveLength(100);
    expect(toStoredTransaction(txn("t1", { merchant_name: "  " }))?.merchant_name).toBeNull();
    expect(toStoredTransaction(txn("t1", { merchant_name: null }))?.merchant_name).toBeNull();
    expect(toStoredTransaction(txn("t1", { personal_finance_category: { primary: "food; drop", detailed: "x" } }))).toMatchObject({
      category: null,
      category_detailed: null,
    });
  });

  it("skips a transaction in another currency or without a date", () => {
    expect(toStoredTransaction(txn("t1", { iso_currency_code: "CAD" }))).toBeNull();
    expect(toStoredTransaction(txn("t1", { iso_currency_code: null }))).toBeNull();
    expect(toStoredTransaction(txn("t1", { date: "soon" }))).toBeNull();
  });
});

describe("syncStudentTransactions", () => {
  it("reads every page from the saved cursor, then saves them all at once with the new cursor", async () => {
    plaid.syncTransactionsPage
      .mockResolvedValueOnce(page({ added: [txn("t1"), txn("cad", { iso_currency_code: "CAD" })], next: "c2", more: true }))
      .mockResolvedValueOnce(page({ modified: [txn("t0")], removed: ["gone"], next: "c3" }));
    const s = student((name) => (name === "plaid_transactions_cursor" ? { data: "c1", error: null } : { data: true, error: null }));
    expect(await syncStudentTransactions(s, CONFIG, "access-1")).toEqual({ kind: "synced", saved: 2, removed: 1 });
    expect(plaid.syncTransactionsPage.mock.calls.map((call) => call[2])).toEqual(["c1", "c2"]);
    const apply = s.supabase.rpc.mock.calls.filter((call) => call[0] === "apply_plaid_transactions_sync");
    expect(apply).toHaveLength(1);
    expect(apply[0][1]).toMatchObject({ p_removed: ["gone"], p_cursor: "c3" });
    expect((apply[0][1] as { p_added: { transaction_id: string }[] }).p_added.map((row) => row.transaction_id)).toEqual(["t1"]);
  });

  it("starts from the beginning when there is no cursor yet", async () => {
    plaid.syncTransactionsPage.mockResolvedValueOnce(page({ added: [txn("t1")], next: "c1" }));
    const s = student((name) => (name === "plaid_transactions_cursor" ? { data: null, error: null } : { data: true, error: null }));
    await syncStudentTransactions(s, CONFIG, "access-1");
    expect(plaid.syncTransactionsPage.mock.calls[0][2]).toBeNull();
  });

  it("starts again from the saved cursor when Plaid's data changes mid-way", async () => {
    plaid.syncTransactionsPage
      .mockResolvedValueOnce(page({ added: [txn("t1")], next: "c2", more: true }))
      .mockResolvedValueOnce({ ok: false, kind: "plaid", code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" })
      .mockResolvedValueOnce(page({ added: [txn("t1"), txn("t2")], next: "c9" }));
    const s = student((name) => (name === "plaid_transactions_cursor" ? { data: "c1", error: null } : { data: true, error: null }));
    expect(await syncStudentTransactions(s, CONFIG, "access-1")).toEqual({ kind: "synced", saved: 2, removed: 0 });
    expect(plaid.syncTransactionsPage.mock.calls.map((call) => call[2])).toEqual(["c1", "c2", "c1"]);
  });

  it("saves nothing when Plaid fails, or when there are too many pages", async () => {
    plaid.syncTransactionsPage.mockResolvedValueOnce({ ok: false, kind: "network" });
    const s = student(() => ({ data: "c1", error: null }));
    expect(await syncStudentTransactions(s, CONFIG, "access-1")).toEqual({ kind: "plaid", failure: { ok: false, kind: "network" } });

    plaid.syncTransactionsPage.mockResolvedValue(page({ added: [txn("t1")], next: "cx", more: true }));
    expect(await syncStudentTransactions(s, CONFIG, "access-1")).toEqual({ kind: "too_many_pages" });
    expect(plaid.syncTransactionsPage).toHaveBeenCalledTimes(1 + MAX_SYNC_PAGES);
    expect(s.supabase.rpc.mock.calls.some((call) => call[0] === "apply_plaid_transactions_sync")).toBe(false);
  });

  it("says when the bank was disconnected meanwhile, or the database failed", async () => {
    plaid.syncTransactionsPage.mockResolvedValue(page({ next: "c2" }));
    const gone = student((name) => (name === "plaid_transactions_cursor" ? { data: "c1", error: null } : { data: false, error: null }));
    expect(await syncStudentTransactions(gone, CONFIG, "access-1")).toEqual({ kind: "not_linked" });
    const broken = student(() => ({ data: null, error: { code: "57014", message: "canceling statement" } }));
    expect(await syncStudentTransactions(broken, CONFIG, "access-1")).toEqual({ kind: "database", code: "57014" });
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
