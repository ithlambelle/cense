import "server-only";

import type { Student } from "@/lib/api/auth";

import type { PlaidConfig } from "./config";
import type { StoreResult } from "./store";

// Created with Claude Code (2026-11-25). The production pilot's limits
// (supabase/migrations/20261125120000_plaid_pilot.sql): only students on the
// allowlist may link a real bank, each within their own allowance, and the
// app never makes more production Items than the budget the team set. Every
// number lives in the database, set by hand, so nothing the browser sends can
// change them. In the sandbox everything is open without asking the
// database: everyone may link a test bank, and test Items are free. Every
// call uses the student's own session, like the rest of lib/plaid.

// "open": may link a new bank. "full": in the pilot, but no new bank (their
// allowance or the budget is used; signing in to a bank already linked still
// works). "none": not in the pilot, so no Link at all.
export type LinkAccess = "open" | "full" | "none";

export async function linkAccess(student: Student, config: PlaidConfig): Promise<StoreResult<LinkAccess>> {
  if (config.environment === "sandbox") return { ok: true, value: "open" };
  const { data, error } = await student.supabase.rpc("plaid_pilot_access");
  if (error) return { ok: false, error };
  return { ok: true, value: data === "open" || data === "full" ? data : "none" };
}

// Takes one slot right before a public token exchange; false when the
// student's allowance or the budget is used up. A slot is never given back,
// even when the exchange then fails: Plaid counts every production access
// token, so losing a slot is the safe mistake and going over the limit is not.
export async function claimItemSlot(student: Student, config: PlaidConfig): Promise<StoreResult<boolean>> {
  if (config.environment === "sandbox") return { ok: true, value: true };
  const { data, error } = await student.supabase.rpc("claim_plaid_item_slot");
  if (error) return { ok: false, error };
  return { ok: true, value: data === true };
}
