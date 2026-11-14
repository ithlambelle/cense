import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { MAX_AMOUNT_CENTS } from "@/lib/budget/amount";
import { CATEGORY_KEYS } from "@/lib/budget/categories";

extendZodWithOpenApi(z);

// Your money, This month (US-12): the budget from the student's own stored
// transactions and the numbers they typed. Totals only: never a transaction,
// a merchant or an account.

// The lines a student can type a number for. Saving is the safe-to-spend
// set-aside, saved through PUT /safe-to-spend/answers.
export const budgetLineKeySchema = z.enum(["income", ...CATEGORY_KEYS] as [string, ...string[]]);

export const budgetLineSchema = z
  .strictObject({
    key: z.string(),
    label: z.string(),
    group: z.enum(["income", "need", "want", "saving"]),
    amountCents: z.int(),
    // The bank's number for the line; null when the bank has none.
    bankCents: z.int().nullable(),
    // True when the student typed the number (saving always is).
    typed: z.boolean(),
    // fixed or changing, once the recurring detector says; null until then.
    recurrence: z.enum(["recurring", "variable"]).nullable(),
  })
  .openapi("BudgetLine");

export const budgetSchema = z
  .strictObject({
    // The month the bank numbers are from (the last full calendar month).
    month: z.iso.date(),
    // False until any transaction has arrived from the bank.
    hasBankData: z.boolean(),
    income: budgetLineSchema,
    needs: z.array(budgetLineSchema),
    wants: z.array(budgetLineSchema),
    saving: budgetLineSchema,
    // Left over each month; below zero when short.
    remainingCents: z.int(),
    shortfallCents: z.int(),
    // True only when needs and fixed wants alone are more than income.
    fixedOverIncome: z.boolean(),
  })
  .openapi("Budget");

export const saveBudgetLineSchema = z.strictObject({
  amountCents: z.int().min(0).max(MAX_AMOUNT_CENTS),
});

export type Budget = z.infer<typeof budgetSchema>;
