-- Created with Claude Code (2026-11-15). Undoes
-- 20261113120000_your_money_budget.sql: removes spending_by_detailed_category()
-- and public.budget_amounts. The numbers students typed over the bank's on
-- This month are deleted with the table. Undo
-- 20261114120000_income_counts_family_money.sql first.
drop function if exists public.spending_by_detailed_category(date);
drop table if exists public.budget_amounts;
