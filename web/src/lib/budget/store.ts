import "server-only";

import type { Student } from "@/lib/api/auth";
import type { Budget } from "@/lib/api/budget";
import type { StoreResult } from "@/lib/plaid/store";

import { CATEGORY_KEYS, type DetailedTotal } from "./categories";
import { buildBudgetLines, lastFullMonth, summarize, type LineKey } from "./lines";

// Every read and write behind Your money's This month tab, with the
// student's own session (supabase/migrations/20261113120000_your_money_budget.sql).

const LINE_KEYS = new Set<string>(["income", ...CATEGORY_KEYS]);

// The budget for the student's last full month. `setAsideCents` comes from
// their safe-to-spend answers, already read by the page.
export async function loadBudget(student: Student, setAsideCents: number, now: Date = new Date()): Promise<StoreResult<Budget>> {
  const month = lastFullMonth(now);
  const { supabase, studentId } = student;
  // Three months back, so the last full month is in the window whatever the
  // database's own date is at a month's edge.
  const [income, detailed, recent, typed] = await Promise.all([
    supabase.rpc("income_by_month", { p_months: 3 }),
    supabase.rpc("spending_by_detailed_category", { p_month: month }),
    supabase.rpc("spending_by_category", { p_months: 3 }),
    supabase.from("budget_amounts").select("line, amount_cents").eq("student_id", studentId),
  ]);
  const error = income.error ?? detailed.error ?? recent.error ?? typed.error;
  if (error) return { ok: false, error };

  type IncomeRow = { month: string; income_cents: number | string };
  type DetailedRow = { category: string | null; category_detailed: string | null; out_cents: number | string; in_cents: number | string };
  type TypedRow = { line: string; amount_cents: number | string };
  const incomeRows = (income.data ?? []) as IncomeRow[];
  const detailedRows = (detailed.data ?? []) as DetailedRow[];
  const monthIncome = incomeRows.find((row) => row.month === month);
  const totals: DetailedTotal[] = detailedRows.map((row) => ({
    category: row.category,
    categoryDetailed: row.category_detailed,
    outCents: Number(row.out_cents),
    inCents: Number(row.in_cents),
  }));
  const typedAmounts: Partial<Record<LineKey, number>> = {};
  for (const row of (typed.data ?? []) as TypedRow[]) {
    if (LINE_KEYS.has(row.line)) typedAmounts[row.line as LineKey] = Number(row.amount_cents);
  }
  const lines = buildBudgetLines({
    month,
    incomeCents: monthIncome ? Number(monthIncome.income_cents) : null,
    totals,
    typed: typedAmounts,
    setAsideCents,
    hasBankData: incomeRows.length > 0 || detailedRows.length > 0 || ((recent.data ?? []) as unknown[]).length > 0,
  });
  return { ok: true, value: { ...lines, ...summarize(lines) } };
}

// Saves the student's own number for one line. False when they have no
// linked bank (the row needs one: foreign_key_violation).
export async function saveBudgetLine(student: Student, line: LineKey, amountCents: number): Promise<StoreResult<boolean>> {
  const { error } = await student.supabase
    .from("budget_amounts")
    .upsert({ student_id: student.studentId, line, amount_cents: amountCents, updated_at: new Date().toISOString() }, { onConflict: "student_id,line" });
  if (error?.code === "23503") return { ok: true, value: false };
  if (error) return { ok: false, error };
  return { ok: true, value: true };
}

// Deletes the student's own number for one line, so it follows the bank's
// again. Deleting a line with no row is not an error.
export async function deleteBudgetLine(student: Student, line: LineKey): Promise<StoreResult<null>> {
  const { error } = await student.supabase.from("budget_amounts").delete().eq("student_id", student.studentId).eq("line", line);
  if (error) return { ok: false, error };
  return { ok: true, value: null };
}
