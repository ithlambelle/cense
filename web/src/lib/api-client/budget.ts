// Created with Claude Code (2026-11-13). The browser's side of Your money's
// This month tab (US-12). Every call goes through the app's own API.
import type { paths } from "../../../../api/openapi";
import { apiRequest } from "./client";
import { runOutcome } from "./safe-to-spend";

export type BudgetLineKey = paths["/budget/lines/{line}"]["put"]["parameters"]["path"]["line"];

// The student's own monthly number for one line, in place of the bank's.
export function saveBudgetLine(line: BudgetLineKey, amountCents: number) {
  return runOutcome(apiRequest("put", "/budget/lines/{line}", { pathParams: { line }, body: { amountCents } }));
}

// Back to the bank's number for one line: the student's own is deleted.
export function deleteBudgetLine(line: BudgetLineKey) {
  return runOutcome(apiRequest("delete", "/budget/lines/{line}", { pathParams: { line } }));
}
