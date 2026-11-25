import "server-only";

import type { Student } from "@/lib/api/auth";

import { plaidConfig } from "./config";
import { linkAccess } from "./pilot";

// Created with Claude Code (2026-11-25). Whether a screen may offer this
// student Link: always in the sandbox, and in production only to a pilot
// student with room left (lib/plaid/pilot.ts), so nobody is invited to link
// a bank the app would then refuse. Null when safe to spend is off. `sandbox`
// says which world it is, for the screens that tell the student so. Throws
// when the pilot cannot be read; Home catches it and leaves its invitation
// out.
export type BankOffer = { canLink: boolean; sandbox: boolean };

export async function bankOffer(student: Student): Promise<BankOffer | null> {
  const config = plaidConfig();
  if (!config) return null;
  const access = await linkAccess(student, config);
  if (!access.ok) throw new Error("Could not read the student's place in the bank pilot.");
  return { canLink: access.value === "open", sandbox: config.environment === "sandbox" };
}
