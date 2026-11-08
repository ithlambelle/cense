import "server-only";

import type { Student } from "@/lib/api/auth";
import type { ServiceClient } from "@/lib/supabase/service";

import { syncTransactionsPage, type PlaidFailure, type PlaidTransaction } from "./client";
import type { PlaidConfig } from "./config";
import type { StoreResult } from "./store";

// A student's transactions for budgeting (US-14, the US-09 spec in #87):
// Plaid's Transactions Sync, saved through apply_plaid_transactions_sync()
// (supabase/migrations/20261106210000_plaid_transactions.sql), which keeps the
// last 180 days in the private plaid schema. Students only ever get monthly
// totals back. Logs carry kinds and counts, never an amount, a merchant or a
// transaction id. Merchant names are kept for our own recurring-bill
// detector; account ids tell card spending from debit spending.

// Sync pages are up to 500 transactions; 20 pages is far more than 180 days
// of a student's spending. The database refuses a sync that would keep more
// than 20 x 500 = 10,000 rows for one student (errcode 54000).
export const MAX_SYNC_PAGES = 20;

// Transactions posted before this many days ago are dropped here, before
// they reach the database, which skips them too and purges them daily.
export const KEEP_DAYS = 180;

const CATEGORY = /^[A-Z_]{1,64}$/;
const CATEGORY_DETAILED = /^[A-Z_]{1,100}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The oldest posted date kept, as YYYY-MM-DD: KEEP_DAYS before today in UTC,
// the database's current_date - 180.
export function oldestKeptDate(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - KEEP_DAYS)).toISOString().slice(0, 10);
}

// One row as the database function takes it. Only these fields are kept.
export type StoredTransaction = {
  transaction_id: string;
  account_id: string;
  posted_on: string;
  amount_cents: number;
  pending: boolean;
  category: string | null;
  category_detailed: string | null;
  merchant_name: string | null;
};

// Plaid's transaction as Cense keeps it, or null for one it does not keep: in
// a currency other than dollars, without a usable date, or posted before
// oldestKept (oldestKeptDate()).
export function toStoredTransaction(transaction: PlaidTransaction, oldestKept: string): StoredTransaction | null {
  if (transaction.iso_currency_code !== "USD" || !DATE.test(transaction.date)) return null;
  if (transaction.date < oldestKept) return null;
  const category = transaction.personal_finance_category ?? null;
  // By character, not UTF-16 unit, so a cut never splits an emoji into a
  // lone surrogate (Postgres refuses it and the whole sync would fail).
  const merchant = Array.from(transaction.merchant_name?.trim() ?? "").slice(0, 100).join("");
  return {
    transaction_id: transaction.transaction_id,
    account_id: transaction.account_id,
    posted_on: transaction.date,
    // Plaid's sign: positive is money out, negative is money in
    amount_cents: Math.round(transaction.amount * 100),
    pending: transaction.pending,
    category: category && CATEGORY.test(category.primary) ? category.primary : null,
    category_detailed: category && CATEGORY_DETAILED.test(category.detailed) ? category.detailed : null,
    merchant_name: merchant === "" ? null : merchant,
  };
}

export type SyncOutcome =
  | { kind: "synced"; saved: number; removed: number }
  // The bank was disconnected while Plaid answered.
  | { kind: "not_linked" }
  | { kind: "plaid"; failure: PlaidFailure }
  | { kind: "too_many_pages" }
  | { kind: "database"; code: string | null };

const MUTATION = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

// Reads every page since the student's saved cursor, then saves them all at
// once with the new cursor, so a half-read sync is never saved. If Plaid's
// data changes mid-way, it starts again from the saved cursor (once).
export async function syncStudentTransactions(
  student: Student,
  config: PlaidConfig,
  accessToken: string,
  now: Date = new Date(),
): Promise<SyncOutcome> {
  const saved = await student.supabase.rpc("plaid_transactions_cursor");
  if (saved.error) return { kind: "database", code: saved.error.code ?? null };
  const start = (saved.data as string | null) || null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const added: PlaidTransaction[] = [];
    const modified: PlaidTransaction[] = [];
    const removed: string[] = [];
    let cursor = start;
    let restart = false;

    for (let page = 0; ; page += 1) {
      if (page === MAX_SYNC_PAGES) return { kind: "too_many_pages" };
      const result = await syncTransactionsPage(config, accessToken, cursor);
      if (!result.ok) {
        if (result.kind === "plaid" && result.code === MUTATION) {
          restart = true;
          break;
        }
        return { kind: "plaid", failure: result };
      }
      added.push(...result.data.added);
      modified.push(...result.data.modified);
      removed.push(...result.data.removed.map((entry) => entry.transaction_id));
      cursor = result.data.next_cursor;
      if (!result.data.has_more) break;
    }
    if (restart) continue;

    const oldestKept = oldestKeptDate(now);
    const keep = (list: PlaidTransaction[]) => list.map((transaction) => toStoredTransaction(transaction, oldestKept)).filter((row) => row !== null);
    const rows = { added: keep(added), modified: keep(modified) };
    const { data, error } = await student.supabase.rpc("apply_plaid_transactions_sync", {
      p_added: rows.added,
      p_modified: rows.modified,
      p_removed: removed,
      p_cursor: cursor ?? "",
    });
    if (error) return { kind: "database", code: error.code ?? null };
    if (data !== true) return { kind: "not_linked" };
    return { kind: "synced", saved: rows.added.length + rows.modified.length, removed: removed.length };
  }
  return { kind: "plaid", failure: { ok: false, kind: "plaid", code: MUTATION } };
}

// The daily purge (US-14): deletes every student's transactions older than
// 180 days, including students who stopped syncing. Run by the daily cron with the
// service role. Never throws; a failure logs only the database's code.
export async function purgeOldTransactions(service: ServiceClient): Promise<{ ok: true; deleted: number } | { ok: false; code: string | null }> {
  try {
    const { data, error } = await service.rpc("purge_old_plaid_transactions");
    if (error) {
      console.error(JSON.stringify({ event: "plaid_purge_failed", code: error.code ?? null }));
      return { ok: false, code: error.code ?? null };
    }
    return { ok: true, deleted: typeof data === "number" ? data : 0 };
  } catch {
    console.error(JSON.stringify({ event: "plaid_purge_failed", code: null }));
    return { ok: false, code: null };
  }
}

export type CategorySpending = { month: string; category: string; spentCents: number; transactionCount: number };
export type MonthIncome = { month: string; incomeCents: number; transactionCount: number };
export type Spending = { byCategory: CategorySpending[]; income: MonthIncome[] };

// The student's posted spending by Plaid category and income by month, for
// this month and up to two before it. Totals only.
export async function loadSpending(student: Student, months = 3): Promise<StoreResult<Spending>> {
  const [spending, income] = await Promise.all([
    student.supabase.rpc("spending_by_category", { p_months: months }),
    student.supabase.rpc("income_by_month", { p_months: months }),
  ]);
  const error = spending.error ?? income.error;
  if (error) return { ok: false, error };
  type SpendingRow = { month: string; category: string; spent_cents: number | string; transaction_count: number };
  type IncomeRow = { month: string; income_cents: number | string; transaction_count: number };
  return {
    ok: true,
    value: {
      byCategory: ((spending.data ?? []) as SpendingRow[]).map((row) => ({
        month: row.month,
        category: row.category,
        spentCents: Number(row.spent_cents),
        transactionCount: row.transaction_count,
      })),
      income: ((income.data ?? []) as IncomeRow[]).map((row) => ({
        month: row.month,
        incomeCents: Number(row.income_cents),
        transactionCount: row.transaction_count,
      })),
    },
  };
}
