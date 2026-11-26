import "server-only";

import type { Student } from "@/lib/api/auth";

import { plaidConfig } from "./config";
import { linkAccess } from "./pilot";

// Created with Claude Code (2026-11-25). What a screen may offer this student:
// a new link (canLink) always in the sandbox, and in production only to a
// pilot student with room left (lib/plaid/pilot.ts), so nobody is invited to
// link a bank the app would then refuse; signing in again to the bank already
// linked (canUpdate, Plaid's update mode) to anyone still in the pilot. Null
// when safe to spend is off. `sandbox` says which world it is, for the
// screens that tell the student so. When the pilot cannot be read it offers
// nothing and logs plaid_pilot_read_failed, so a first sign-in or Accounts
// never fails on it.
export type BankOffer = { canLink: boolean; canUpdate: boolean; sandbox: boolean };

export async function bankOffer(student: Student): Promise<BankOffer | null> {
  const config = plaidConfig();
  if (!config) return null;
  const sandbox = config.environment === "sandbox";
  const access = await linkAccess(student, config);
  if (!access.ok) {
    console.error(JSON.stringify({ event: "plaid_pilot_read_failed", code: access.error.code ?? null }));
    return { canLink: false, canUpdate: false, sandbox };
  }
  return { canLink: access.value === "open", canUpdate: access.value !== "none", sandbox };
}
